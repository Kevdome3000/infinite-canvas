/// <reference types="jest" />
/**
 * Invariant test #4 of the in-artifact anchored-attestation design (OQ-A).
 *
 * The anchor design rides an attestation anchor on a canvas object as an extra
 * per-node key on the wire node — a key the ECS knows nothing about. Everything
 * downstream (the "canvas carrier is a Medium, 1-4wk build" estimate included)
 * assumes the engine does not drop that key on the round trip
 *
 *     Canvas.Data JSON -> api.updateNodes -> serializedNodesToEntities -> ECS
 *     -> a real mutation -> api.getNodes() -> JSON re-serialize
 *
 * which is exactly the path `InfiniteCanvasHost` + `PersistenceManager` run
 * (JSON.parse(canvas.data) -> api.updateNodes(parsed.nodes) -> api.getNodes()
 * -> PUT). Nobody had ever run it; this file does.
 *
 * Deliberately headless: the round trip is wire <-> ECS state only, nothing is
 * rasterized, so a stub DOMAdapter replaces `__tests__/utils.ts`'s NodeJSAdapter
 * (headless-gl + node-canvas). That keeps the case runnable anywhere, including
 * CI, and keeps a native-module failure from being read as an anchor failure.
 */
import {
  API,
  App,
  Commands,
  ComputeZIndex,
  DefaultPlugins,
  DefaultStateManagement,
  DOMAdapter,
  Plugin,
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
  Renderable,
  StrokeLayers,
  Stroke,
  Theme,
  Transform,
  Visibility,
  ZIndex,
  type SerializedNode,
} from '../../packages/ecs/src';

/** The key the anchor design would ride on. Unknown to every ECS component. */
const ANCHOR_KEY = '__chanceAttestationAnchor';
const ANCHOR_VALUE = 'att_7f3c9e21';

/**
 * Headless adapter: nothing in this file renders, so the canvas only has to
 * exist. `requestAnimationFrame` is a no-op on purpose — the render loop would
 * need a GPU device and this test asserts on state, not pixels.
 */
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

/** Populated inside the ECS start-up system, asserted on outside it. */
let api: API;

describe('Anchor carrier: an unknown per-node key survives the ECS round trip', () => {
  it('keeps an unrecognised key through deserialize, mutation and re-serialize', async () => {
    const app = new App();

    const AnchorProbePlugin: Plugin = () => {
      system(PreStartUp)(StartUpSystem);
      system((s) => s.before(ComputeZIndex))(StartUpSystem);
    };

    class StartUpSystem extends System {
      private readonly commands = new Commands(this);

      q = this.query((q) =>
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
        ).write,
      );

      initialize(): void {
        api = new API(new DefaultStateManagement(), this.commands);
        api.createCanvas({ width: 200, height: 200, devicePixelRatio: 1 });
        api.createCamera({ zoom: 1 });

        // A persisted canvas as it arrives from the sidecar: one node carrying
        // an anchor key the engine has no component for, one node without.
        const anchored = {
          id: 'anchored',
          type: 'rect',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zIndex: 0,
          [ANCHOR_KEY]: ANCHOR_VALUE,
        } as unknown as SerializedNode;
        const plain = {
          id: 'plain',
          type: 'rect',
          x: 50,
          y: 50,
          width: 10,
          height: 10,
          zIndex: 0,
        } as unknown as SerializedNode;

        api.updateNodes([anchored, plain]);
      }
    }

    app.addPlugins(...DefaultPlugins, AnchorProbePlugin);
    await app.run();

    const read = (id: string) =>
      api.getNodes().find((n) => n.id === id) as unknown as Record<string, unknown>;

    // 0. Guard: the nodes really were deserialized into ECS entities. Without
    //    this, `updateNode` below would silently take its "entity not found"
    //    branch and append a duplicate wire node, and the key would survive for
    //    a reason that says nothing about the ECS.
    expect(api.getNodes()).toHaveLength(2);
    expect(api.getEntity(read('anchored') as unknown as SerializedNode)).toBeDefined();

    // 1. Deserialize into the ECS must not strip it.
    expect(read('anchored')[ANCHOR_KEY]).toBe(ANCHOR_VALUE);

    // 2. A real mutation on an UNRELATED node must not strip it.
    api.updateNode(read('plain') as unknown as SerializedNode, { x: 42 } as never);
    expect(read('anchored')[ANCHOR_KEY]).toBe(ANCHOR_VALUE);

    // 3. A real mutation on the anchored node itself must not strip it.
    api.updateNode(read('anchored') as unknown as SerializedNode, { x: 7 } as never);
    expect(read('anchored')[ANCHOR_KEY]).toBe(ANCHOR_VALUE);
    expect(read('anchored').x).toBe(7);

    // ...and no duplicate node was appended by either mutation.
    expect(api.getNodes()).toHaveLength(2);

    // 4. Re-serialize — what PersistenceManager PUTs back — must still carry it.
    const reserialized = JSON.parse(JSON.stringify(api.getNodes())) as Record<
      string,
      unknown
    >[];
    expect(reserialized.find((n) => n.id === 'anchored')?.[ANCHOR_KEY]).toBe(
      ANCHOR_VALUE,
    );

    await app.exit();
  });
});
