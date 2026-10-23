import { Canvas, Pen, type API } from '../../packages/ecs/src';
import { updateAndSelectNodes } from '../../packages/webcomponents/src/utils/common';
import { createSelectionWorld } from '../helpers/ecs-selection';

let world: Awaited<ReturnType<typeof createSelectionWorld>>;
let api: API;
beforeAll(async () => {
  world = await createSelectionWorld();
  [api] = world.apis;
});
afterAll(async () => { await world?.dispose(); });
beforeEach(async () => {
  api.setAppState({ penbarSelected: Pen.SELECT });
  await world.reset(api, [{ id: 'original', type: 'rect', x: 30, y: 30,
    width: 60, height: 40, zIndex: 0,
    fills: [{ type: 'solid', value: 'blue' }] }]);
  await world.frames();
});
afterEach(async () => {
  await world.pointer(api, 'pointerup', 150, 80);
  await world.key(api, 'Escape');
});

it.each(
  [false, true].flatMap((copied) =>
    [0, 1].flatMap((buttons) =>
      [false, true].map((batched) => ({ copied, buttons, batched })))),
)('preserves final displacement and history: %j', async ({ copied, buttons, batched }) => {
  let id = 'original';
  if (copied) {
    const nodes = api.cloneNodes([api.getNodeById(id)]);
    nodes[0].x = 40;
    nodes[0].y = 40;
    nodes[0].zIndex = 1;
    const pending = updateAndSelectNodes(api, api.getAppState(), nodes);
    await world.frames(3);
    await pending;
    await world.frames();
    id = nodes[0].id;
  }
  const { x, y } = api.getNodeById(id);
  const startX = x + 15;
  const startY = y + 10;
  await world.pointer(api, 'pointerdown', startX, startY, { buttons });
  expect(api.getAppState().layersSelected).toEqual([id]);
  if (batched) {
    world.dispatch(api, 'pointermove', startX + 30, startY + 10, { buttons });
    world.dispatch(api, 'pointerup', startX + 30, startY + 10, { buttons: 0 });
    await world.frames();
  } else {
    await world.pointer(api, 'pointermove', startX + 30, startY + 10, { buttons });
    await world.pointer(api, 'pointerup', startX + 30, startY + 10, { buttons: 0 });
  }
  expect(api.getNodeById(id)).toMatchObject({ x: x + 30, y: y + 10 });
  expect(api.getCanvas().read(Canvas).inputPoints).toHaveLength(0);
  if (copied) expect(api.getNodeById('original')).toMatchObject({ x: 30, y: 30 });
  await world.history(api, 'undo');
  expect(api.getNodeById(id)).toMatchObject({ x, y });
  await world.history(api, 'redo');
  expect(api.getNodeById(id)).toMatchObject({ x: x + 30, y: y + 10 });
});

it('applies only the remaining release displacement after earlier move frames', async () => {
  await world.pointer(api, 'pointerdown', 45, 40, { buttons: 1 });
  await world.pointer(api, 'pointermove', 55, 45, { buttons: 1 });
  expect(api.getNodeById('original')).toMatchObject({ x: 40, y: 35 });
  world.dispatch(api, 'pointermove', 65, 50, { buttons: 1 });
  world.dispatch(api, 'pointerup', 75, 50, { buttons: 0 });
  await world.frames();
  expect(api.getNodeById('original')).toMatchObject({ x: 60, y: 40 });
  await world.history(api, 'undo');
  expect(api.getNodeById('original')).toMatchObject({ x: 30, y: 30 });
  expect(api.isUndoStackEmpty()).toBe(true);
  await world.history(api, 'redo');
  expect(api.getNodeById('original')).toMatchObject({ x: 60, y: 40 });
});

it.each(['pointercancel', 'tool-change'] as const)(
  'does not revive pending movement after %s', async (interruption) => {
    await world.pointer(api, 'pointerdown', 45, 40, { buttons: 1 });
    world.dispatch(api, 'pointermove', 75, 50, { buttons: 1 });
    if (interruption === 'pointercancel') {
      world.dispatch(api, 'pointercancel', 75, 50, { buttons: 0 });
    } else {
      api.setAppState({ penbarSelected: Pen.HAND });
    }
    world.dispatch(api, 'pointerup', 75, 50, { buttons: 0 });
    await world.frames();
    expect(api.getNodeById('original')).toMatchObject({ x: 30, y: 30 });
    expect(api.getCanvas().read(Canvas).inputPoints).toHaveLength(0);
  },
);
