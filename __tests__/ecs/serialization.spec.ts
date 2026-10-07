import type { API, SerializedNode } from '../../packages/ecs/src';

// The document API owns serialization; ECS entity IDs are not document IDs.
// Mapping from the retired fixture is recorded in serialization-contract.md.
describe('layout and connection document round trip', () => {
  it('restores layout settings, routed dashed geometry and bindings in a fresh world', async () => {
    const document = [
      {
        id: 'layout',
        type: 'rect',
        display: 'flex',
        flexDirection: 'column',
        x: 10,
        y: 10,
        width: 100,
        height: 200,
        gap: 20,
        padding: 15,
        alignItems: 'center',
      },
      { id: 'source', type: 'rect', x: 0, y: 0, width: 40, height: 40 },
      { id: 'target', type: 'rect', x: 150, y: 100, width: 40, height: 40 },
      {
        id: 'connection',
        type: 'polyline',
        fromId: 'source',
        toId: 'target',
        edgeStyle: 'orthogonalEdgeStyle',
        orthogonal: true,
        points: '0,0 1,1',
        stroke: '#000000',
        strokeWidth: 2,
        strokeDasharray: '8,4',
      },
    ] as SerializedNode[];

    const loadAndInspect = async (nodes: SerializedNode[], edit: boolean) => {
      // Becsy decorators are module-global. Reload modules for a fresh registry,
      // as independent engine instances have in separate module contexts.
      jest.resetModules();
      const {
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
        Flex,
        Renderable,
        StrokeLayers,
        Stroke,
        Theme,
        Transform,
        Visibility,
        ZIndex,
        Binding,
        Binded,
        Polyline,
      } = await import('../../packages/ecs/src');

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
              Flex,
              Binding,
              Binded,
              Polyline,
            ).write,
        );
        initialize() {
          api = new API(new DefaultStateManagement(), this.commands);
          api.createCanvas({ width: 300, height: 300, devicePixelRatio: 1 });
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
        await frame(() => api.replaceDocument(nodes, 'remote'));
        expect(api.getEntity(api.getNodeById('layout')).has(Flex)).toBe(true);
        const layout = api.getNodeById('layout');
        expect(layout.gap).toBe(edit ? 20 : 24);
        expect(layout.padding).toBe(15);
        expect(layout.alignItems).toBe('center');

        const edge = api.getEntity(api.getNodeById('connection'));
        const source = api.getEntity(api.getNodeById('source'));
        const target = api.getEntity(api.getNodeById('target'));
        expect(edge.read(Binding).from).toBe(source);
        expect(edge.read(Binding).to).toBe(target);
        expect(source.has(Binded)).toBe(true);
        expect(target.has(Binded)).toBe(true);
        expect(Array.from(edge.read(Stroke).dasharray)).toEqual(
          edit ? [8, 4] : [12, 6],
        );
        const points = edge.read(Polyline).points;
        expect(points.length).toBeGreaterThanOrEqual(3);
        expect(points.flat().every(Number.isFinite)).toBe(true);
        for (let i = 1; i < points.length; i++) {
          expect(
            points[i][0] === points[i - 1][0] ||
              points[i][1] === points[i - 1][1],
          ).toBe(true);
        }
        if (edit) {
          await frame(() => {
            api.updateNode(api.getNodeById('layout'), { gap: 24 });
            api.updateNode(api.getNodeById('connection'), {
              strokeDasharray: '12,6',
            });
          });
        }
        // Actual export/import across JSON and two independent ECS worlds.
        const exported = JSON.parse(
          JSON.stringify(api.getNodes()),
        ) as SerializedNode[];
        expect(exported.find((n) => n.id === 'layout')).toMatchObject({
          type: 'rect',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: 15,
          alignItems: 'center',
        });
        expect(exported.find((n) => n.id === 'connection')).toMatchObject({
          type: 'polyline',
          fromId: 'source',
          toId: 'target',
          edgeStyle: 'orthogonalEdgeStyle',
          orthogonal: true,
          strokeDasharray: '12,6',
        });
        return exported;
      } finally {
        await app.exit();
      }
    };
    const serialized = await loadAndInspect(document, true);
    expect(await loadAndInspect(serialized, false)).toEqual(serialized);
  });
});
