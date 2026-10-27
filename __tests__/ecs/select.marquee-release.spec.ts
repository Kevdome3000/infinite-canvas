import { Pen, type API, type SerializedNode } from '../../packages/ecs/src';
import { createSelectionWorld } from '../helpers/ecs-selection';

let world: Awaited<ReturnType<typeof createSelectionWorld>>;
let api: API;
const rect = (id: string, x: number, y: number): SerializedNode => ({
  id,
  type: 'rect',
  x,
  y,
  width: 180,
  height: 100,
  zIndex: 0,
});
const scene: SerializedNode[] = [
  rect('root', 370, 198),
  rect('root2', 460, 248),
  rect('other', 850, 234),
  {
    ...rect('frame', 1592.24951171875, 56.75042724609375),
    width: 300,
    height: 240,
    metadata: { cardType: 'frame' },
    zIndex: 4,
  },
  { ...rect('child', 0, 0), parentId: 'frame' },
  { id: 'group', type: 'g', x: 1372, y: 292, zIndex: 3 },
  ...Array.from({ length: 9 }, (_, i) => ({
    ...rect('group-child-' + i, 40 + i * 65, 40),
    parentId: 'group',
    zIndex: i,
  })),
];
beforeAll(async () => {
  world = await createSelectionWorld();
  [api] = world.apis;
});
afterAll(async () => {
  await world.dispose();
});
beforeEach(async () => {
  await world.reset(api, scene);
  await world.edit(
    api,
    (editor) => {
      editor.resizeCanvas(2200, 1100);
      editor.setAppState({
        penbarSelected: Pen.SELECT,
        cameraX: 220.2493896484375,
        cameraY: -235.24960327148438,
        cameraZoom: 1,
      });
    },
    'NEVER',
  );
  await world.frames();
});
afterEach(async () => {
  await world.pointer(api, 'pointerup', 0, 0);
  await world.key(api, 'Escape');
});
const point = (x: number, y: number) => api.canvas2Viewport({ x, y });

it.each(
  [0, 1].flatMap((buttons) =>
    ['separate', 'move-up', 'all', 'stale'].map((timing) => ({
      buttons,
      timing,
    })),
  ),
)('uses the final marquee endpoint: %j', async ({ buttons, timing }) => {
  const start = point(320, -37),
    end = point(2250, 865),
    middle = point(800, 300);
  const saved = JSON.parse(JSON.stringify(api.getNodes()));
  if (timing === 'all')
    world.dispatch(api, 'pointerdown', start.x, start.y, { buttons });
  else await world.pointer(api, 'pointerdown', start.x, start.y, { buttons });
  if (timing === 'stale')
    await world.pointer(api, 'pointermove', middle.x, middle.y, { buttons });
  if (timing === 'separate') {
    await world.pointer(api, 'pointermove', end.x, end.y, { buttons });
    await world.pointer(api, 'pointerup', end.x, end.y, { buttons: 0 });
  } else {
    world.dispatch(api, 'pointermove', end.x, end.y, { buttons });
    world.dispatch(api, 'pointerup', end.x, end.y, { buttons: 0 });
    await world.frames();
  }
  expect(api.getAppState().layersSelected.slice().sort()).toEqual(
    ['root', 'root2', 'other', 'frame', 'group'].sort(),
  );
  expect(JSON.parse(JSON.stringify(api.getNodes()))).toEqual(saved);
  expect(api.isUndoStackEmpty()).toBe(true);
});

it.each(
  [0, 1].flatMap((buttons) =>
    ['pointercancel', 'Escape', 'tool-change'].map((interruption) => ({
      buttons,
      interruption,
    })),
  ),
)(
  'does not finish pending marquee after interruption: %j',
  async ({ buttons, interruption }) => {
    const start = point(320, -37),
      middle = point(800, 300),
      end = point(2250, 865);
    await world.pointer(api, 'pointerdown', start.x, start.y, { buttons });
    await world.pointer(api, 'pointermove', middle.x, middle.y, { buttons });
    const partial = api.getAppState().layersSelected.slice().sort();
    expect(partial).toEqual(['root', 'root2']);
    world.dispatch(api, 'pointermove', end.x, end.y, { buttons });
    if (interruption === 'pointercancel')
      world.dispatch(api, 'pointercancel', end.x, end.y, { buttons: 0 });
    else if (interruption === 'Escape') await world.key(api, 'Escape');
    else {
      api.setAppState({ penbarSelected: Pen.HAND });
      await world.frames();
    }
    world.dispatch(api, 'pointerup', end.x, end.y, { buttons: 0 });
    await world.frames();
    if (interruption === 'tool-change') {
      api.setAppState({ penbarSelected: Pen.SELECT });
      await world.frames();
    }
    expect(api.getAppState().layersSelected.slice().sort()).toEqual(
      interruption === 'pointercancel' ? partial : [],
    );
    expect(api.isUndoStackEmpty()).toBe(true);
  },
);

it('does not reuse an old marquee for a click below the brush threshold', async () => {
  const start = point(320, -37),
    end = point(2250, 865);
  await world.pointer(api, 'pointerdown', start.x, start.y, { buttons: 1 });
  await world.pointer(api, 'pointermove', end.x, end.y, { buttons: 1 });
  await world.pointer(api, 'pointerup', end.x, end.y, { buttons: 0 });
  expect(api.getAppState().layersSelected).toHaveLength(5);
  world.dispatch(api, 'pointerdown', start.x, start.y, { buttons: 1 });
  world.dispatch(api, 'pointerup', start.x + 3, start.y + 3, { buttons: 0 });
  await world.frames();
  expect(api.getAppState().layersSelected).toEqual([]);
  expect(api.isUndoStackEmpty()).toBe(true);
});
