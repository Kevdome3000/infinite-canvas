import { createCanvas, loadImage } from 'canvas';
import type { Entity } from '../../packages/ecs/src';
import {
  Camera3D,
  Canvas,
  Canvas3DScope,
  GPUResource,
  Material3D,
  Mesh3D,
  Transform3D,
} from '../../packages/ecs/src/components';
import { DOMAdapter } from '../../packages/ecs/src/environment';
import { MeshPipeline3D } from '../../packages/ecs/src/systems/MeshPipeline3D';
import { ENVIRONMENT_BRDF_SIZE } from '../../packages/ecs/src/utils/environment-brdf';
import {
  ENV_ATLAS_HEIGHT,
  ENV_ATLAS_WIDTH,
} from '../../packages/ecs/src/utils/environment-map';
import { createGeometry } from '../../packages/ecs/src/utils/geometry3d';
import { loadImageBitmapUniversal } from '../../packages/ecs/src/utils/load-image-bitmap';
import { fakeMeshGPU } from './helpers/mesh-gpu';

// Controlled ECS queries and fake GPU prove resource ownership, not backend
// shaders or native redraw scheduling. Decoder, bitmap readback and prefilter
// stay real; only image/fetch I/O is replaced with deterministic local fixtures.
jest.mock('../../packages/ecs/node_modules/@lastolivegames/becsy', () => ({
  ...jest.requireActual<any>(
    '../../packages/ecs/node_modules/@lastolivegames/becsy',
  ),
  System: class {
    static group = jest.requireActual<any>(
      '../../packages/ecs/node_modules/@lastolivegames/becsy',
    ).System.group;
    query() {
      return { current: [], removed: [], addedOrChanged: [] };
    }
    attach() {
      return { hasGizmoContent: () => false };
    }
  },
  co: (_target: any, _key: string, descriptor: any) => descriptor,
}));
jest.mock('../../packages/ecs/src/utils/load-image-bitmap');
const load = loadImageBitmapUniversal as jest.MockedFunction<
  typeof loadImageBitmapUniversal
>;
const cleanups: (() => void)[] = [];
// Material sampler layout includes metallic-roughness after base color.
// Keep these assertions on the environment/BRDF slots, not adjacent fallbacks.
const ENVIRONMENT_SAMPLER = 4;
const ENVIRONMENT_BRDF_SAMPLER = 7;

beforeEach(() => {
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: (width = 1, height = 1) =>
      createCanvas(width, height) as unknown as HTMLCanvasElement,
  });
  cleanups.push(() => DOMAdapter.set(adapter));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fetch'));
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  jest.restoreAllMocks();
  load.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function hdrResponse() {
  const header = new TextEncoder().encode(
    '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n',
  );
  const bytes = new Uint8Array([...header, 128, 64, 32, 129]);
  return {
    ok: true,
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

// Flush the complete fetch -> decode -> prefilter -> upload promise chain.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture(count = 1) {
  const renderer = new MeshPipeline3D();
  const entity = (values: Map<any, any>, id: number): Entity =>
    ({
      __id: id,
      has: (type: any) => values.has(type),
      read: (type: any) => values.get(type),
      isSame: (other: Entity) => other.__id === id,
    } as unknown as Entity);
  const slots = Array.from({ length: count }, (_, index) => {
    const gpu = fakeMeshGPU();
    cleanups.push(() => gpu.scope.dispose());
    const canvas = entity(
      new Map<any, any>([
        [Canvas, { api: {}, width: 200, height: 200 }],
        [GPUResource, gpu],
      ]),
      index * 3,
    );
    const material = new Material3D();
    const target = entity(
      new Map<any, any>([
        [Canvas3DScope, { canvas }],
        [Mesh3D, new Mesh3D(createGeometry({ type: 'cube' }))],
        [Material3D, material],
        [Transform3D, new Transform3D()],
      ]),
      index * 3 + 1,
    );
    const camera = entity(
      new Map<any, any>([
        [Canvas3DScope, { canvas }],
        [Camera3D, new Camera3D()],
      ]),
      index * 3 + 2,
    );
    return { gpu, canvas, material, target, camera };
  });
  const queries = renderer as any;
  queries.canvases.current = slots.map((slot) => slot.canvas);
  queries.cameras3D.current = slots.map((slot) => slot.camera);
  queries.meshes3D.current = slots.map((slot) => slot.target);
  cleanups.push(() => renderer.finalize());
  const draw = (index = 0) =>
    renderer.drawMeshes(slots[index].gpu.pass, slots[index].canvas, 400, 400);
  const state = (index = 0) =>
    queries.states.get(slots[index].canvas.read(Canvas).api);
  const boundEnvironment = (index = 0) =>
    slots[index].gpu.draws.at(-1)!.samplerBindings[ENVIRONMENT_SAMPLER].texture;
  return { slots, draw, state, boundEnvironment };
}

it('allocates BRDF only for ready HDR, reuses it and releases all owner textures once', async () => {
  const request = deferred<Response>();
  jest.mocked(fetch).mockReturnValueOnce(request.promise);
  const { slots: [slot], draw, state, boundEnvironment } = fixture();
  draw();
  expect(slot.gpu.textures).toHaveLength(1); // Only the white fallback.
  expect(state().brdfTexture).toBeUndefined();
  slot.material.environmentMap = '/studio.hdr';
  draw();
  expect(state().brdfTexture).toBeUndefined();
  expect(boundEnvironment()).toBe(state().whiteTexture);
  request.resolve(hdrResponse());
  await settle();
  const entry = state().textureCache.get('environment:/studio.hdr');
  expect(entry.status).toBe('ready');
  expect(entry.irradiance[0]).toBeGreaterThan(0);
  expect(state().brdfTexture).toBeUndefined(); // Allocated lazily by a ready draw.
  draw();
  expect(boundEnvironment()).toBe(entry.texture);
  const brdf = state().brdfTexture;
  expect(brdf).toBeDefined();
  expect(slot.gpu.draws.at(-1)!.samplerBindings[ENVIRONMENT_BRDF_SAMPLER].texture).toBe(brdf);
  expect(slot.gpu.createTexture).toHaveBeenCalledWith(expect.objectContaining({
    width: ENV_ATLAS_WIDTH, height: ENV_ATLAS_HEIGHT,
  }));
  const allocations = slot.gpu.createTexture.mock.calls.length;
  draw();
  expect(slot.gpu.createTexture).toHaveBeenCalledTimes(allocations);
  slot.gpu.scope.dispose();
  slot.gpu.scope.dispose();
  for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
});

it.each(['allocation', 'upload'])(
  'retries lazy BRDF after %s failure without retaining a failed texture',
  async (failure) => {
    jest.mocked(fetch).mockResolvedValueOnce(hdrResponse());
    const { slots: [slot], draw, state } = fixture();
    slot.material.environmentMap = '/studio.hdr';
    draw();
    await settle();
    const allocate = slot.gpu.createTexture.getMockImplementation()!;
    const failed: { destroy: jest.Mock }[] = [];
    let fail = true;
    (slot.gpu.createTexture as jest.Mock).mockImplementation((descriptor) => {
      if (descriptor.width === ENVIRONMENT_BRDF_SIZE && fail) {
        fail = false;
        if (failure === 'allocation') throw new Error('BRDF allocation failed');
        const texture = allocate();
        failed.push(texture);
        texture.setImageData.mockImplementationOnce(() => { throw new Error('BRDF upload failed'); });
        return texture;
      }
      return allocate();
    });
    expect(draw).toThrow(`BRDF ${failure} failed`);
    expect(state().brdfTexture).toBeUndefined();
    for (const texture of failed) expect(texture.destroy).toHaveBeenCalledTimes(1);
    draw();
    expect(state().brdfTexture).toBeDefined();
    slot.gpu.scope.dispose();
    for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
  },
);

it.each(['network', 'http', 'body', 'decode'])(
  'keeps HDR fallback and releases resources after a %s failure',
  async (failure) => {
    const request = deferred<Response>();
    jest.mocked(fetch).mockReturnValueOnce(request.promise);
    const { slots: [slot], draw, state, boundEnvironment } = fixture();
    slot.material.environmentMap = '/bad.hdr?fixture=1';
    draw();
    if (failure === 'network') request.reject(new Error('offline'));
    else if (failure === 'http') request.resolve({ ok: false, status: 503 } as Response);
    else request.resolve({
      ok: true,
      arrayBuffer: failure === 'body'
        ? async () => { throw new Error('body interrupted'); }
        : async () => new Uint8Array([0]).buffer,
    } as Response);
    await settle();
    draw();
    expect(state().textureCache.get('environment:/bad.hdr?fixture=1').status).toBe('error');
    expect(boundEnvironment()).toBe(state().whiteTexture);
    expect(state().brdfTexture).toBeUndefined();
    expect(slot.gpu.textures).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    slot.gpu.scope.dispose();
    for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
  },
);

it.each(['resolve', 'reject'])(
  'does not allocate after a pending HDR owner is disposed before %s',
  async (completion) => {
    const request = deferred<Response>();
    jest.mocked(fetch).mockReturnValueOnce(request.promise);
    const { slots: [slot], draw, state } = fixture();
    slot.material.environmentMap = '/late.hdr';
    draw();
    slot.gpu.scope.dispose();
    const allocations = slot.gpu.createTexture.mock.calls.length;
    if (completion === 'resolve') request.resolve(hdrResponse());
    else request.reject(new Error('late network failure'));
    await settle();
    expect(state()).toBeUndefined();
    expect(slot.gpu.createTexture).toHaveBeenCalledTimes(allocations);
    for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
  },
);

it('isolates same-URL HDR and BRDF textures between two live canvas owners', async () => {
  jest.mocked(fetch).mockResolvedValue(hdrResponse());
  const { slots, draw, state, boundEnvironment } = fixture(2);
  for (let index = 0; index < 2; index++) {
    slots[index].material.environmentMap = '/shared.hdr';
    draw(index);
  }
  await settle();
  draw(0);
  draw(1);
  expect(boundEnvironment(0)).not.toBe(boundEnvironment(1));
  expect(state(0).brdfTexture).not.toBe(state(1).brdfTexture);
  const surviving = state(1).brdfTexture;
  slots[0].gpu.scope.dispose();
  expect(surviving.destroy).not.toHaveBeenCalled();
  const allocations = slots[1].gpu.createTexture.mock.calls.length;
  draw(1);
  expect(slots[1].gpu.createTexture).toHaveBeenCalledTimes(allocations);
  slots[1].gpu.scope.dispose();
  for (const slot of slots)
    for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
});

it('ignores a disposed same-URL owner while a second pending owner becomes ready', async () => {
  const requests = [deferred<Response>(), deferred<Response>()];
  jest.mocked(fetch).mockReturnValueOnce(requests[0].promise).mockReturnValueOnce(requests[1].promise);
  const { slots, draw, state } = fixture(2);
  for (let index = 0; index < 2; index++) {
    slots[index].material.environmentMap = '/shared.hdr';
    draw(index);
  }
  slots[0].gpu.scope.dispose();
  const allocations = slots[0].gpu.createTexture.mock.calls.length;
  requests[1].resolve(hdrResponse());
  requests[0].resolve(hdrResponse());
  await settle();
  draw(1);
  expect(state(0)).toBeUndefined();
  expect(slots[0].gpu.createTexture).toHaveBeenCalledTimes(allocations);
  expect(state(1).textureCache.get('environment:/shared.hdr').status).toBe('ready');
  expect(state(1).brdfTexture.destroy).not.toHaveBeenCalled();
});

it('never binds an old pending environment after replacement or clearing', async () => {
  const old = deferred<Response>();
  jest.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(hdrResponse());
  const { slots: [slot], draw, state, boundEnvironment } = fixture();
  slot.material.environmentMap = '/old.hdr';
  draw();
  slot.material.environmentMap = '/new.hdr';
  draw();
  await settle();
  draw();
  const current = boundEnvironment();
  old.resolve(hdrResponse());
  await settle();
  draw();
  expect(boundEnvironment()).toBe(current);
  slot.material.environmentMap = null;
  draw();
  expect(boundEnvironment()).toBe(state().whiteTexture);
  expect(slot.gpu.draws.at(-1)!.samplerBindings[ENVIRONMENT_BRDF_SAMPLER].texture).toBe(state().whiteTexture);
  slot.gpu.scope.dispose();
  for (const texture of slot.gpu.textures) expect(texture.destroy).toHaveBeenCalledTimes(1);
});

it('converts a real adapter image without a global ImageBitmap constructor', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
  Object.defineProperty(globalThis, 'ImageBitmap', { value: undefined, configurable: true });
  cleanups.push(() => {
    if (descriptor) Object.defineProperty(globalThis, 'ImageBitmap', descriptor);
    else Reflect.deleteProperty(globalThis, 'ImageBitmap');
  });
  const source = createCanvas(4, 2);
  const context = source.getContext('2d');
  context.fillStyle = 'rgb(128, 64, 32)';
  context.fillRect(0, 0, 4, 2);
  const image = await loadImage(source.toBuffer('image/png'));
  load.mockResolvedValueOnce(image as unknown as ImageBitmap);
  const { slots: [slot], draw, state, boundEnvironment } = fixture();
  slot.material.environmentMap = '/adapter.png';
  draw();
  await settle();
  const entry = state().textureCache.get('environment:/adapter.png');
  expect(entry.status).toBe('ready');
  expect(entry.irradiance[0]).toBeGreaterThan(0);
  expect(entry.irradiance[0]).toBeGreaterThan(entry.irradiance[1]);
  draw();
  expect(boundEnvironment()).toBe(entry.texture);
  expect(state().brdfTexture).toBeDefined();
  expect(console.warn).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
