import { Children, Pen, type API } from '../../packages/ecs/src';
import { createSelectionWorld } from '../helpers/ecs-selection';

let world: Awaited<ReturnType<typeof createSelectionWorld>>;
let api: API;
beforeAll(async () => {
  world = await createSelectionWorld();
  [api] = world.apis;
});
afterAll(async () => {
  await world?.dispose();
});

it('keeps frame membership, selection and save state after copied shape release history', async () => {
  api.setAppState({ penbarSelected: Pen.SELECT });
  await world.reset(api, [
    {
      id: 'original',
      type: 'rect',
      x: 30,
      y: 30,
      width: 20,
      height: 20,
      zIndex: 0,
    },
    {
      id: 'frame',
      type: 'rect',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      zIndex: 1,
      metadata: { cardType: 'frame' },
    },
    { id: 'group', type: 'g', x: 220, y: 100, zIndex: 2 },
    {
      id: 'group-child',
      type: 'rect',
      parentId: 'group',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      zIndex: 0,
    },
  ]);
  const copied = api.cloneNodes([api.getNodeById('original')]);
  const id = copied[0].id;
  await world.edit(api, (editor) => editor.updateNodes(copied));
  await world.edit(api, (editor) =>
    editor.updateNode(editor.getNodeById(id), {
      parentId: 'frame',
      x: 10,
      y: 10,
    }),
  );
  await world.edit(api, (editor) =>
    editor.updateNode(editor.getNodeById(id), {
      parentId: undefined,
      x: 260,
      y: 30,
    }),
  );
  await world.history(api, 'undo');
  await world.history(api, 'redo');
  await world.history(api, 'undo');
  await world.frames();
  expect(api.getNodeById(id)).toMatchObject({
    parentId: 'frame',
    x: 10,
    y: 10,
  });
  expect(api.getEntity(api.getNodeById(id)).read(Children).parent).toBe(
    api.getEntity(api.getNodeById('frame')),
  );
  const saved = JSON.parse(JSON.stringify(api.getNodes()));
  // Retained canvas note return preserves the engine, then the user marquee selects.
  await world.pointer(api, 'pointerdown', 5, 5, { buttons: 1 });
  await world.pointer(api, 'pointermove', 295, 195, { buttons: 1 });
  await world.pointer(api, 'pointerup', 295, 195, { buttons: 0 });
  expect(api.getAppState().layersSelected.sort()).toEqual(
    ['original', 'frame', 'group'].sort(),
  );
  expect(JSON.parse(JSON.stringify(api.getNodes()))).toEqual(saved);
  await world.reset(api, saved);
  await world.frames();
  expect(api.getNodeById(id)).toMatchObject({
    parentId: 'frame',
    x: 10,
    y: 10,
  });
});
