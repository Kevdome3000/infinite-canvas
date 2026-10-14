import { App, DOMAdapter } from '../../packages/ecs/src';
import { NodeJSAdapter, createMouseEvent } from '../utils';

/** Own the render loop so input cannot race an automatic ECS frame. */
export function createECSInteraction() {
  const previousAdapter = DOMAdapter.get();
  DOMAdapter.set({
    ...NodeJSAdapter,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  });
  const app = new App();
  const frames = async (count = 2) => {
    for (let i = 0; i < count; i++) await app.world.execute();
  };

  return {
    app,
    frames,
    async mouse(
      canvas: HTMLCanvasElement,
      type: string,
      x: number,
      y: number,
      time?: number,
    ) {
      // Double-click timing belongs to event dispatch, not slow GPU frames.
      // Restore the real clock before executing systems or measuring performance.
      const clock =
        time === undefined
          ? undefined
          : jest.spyOn(performance, 'now').mockReturnValue(time);
      try {
        // Match EventWriter's capability detection. Modern JSDOM exposes
        // PointerEvent, so mouse events do not reach its pointer listeners.
        const window = NodeJSAdapter.getWindow();
        const event = window.PointerEvent
          ? new window.PointerEvent(type.replace(/^mouse/, 'pointer'), {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              button: 0,
              buttons: type === 'mouseup' ? 0 : 1,
              clientX: x,
              clientY: y,
            })
          : createMouseEvent(type, { clientX: x, clientY: y });
        canvas.dispatchEvent(event);
      } finally {
        clock?.mockRestore();
      }
      await frames();
    },
    async dispose() {
      try {
        await app.exit();
      } finally {
        DOMAdapter.set(previousAdapter);
      }
    },
  };
}
