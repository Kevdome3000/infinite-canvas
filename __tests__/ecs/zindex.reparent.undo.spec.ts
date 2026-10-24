import { FractionalIndex } from '../../packages/ecs/src';
import { createDocumentWorld } from '../helpers/ecs-document';

let world: Awaited<ReturnType<typeof createDocumentWorld>>;
beforeAll(async () => {
  world = await createDocumentWorld();
});
afterAll(async () => {
  await world.dispose();
});

it.each([false, true])(
  'preserves order and geometry through reparent Undo/Redo (copied=%s)',
  async (copied) => {
    const [api] = world.apis;
    await world.reset(api, [
      {
        id: 'frame',
        type: 'rect',
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        zIndex: 0,
      },
      {
        id: 'original',
        type: 'rect',
        x: 306,
        y: 567,
        width: 100,
        height: 80,
        zIndex: 1,
      },
    ]);
    let id = 'original';
    if (copied) {
      const nodes = api.cloneNodes([api.getNodeById(id)]);
      id = nodes[0].id;
      await world.edit(api, (editor) => editor.updateNodes(nodes));
    }
    const before = { ...api.getNodeById(id) };
    // The integration's membership callback keeps the world position while
    // converting a root shape to frame-local coordinates before history capture.
    await world.edit(api, (editor) =>
      editor.updateNode(editor.getNodeById(id), {
        parentId: 'frame',
        x: 50,
        y: 60,
      }),
    );
    await world.history(api, 'undo');
    expect(api.getNodeById(id)).toMatchObject({ x: before.x, y: before.y });
    expect(api.getNodeById(id).parentId).toBeUndefined();
    await world.history(api, 'redo');
    expect(api.getNodeById(id)).toMatchObject({
      parentId: 'frame',
      x: 50,
      y: 60,
    });
    if (copied)
      expect(api.getNodeById('original')).toMatchObject({ x: 306, y: 567 });
  },
);

it('reconciles a moved subtree without changing unrelated keys, including same-frame deletion', async () => {
  const [api] = world.apis;
  await world.reset(api, [
    {
      id: 'frame',
      type: 'rect',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      zIndex: 0,
    },
    {
      id: 'group',
      type: 'rect',
      x: 400,
      y: 400,
      width: 100,
      height: 80,
      zIndex: 1,
    },
    {
      id: 'nested',
      type: 'rect',
      parentId: 'group',
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      zIndex: 0,
    },
    {
      id: 'stable',
      type: 'rect',
      x: 700,
      y: 500,
      width: 20,
      height: 20,
      zIndex: 3,
    },
    {
      id: 'removed',
      type: 'rect',
      x: 800,
      y: 500,
      width: 20,
      height: 20,
      zIndex: 4,
    },
  ]);
  const stableKey = () =>
    api.getEntity(api.getNodeById('stable')).read(FractionalIndex).value;
  const key = stableKey();
  await world.edit(api, (editor) => {
    editor.updateNode(editor.getNodeById('group'), {
      parentId: 'frame',
      x: 50,
      y: 60,
    });
  });
  expect(stableKey()).toBe(key);
  expect(api.getNodeById('nested')).toMatchObject({
    parentId: 'group',
    x: 10,
    y: 10,
  });
  await world.history(api, 'undo');
  expect(api.getNodeById('group')).toMatchObject({ x: 400, y: 400 });
  expect(api.getNodeById('group').parentId).toBeUndefined();
  for (const id of ['frame', 'group', 'nested']) {
    expect(
      api.getEntity(api.getNodeById(id)).read(FractionalIndex).value <
        stableKey(),
    ).toBe(true);
  }
  await world.history(api, 'redo');
  expect(api.getNodeById('group')).toMatchObject({
    parentId: 'frame',
    x: 50,
    y: 60,
  });
  expect(api.getNodeById('nested')).toMatchObject({
    parentId: 'group',
    x: 10,
    y: 10,
  });
  for (const id of ['frame', 'group', 'nested']) {
    expect(
      api.getEntity(api.getNodeById(id)).read(FractionalIndex).value <
        stableKey(),
    ).toBe(true);
  }
  await world.edit(api, (editor) => {
    editor.updateNode(editor.getNodeById('group'), {
      parentId: undefined,
      x: 400,
      y: 400,
    });
    editor.deleteNodesById(['removed']);
  });
  await world.history(api, 'undo');
  expect(api.getNodeById('group')).toMatchObject({
    parentId: 'frame',
    x: 50,
    y: 60,
  });
  expect(api.getNodeById('removed').isDeleted).toBeFalsy();
  await world.history(api, 'redo');
  expect(api.getNodeById('group').parentId).toBeUndefined();
  expect(api.getNodeById('group')).toMatchObject({ x: 400, y: 400 });
});
