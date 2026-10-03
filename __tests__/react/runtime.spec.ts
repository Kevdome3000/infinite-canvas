import { createCanvasRuntime } from '../../packages/react/src/runtime';

const mockApps: { run: jest.Mock; exit: jest.Mock; addPlugins: jest.Mock }[] =
  [];
let mockStart: Promise<void>;
let mockExit: Promise<void>;

jest.mock(
  '@infinite-canvas-tutorial/ecs',
  () => ({
    DefaultPlugins: ['default-plugin'],
    App: class {
      run = jest.fn(() => mockStart);
      exit = jest.fn(() => mockExit);
      addPlugins = jest.fn(() => this);
      constructor() {
        mockApps.push(this);
      }
    },
  }),
  { virtual: true },
);
jest.mock(
  '@infinite-canvas-tutorial/webcomponents',
  () => ({ UIPlugin: 'ui-plugin' }),
  { virtual: true },
);
jest.mock('@infinite-canvas-tutorial/webcomponents/spectrum', () => ({}), {
  virtual: true,
});

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  mockApps.length = 0;
  mockStart = Promise.resolve();
  mockExit = Promise.resolve();
});

it('shares one startup and shuts down only after the last canvas releases', async () => {
  const plugin = jest.fn();
  const loadUI = jest.fn().mockResolvedValue(undefined);
  const runtime = createCanvasRuntime({ plugins: [plugin], loadUI });
  const left = runtime.acquire();
  const right = runtime.acquire();
  expect(left.ready).toBe(right.ready);
  await left.ready;
  expect(mockApps).toHaveLength(1);
  expect(loadUI).toHaveBeenCalledTimes(1);
  expect(mockApps[0].addPlugins).toHaveBeenCalledWith(
    'default-plugin',
    'ui-plugin',
    plugin,
  );
  left.release();
  left.release();
  await flush();
  expect(mockApps[0].exit).not.toHaveBeenCalled();
  right.release();
  await flush();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
});

it('reuses startup across StrictMode setup/cleanup/setup', async () => {
  const runtime = createCanvasRuntime();
  const first = runtime.acquire();
  first.release();
  const second = runtime.acquire();
  await second.ready;
  expect(mockApps).toHaveLength(1);
  expect(mockApps[0].exit).not.toHaveBeenCalled();
  second.release();
  await flush();
});

it('finishes initialization before exiting an early-unmounted App', async () => {
  let start!: () => void;
  mockStart = new Promise((resolve) => {
    start = resolve;
  });
  const runtime = createCanvasRuntime();
  const lease = runtime.acquire();
  await flush();
  lease.release();
  await flush();
  expect(mockApps[0].exit).not.toHaveBeenCalled();
  start();
  await lease.ready;
  await flush();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
});

it('waits for the previous App to exit before recreating it', async () => {
  let finishExit!: () => void;
  mockExit = new Promise((resolve) => {
    finishExit = resolve;
  });
  const runtime = createCanvasRuntime();
  const first = runtime.acquire();
  await first.ready;
  first.release();
  await flush();
  const second = runtime.acquire();
  await flush();
  expect(mockApps).toHaveLength(1);
  finishExit();
  await second.ready;
  expect(mockApps).toHaveLength(2);
  second.release();
  await flush();
});

it('rejects concurrent runtimes that would compete for global canvas queues', async () => {
  const first = createCanvasRuntime().acquire();
  await first.ready;
  const second = createCanvasRuntime().acquire();
  await expect(second.ready).rejects.toThrow('share the same CanvasRuntime');
  second.release();
  first.release();
  await flush();
});

it('can retry a failed UI load after releasing its lease', async () => {
  const loadUI = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const runtime = createCanvasRuntime({ loadUI });
  const first = runtime.acquire();
  await expect(first.ready).rejects.toThrow('offline');
  first.release();
  await flush();
  const retry = runtime.acquire();
  await retry.ready;
  expect(mockApps).toHaveLength(1);
  retry.release();
  await flush();
});

it('sets up once per App before readiness and disposes after committed stop', async () => {
  const dispose = jest.fn();
  const setup = jest.fn(
    (_app: unknown, _context: { signal: AbortSignal }) => dispose,
  );
  const runtime = createCanvasRuntime({ onAppReady: setup });
  const first = runtime.acquire();
  first.release();
  const second = runtime.acquire();
  const third = runtime.acquire();
  await second.ready;
  expect(setup).toHaveBeenCalledTimes(1);
  expect(setup.mock.calls[0][0]).toBe(mockApps[0]);
  const signal = setup.mock.calls[0][1].signal;
  second.release();
  await flush();
  expect(signal.aborted).toBe(false);
  third.release();
  await flush();
  expect(signal.aborted).toBe(true);
  expect(dispose).toHaveBeenCalledTimes(1);
  const next = runtime.acquire();
  await next.ready;
  expect(setup).toHaveBeenCalledTimes(2);
  expect(setup.mock.calls[1][1].signal).not.toBe(signal);
  next.release();
  await flush();
});

it('aborts immediately at real stop and retains setup until deferred exit settles', async () => {
  let finishExit!: () => void;
  mockExit = new Promise((resolve) => {
    finishExit = resolve;
  });
  const dispose = jest.fn();
  let signal!: AbortSignal;
  const runtime = createCanvasRuntime({
    onAppReady: (_app, context) => {
      signal = context.signal;
      return dispose;
    },
  });
  const lease = runtime.acquire();
  await lease.ready;
  lease.release();
  await flush();
  expect(signal.aborted).toBe(true);
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  expect(dispose).not.toHaveBeenCalled();
  finishExit();
  await flush();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('does not publish setup after release during startup', async () => {
  let finishStart!: () => void;
  mockStart = new Promise((resolve) => {
    finishStart = resolve;
  });
  const setup = jest.fn();
  const runtime = createCanvasRuntime({ onAppReady: setup });
  const lease = runtime.acquire();
  await flush();
  lease.release();
  await flush();
  finishStart();
  await lease.ready;
  await flush();
  expect(setup).not.toHaveBeenCalled();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
});

it('aborts partial setup and cleans a failed startup once without replacing its error', async () => {
  const original = new Error('setup failed');
  const exitError = new Error('exit failed');
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockExit = Promise.reject(exitError);
  void mockExit.catch(() => {});
  const partialCleanup = jest.fn();
  const runtime = createCanvasRuntime({
    onAppReady: (_app, { signal }) => {
      signal.addEventListener('abort', partialCleanup, { once: true });
      throw original;
    },
  });
  const lease = runtime.acquire();
  await expect(lease.ready).rejects.toBe(original);
  expect(partialCleanup).toHaveBeenCalledTimes(1);
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  lease.release();
  await flush();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('Canvas App cleanup failed', exitError);
  log.mockRestore();
});

it('rejects asynchronous setup contracts and exits the started App', async () => {
  const runtime = createCanvasRuntime({
    onAppReady: (() => Promise.resolve()) as never,
  });
  const lease = runtime.acquire();
  await expect(lease.ready).rejects.toThrow('synchronous');
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  lease.release();
  await flush();
});

it('disposes after exit failure and reports disposer failure separately', async () => {
  const exitError = new Error('exit failed');
  const disposeError = new Error('dispose failed');
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const dispose = jest.fn(() => {
    throw disposeError;
  });
  const runtime = createCanvasRuntime({ onAppReady: () => dispose });
  const lease = runtime.acquire();
  await lease.ready;
  mockExit = Promise.reject(exitError);
  void mockExit.catch(() => {});
  lease.release();
  await flush();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('Canvas App cleanup failed', exitError);
  expect(log).toHaveBeenCalledWith(
    'Canvas App setup cleanup failed',
    disposeError,
  );
  log.mockRestore();
});

it('cleans a rejected App startup before publishing its original failure', async () => {
  const failure = new Error('startup failed');
  mockStart = Promise.reject(failure);
  void mockStart.catch(() => {});
  const setup = jest.fn();
  const runtime = createCanvasRuntime({ onAppReady: setup });
  const lease = runtime.acquire();
  await expect(lease.ready).rejects.toBe(failure);
  expect(setup).not.toHaveBeenCalled();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  lease.release();
  await flush();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
});

it('rejects native async setup before it can install partial work', async () => {
  const setup = jest.fn();
  const runtime = createCanvasRuntime({
    onAppReady: (async () => {
      setup();
    }) as never,
  });
  const lease = runtime.acquire();
  await expect(lease.ready).rejects.toThrow('synchronous');
  expect(setup).not.toHaveBeenCalled();
  expect(mockApps[0].exit).toHaveBeenCalledTimes(1);
  lease.release();
  await flush();
});
