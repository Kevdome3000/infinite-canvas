import { ComputedCamera, DOMAdapter, type API } from '../../packages/ecs/src';
import { createDocumentWorld } from '../helpers/ecs-document';

let world: Awaited<ReturnType<typeof createDocumentWorld>>;
let api: API;
let adapter: ReturnType<typeof DOMAdapter.get>;
let nextId = 1;
const callbacks = new Map<number, FrameRequestCallback>();

beforeAll(async () => {
  world = await createDocumentWorld();
  [api] = world.apis;
  adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    requestAnimationFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      callbacks.delete(id);
    },
  });
});

beforeEach(async () => {
  callbacks.clear();
  await world.edit(
    api,
    (editor) =>
      editor.gotoLandmark(
        { x: 0, y: 0, zoom: 1, rotation: 0 },
        { duration: 0 },
      ),
    'NEVER',
  );
  await world.frame();
});

afterAll(async () => {
  DOMAdapter.set(adapter);
  await world?.dispose();
});

async function advance(timestamp: number) {
  const next = callbacks.entries().next().value;
  if (!next) throw new Error('Expected a scheduled camera frame');
  const [id, callback] = next;
  callbacks.delete(id);
  await world.edit(api, () => callback(timestamp), 'NEVER');
  await world.frame();
}

function expectCamera(x: number, y: number, zoom: number) {
  const camera = api.getCamera().read(ComputedCamera);
  expect(camera.x).toBeCloseTo(x, 3);
  expect(camera.y).toBeCloseTo(y, 3);
  expect(camera.zoom).toBeCloseTo(zoom, 3);
}

it('interpolates linearly from the starting landmark at every frame', async () => {
  const progress: number[] = [];
  const finished = jest.fn();
  await world.edit(api, (editor) => {
    editor.gotoLandmark(
      { x: 100, y: 50, zoom: 2 },
      {
        duration: 100,
        easing: 'linear',
        onframe: (t) => progress.push(t),
        onfinish: finished,
      },
    );
  });

  await advance(1000);
  expectCamera(0, 0, 1);
  await advance(1050);
  expectCamera(50, 25, 1.5);
  await advance(1075);
  expectCamera(75, 37.5, 1.75);
  await advance(1100);
  expectCamera(100, 50, 2);
  expect(progress).toEqual([0, 0.5, 0.75]);
  expect(finished).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

it('animates zoom without a position change', async () => {
  const finished = jest.fn();
  await world.edit(api, (editor) => {
    editor.gotoLandmark({ zoom: 2 }, { duration: 100, onfinish: finished });
  });

  await advance(1000);
  expectCamera(0, 0, 1);
  expect(finished).not.toHaveBeenCalled();
  await advance(1050);
  expectCamera(0, 0, 1.5);
  await advance(1100);
  expectCamera(0, 0, 2);
  expect(finished).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

it('restarts from the current camera and cancels the previous animation', async () => {
  const previousFinish = jest.fn();
  const nextFinish = jest.fn();
  await world.edit(api, (editor) => {
    editor.gotoLandmark(
      { x: 100 },
      { duration: 100, onfinish: previousFinish },
    );
  });
  await advance(1000);
  await advance(1050);
  expectCamera(50, 0, 1);

  await world.edit(api, (editor) => {
    editor.gotoLandmark({ x: 200 }, { duration: 100, onfinish: nextFinish });
  });
  expect(callbacks.size).toBe(1);
  await advance(2000);
  await advance(2050);
  expectCamera(125, 0, 1);
  await advance(2100);
  expectCamera(200, 0, 1);
  expect(previousFinish).not.toHaveBeenCalled();
  expect(nextFinish).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

it('applies an immediate landmark and cancels a pending animation', async () => {
  const pendingFinish = jest.fn();
  const immediateFinish = jest.fn();
  await world.edit(api, (editor) => {
    editor.gotoLandmark({ x: 100 }, { duration: 100, onfinish: pendingFinish });
    editor.gotoLandmark(
      { x: 20, y: -10, zoom: 1.5 },
      { duration: 0, onfinish: immediateFinish },
    );
  });
  await world.frame();

  expectCamera(20, -10, 1.5);
  expect(callbacks.size).toBe(0);
  expect(pendingFinish).not.toHaveBeenCalled();
  expect(immediateFinish).toHaveBeenCalledTimes(1);
});

// Exercise public framing against the real scene index, not mocked bounds.
it('fits the complete rectangular scene and fills the viewport around the same center', async () => {
  await world.reset(api, [{
    id: 'framing-rect', type: 'rect', x: 50, y: 75, width: 100, height: 50,
    fills: [{ type: 'solid', value: 'black' }],
  }]);
  try {
    await world.frame();
    await world.edit(api, (editor) => editor.fitToScreen({ duration: 0 }), 'NEVER');
    await world.frame();
    expectCamera(50, 50, 2);
    // Fitting leaves vertical margin; filling instead crops the wider axis.
    await world.edit(api, (editor) => editor.fillScreen({ duration: 0 }), 'NEVER');
    await world.frame();
    expectCamera(75, 75, 4);
    expect(api.getNodeById('framing-rect')).toMatchObject({ x: 50, y: 75, width: 100, height: 50 });
  } finally {
    await world.reset(api, []);
  }
});

it('keeps an empty scene camera unchanged when fitting or filling', async () => {
  await world.reset(api, []);
  await world.frame();
  await world.edit(api, (editor) => {
    editor.gotoLandmark({ x: 12, y: -8, zoom: 1.5 }, { duration: 0 });
  }, 'NEVER');
  await world.frame();
  await world.edit(api, (editor) => {
    editor.fitToScreen({ duration: 0 });
    editor.fillScreen({ duration: 0 });
  }, 'NEVER');
  await world.frame();
  expectCamera(12, -8, 1.5);
  expect(callbacks.size).toBe(0);
});

it('zooms around the viewport center without moving that world-space anchor', async () => {
  await world.edit(api, (editor) => editor.zoomTo(2, { duration: 0 }), 'NEVER');
  await world.frame();
  expectCamera(50, 50, 2);
  const camera = api.getCamera().read(ComputedCamera);
  expect(camera.x + 100 / camera.zoom).toBeCloseTo(100);
  expect(camera.y + 100 / camera.zoom).toBeCloseTo(100);
  expect(callbacks.size).toBe(0);
});
