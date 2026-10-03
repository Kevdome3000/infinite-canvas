import type { App } from '@infinite-canvas-tutorial/ecs';

export type CanvasPlugin = Parameters<App['addPlugin']>[0];

export interface CanvasRuntimeOptions {
  /** Additional plugins, registered once per App startup. */
  plugins?: readonly CanvasPlugin[];
  /** Register optional plugin UI elements before mounting any canvas. */
  loadUI?: () => Promise<unknown>;
  /** Synchronous setup after App.run(), before canvas leases become ready.
   * The signal aborts when shutdown begins; cleanup runs after App.exit().
   * If setup throws after partial installation, clean up via the signal.
   */
  onAppReady?: (
    app: App,
    context: { signal: AbortSignal },
  ) => void | (() => void);
}

export interface CanvasRuntime {
  /** Acquire a shared App. Always release the lease after removing the canvas. */
  acquire(): { ready: Promise<void>; release: () => void };
}

// Web Components currently use global initialization queues. Only one runtime
// may own them at a time; multiple canvases should share that runtime.
let activeRuntime: CanvasRuntime | undefined;

interface AppGeneration {
  controller: AbortController;
  app?: App;
  dispose?: () => void;
  ready: Promise<void>;
  cleanup?: Promise<void>;
}

function cleanupApp(state: AppGeneration): Promise<void> {
  state.controller.abort();
  state.cleanup ??= (async () => {
    try {
      await state.app?.exit();
    } catch (error) {
      console.error('Canvas App cleanup failed', error);
    } finally {
      const dispose = state.dispose;
      state.dispose = undefined;
      state.app = undefined;
      try {
        dispose?.();
      } catch (error) {
        console.error('Canvas App setup cleanup failed', error);
      }
    }
  })();
  return state.cleanup;
}

/** Create outside render. Browser dependencies are loaded only on acquisition. */
export function createCanvasRuntime(
  options: CanvasRuntimeOptions = {},
): CanvasRuntime {
  const plugins = [...(options.plugins ?? [])];
  const loadUI = options.loadUI;
  let users = 0;
  const onAppReady = options.onAppReady;
  let current: AppGeneration | undefined;
  let stopping = Promise.resolve();
  let generation = 0;

  const runtime: CanvasRuntime = {
    acquire() {
      if (activeRuntime && activeRuntime !== runtime) {
        return {
          ready: Promise.reject(
            new Error('Mounted canvases must share the same CanvasRuntime.'),
          ),
          release() {},
        };
      }
      activeRuntime = runtime;
      users++;
      generation++;
      if (!current) {
        const state: AppGeneration = {
          controller: new AbortController(),
          ready: Promise.resolve(),
        };
        state.ready = stopping.then(async () => {
          try {
            const [{ App, DefaultPlugins }, { UIPlugin }] = await Promise.all([
              import('@infinite-canvas-tutorial/ecs'),
              import('@infinite-canvas-tutorial/webcomponents'),
            ]);
            await import('@infinite-canvas-tutorial/webcomponents/spectrum');
            await loadUI?.();
            state.app = new App().addPlugins(
              ...DefaultPlugins,
              UIPlugin,
              ...plugins,
            );
            await state.app.run();
            // A released startup must not publish a usable observer. The next
            // generation starts only after this App has finished shutting down.
            if (state.controller.signal.aborted) return;
            if (
              Object.prototype.toString.call(onAppReady) ===
              '[object AsyncFunction]'
            ) {
              throw new TypeError('Canvas App setup must be synchronous.');
            }
            const dispose = onAppReady?.(state.app, {
              signal: state.controller.signal,
            });
            if (
              dispose &&
              typeof (dispose as { then?: unknown }).then === 'function'
            ) {
              Promise.resolve(dispose).catch(() => {});
              throw new TypeError('Canvas App setup must be synchronous.');
            }
            if (dispose !== undefined && typeof dispose !== 'function') {
              throw new TypeError(
                'Canvas App setup must return a cleanup function or undefined.',
              );
            }
            state.dispose = dispose || undefined;
          } catch (error) {
            await cleanupApp(state);
            throw error;
          }
        });
        current = state;
      }
      const state = current;
      const ready = state.ready;
      let released = false;

      return {
        ready,
        release() {
          if (released) return;
          released = true;
          users--;
          const releaseGeneration = ++generation;
          // StrictMode's setup/cleanup/setup can reuse the pending startup.
          // Lit's disconnected cleanup runs before App.exit().
          queueMicrotask(() => {
            if (users || releaseGeneration !== generation) return;
            current = undefined;
            state.controller.abort();
            stopping = ready
              .catch(() => undefined)
              .then(() => cleanupApp(state))
              .finally(() => {
                if (!users && activeRuntime === runtime) {
                  activeRuntime = undefined;
                }
              });
          });
        },
      };
    },
  };
  return runtime;
}

export const defaultCanvasRuntime = createCanvasRuntime();
