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
  Renderable,
  StrokeLayers,
  Stroke,
  Theme,
  Transform,
  Visibility,
  ZIndex,
  serializedNodesToEntities,
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
    } as unknown as HTMLCanvasElement),
  createTexImageSource: (canvas: unknown) => canvas,
  createImage: () =>
    Promise.reject(new Error('images are not used by this test')),
  getWindow: () => globalThis,
  getDocument: () => undefined,
  getXMLSerializer: () => null,
  getDOMParser: () => null,
  splitGraphemes: (s: string) => Array.from(s),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => undefined,
} as never);

describe('retired fork layout loading', () => {
  it('keeps HTML metadata inert and rejects legacy layout before document or raw-node mutation', async () => {
    let api: API;
    class StartUpSystem extends System {
      commands = new Commands(this);
      access = this.query(
        (q) =>
          q.using(
            Canvas,
            Theme,
            Grid,
            Camera,
            Parent,
            Children,
            Transform,
            GlobalTransform,
            Renderable,
            FillLayers,
            StrokeLayers,
            Stroke,
            Opacity,
            Visibility,
            Name,
            ZIndex,
            Rect,
            Ellipse,
            HTML,
            HTMLContainer,
          ).write,
      );
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
      let failure: unknown;
      api.runAtNextTick(() => {
        try {
          operation();
        } catch (error) {
          failure = error;
        }
      });
      await app.world.execute();
      if (failure) throw failure;
    };
    try {
      const metadata = {
        cardType: 'stack',
        columnLayout: {
          direction: 'vertical',
          gap: 12,
          padding: 6,
          alignItems: 'start',
        },
        entity: { sourceSnapshot: { title: 'Keep me' } },
      };
      await frame(() =>
        api.replaceDocument([
          {
            id: 'html',
            type: 'html',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            html: '',
            metadata,
          },
        ] as unknown as SerializedNode[]),
      );
      const entity = api.getEntity(api.getNodeById('html'));
      expect(entity.has(HTML)).toBe(true);
      expect(entity.has(Rect)).toBe(false);
      expect(api.getNodeById('html').metadata).toEqual(metadata);
      await frame(() => {
        api.updateNode(api.getNodeById('html'), { x: 4 });
        api.record();
      });
      const before = structuredClone(api.getNodes());
      const undoEmpty = api.isUndoStackEmpty();
      const legacy = {
        id: 'legacy',
        type: 'column-layout',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      } as unknown as SerializedNode;
      await frame(() => {
        expect(() => api.replaceDocument([legacy])).toThrow(
          'Unsupported retired layout type: column-layout',
        );
        expect(() =>
          api.updateNodes([
            { id: 'valid', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
            legacy,
          ]),
        ).toThrow('Unsupported retired layout type: column-layout');
        expect(() =>
          serializedNodesToEntities([legacy], [], undefined!),
        ).toThrow('Unsupported retired layout type: column-layout');
        expect(() => api.updateNode(legacy)).toThrow(
          'Unsupported retired layout type: column-layout',
        );
        expect(() =>
          api.updateNode(api.getNodeById('html'), {
            type: 'column-layout',
          } as unknown as Partial<SerializedNode>),
        ).toThrow('Unsupported retired layout type: column-layout');
      });
      expect(api.getNodes()).toEqual(before);
      expect(api.getEntity(api.getNodeById('html'))).toBe(entity);
      expect(api.getNodeById('valid')).toBeUndefined();
      expect(api.isUndoStackEmpty()).toBe(undoEmpty);
      api.undo();
      await app.world.execute();
      expect(api.getNodeById('html').x).toBe(0);
    } finally {
      await app.exit();
    }
  });
});
