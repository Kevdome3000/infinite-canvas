import {
  API,
  App,
  Commands,
  ComputeZIndex,
  DefaultPlugins,
  DefaultStateManagement,
  DOMAdapter,
  PreStartUp,
  System,
  system,
  Camera,
  Canvas,
  Children,
  FillLayers,
  GlobalTransform,
  Grid,
  Name,
  Opacity,
  Parent,
  Rect,
  Ellipse,
  HTML,
  HTMLContainer,
  ColumnLayout,
  Renderable,
  StrokeLayers,
  Stroke,
  Theme,
  Transform,
  Visibility,
  ZIndex,
  type SerializedNode,
} from '../../packages/ecs/src';

DOMAdapter.set({
  createCanvas: () =>
    ({
      width: 0,
      height: 0,
      getContext: () => null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      style: {},
    }) as unknown as HTMLCanvasElement,
  createTexImageSource: (canvas: unknown) => canvas,
  createImage: () => Promise.reject(new Error('images are not used by this test')),
  getWindow: () => globalThis,
  getDocument: () => undefined,
  getXMLSerializer: () => null,
  getDOMParser: () => null,
  splitGraphemes: (s: string) => Array.from(s),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => undefined,
} as never);


// These are in-memory documents, not a production Workspace switcher.
describe('reconciled document contract in a real ECS world', () => {
  it('replaces empty and same-ID scenes, preserves metadata and isolates fixture history', async () => {
    let api: API;
    class StartUpSystem extends System {
      commands = new Commands(this);
      access = this.query((q) => q.using(
        Canvas, Theme, Grid, Camera, Parent, Children, Transform,
        GlobalTransform, Renderable, FillLayers, StrokeLayers, Stroke,
        Opacity, Visibility, Name, ZIndex, Rect, Ellipse, HTML,
        HTMLContainer, ColumnLayout,
      ).write);
      initialize() {
        api = new API(new DefaultStateManagement(), this.commands);
        api.createCanvas({ width: 200, height: 200, devicePixelRatio: 1 });
        api.createCamera({ zoom: 1 });
      }
    }
    const app = new App().addPlugins(...DefaultPlugins, () => {
      system(PreStartUp)(StartUpSystem);
      system((s) => s.before(ComputeZIndex))(StartUpSystem);
    });
    await app.run();
    const frame = async (operation: () => void) => {
      api.runAtNextTick(operation);
      await app.world.execute();
    };
    try {
      const metadata = { entity: {
        sourceSnapshot: { title: 'Note', revision: 'r1' },
        referenceParams: { targetKind: 'block', blockId: 'block-a', docId: 'doc-a', workspaceId: 'scope-a' },
      } };
      const scene = [
        { id: 'stack', type: 'column-layout', x: 0, y: 0, width: 100, height: 100, gap: 8, padding: 4 },
        { id: 'shared', type: 'html', parentId: 'stack', x: 0, y: 0, width: 20, height: 20, innerHTML: '', metadata, __anchor: 'unknown-key' },
      ] as unknown as SerializedNode[];
      const original = structuredClone(scene);
      const notifications = jest.fn();
      api.onchange = notifications;
      await frame(() => api.replaceDocument(scene, 'remote'));
      expect(scene).toEqual(original);
      expect(api.getEntity(api.getNodeById('shared')).has(HTML)).toBe(true);
      expect(api.getEntity(api.getNodeById('stack')).read(ColumnLayout).gap).toBe(8);
      expect(JSON.parse(JSON.stringify(api.getNodeById('shared')))).toMatchObject({ metadata, __anchor: 'unknown-key' });
      metadata.entity.sourceSnapshot.title = 'mutated caller';
      expect(JSON.parse(JSON.stringify(api.getNodeById('shared'))).metadata.entity.sourceSnapshot.title).toBe('Note');
      expect(notifications).not.toHaveBeenCalled();
      await frame(() => { api.updateNode(api.getNodeById('shared'), { x: 5 }); api.record(); });
      expect(api.isUndoStackEmpty()).toBe(false);
      await frame(() => api.replaceDocument([], 'remote'));
      expect(api.getNodes()).toEqual([]);
      // Collaboration replacement deliberately retains the existing history.
      expect(api.isUndoStackEmpty()).toBe(false);
      await frame(() => { api.clearHistory(); api.setAppState({ layersSelected: [], layersHighlighted: [] }); api.record('NEVER'); });
      api.undo();
      await app.world.execute();
      expect(api.getNodes()).toEqual([]);
      await frame(() => api.replaceDocument(original, 'remote'));
      await frame(() => api.replaceDocument([{ id: 'shared', type: 'ellipse', cx: 20, cy: 20, rx: 10, ry: 10 }], 'remote'));
      const entity = api.getEntity(api.getNodeById('shared'));
      expect(entity.has(Ellipse)).toBe(true);
      expect(entity.has(HTML)).toBe(false);
      expect(api.getNodeById('shared').parentId).toBeUndefined();
      expect(JSON.parse(JSON.stringify(api.getNodeById('shared'))).metadata).toBeUndefined();
      const before = structuredClone(api.getNodes());
      for (const invalid of [
        [{ id: 'a', type: 'rect' }, { id: 'a', type: 'rect' }],
        [{ id: 'a', type: 'rect', parentId: 'missing' }],
        [{ id: 'a', type: 'rect', parentId: 'b' }, { id: 'b', type: 'rect', parentId: 'a' }],
      ]) {
        expect(() => api.replaceDocument(invalid as SerializedNode[])).toThrow();
        expect(api.getNodes()).toEqual(before);
      }
      await frame(() => api.replaceDocument(original, 'remote'));
      expect(JSON.parse(JSON.stringify(api.getNodeById('shared')))).toMatchObject({ metadata: original[1]['metadata'], __anchor: 'unknown-key' });

      // Exercise the full-state call pattern used by selection/history consumers.
      await frame(() => { api.clearHistory(); api.record('NEVER'); });
      const theme = structuredClone(api.getAppState().theme);
      await frame(() => {
        api.setAppState({ ...api.getAppState(), cameraX: 0, cameraY: 0 });
        api.record();
      });
      expect(api.getAppState().theme).toEqual(theme);
      expect(api.isUndoStackEmpty()).toBe(true);
      expect(api.getAppState()).toMatchObject({ cameraX: 0, cameraY: 0 });
      await frame(() => { api.updateNode(api.getNodeById('shared'), { x: 13 }); api.record(); });
      api.undo(); await app.world.execute();
      expect(api.getNodeById('shared').x).toBe(0);
      api.redo(); await app.world.execute();
      expect(api.getNodeById('shared').x).toBe(13);
      await frame(() => { api.updateNode(api.getNodeById('shared'), { x: 21 }); api.record(); });
      api.undo(); await app.world.execute();
      expect(api.getNodeById('shared').x).toBe(13);
      await frame(() => api.destroy());
      await frame(() => api.destroy());
      expect(api.getNodes()).toEqual([]);
    } finally {
      await app.exit();
    }
  });
});
