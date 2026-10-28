import {
  ComputeBounds, ComputeCamera, EnsureExtrudeMeshes, EnsureMesh3DNodes,
  SyncExtrude3D, SyncMesh3DNodes, PostUpdate, system, Extrude3D, Mesh3DNode,
  Material3D, ExportFormat, type API, type SerializedNode,
} from '../../packages/ecs/src';
import { createDocumentWorld } from '../helpers/ecs-document';

let world: Awaited<ReturnType<typeof createDocumentWorld>>;
let api: API;
let reloaded: API;
beforeAll(async () => {
  world = await createDocumentWorld(2, false, [() => {
    system(PostUpdate)(EnsureExtrudeMeshes);
    system((s) => s.after(ComputeBounds).before(ComputeCamera))(EnsureExtrudeMeshes);
    system(PostUpdate)(EnsureMesh3DNodes);
    system((s) => s.after(EnsureExtrudeMeshes).before(ComputeCamera))(EnsureMesh3DNodes);
    system(PostUpdate)(SyncExtrude3D);
    system((s) => s.after(EnsureMesh3DNodes).before(ComputeCamera))(SyncExtrude3D);
    system(PostUpdate)(SyncMesh3DNodes);
    system((s) => s.after(SyncExtrude3D).before(ComputeCamera))(SyncMesh3DNodes);
  }]);
  [api, reloaded] = world.apis;
});
afterAll(async () => { await world?.dispose(); });
const settle = async () => { await world.frame(); await world.frame(); };
const primitive = (id: string, alphaMode?: 'opaque' | 'mask' | 'blend'): SerializedNode => ({
  id, name: id, type: 'mesh3d', zIndex: 0, x: 0, y: 0, width: 40, height: 40,
  material3d: { baseColor: [1, 0, 0, 0.3], ...(alphaMode ? { alphaMode } : {}), alphaCutoff: 0.25 },
});
const extrusion = (): SerializedNode => ({
  id: 'extrusion', name: 'extrusion', type: 'rect', zIndex: 1,
  x: 50, y: 0, width: 40, height: 40, extrude3d: 20,
  fills: [{ type: 'solid', value: '#00ff00', opacity: 0.4 }],
});
const material = (editor: API, id: string) => {
  const e = editor.getEntity(editor.getNodeById(id));
  const mesh = e.has(Mesh3DNode) ? e.read(Mesh3DNode).meshEntity! : e.read(Extrude3D).meshEntity!;
  return mesh.read(Material3D);
};
const exported = (editor = api, nodes: SerializedNode[] = []) => {
  const bytes = editor.export({ format: ExportFormat.GLB, download: false, nodes });
  expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
  expect(bytes.byteOffset).toBe(0);
  expect(bytes.buffer.byteLength).toBe(bytes.byteLength);
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
};

it('exports ready declarative and extruded meshes with selection, explicit alpha and deletion', async () => {
  await world.reset(api, [primitive('mask', 'mask'), primitive('opaque', 'opaque'), primitive('blend', 'blend'), extrusion()]);
  await settle();
  const json = exported();
  expect(json.meshes).toHaveLength(4);
  expect(json.materials.slice(0, 3).map((m: any) => m.alphaMode)).toEqual(['MASK', 'OPAQUE', 'BLEND']);
  expect(json.materials[0].alphaCutoff).toBeCloseTo(0.25);
  expect(json.materials[1]).not.toHaveProperty('alphaCutoff');
  const selected = exported(api, [api.getNodeById('mask')]);
  expect(selected.meshes).toHaveLength(1);
  expect(selected.nodes[1].name).toBe('mask');
  await world.edit(api, (editor) => editor.deleteNodesById(['mask', 'opaque', 'blend']));
  await settle();
  expect(exported().nodes[1].name).toBe('extrusion');
  expect(exported().meshes).toHaveLength(1);
  await world.edit(api, (editor) => editor.deleteNodesById(['extrusion']));
  await settle();
  expect(() => exported()).toThrow('No ready 3D meshes');
});

it.each(['primitive', 'extrusion'] as const)('preserves legacy translucent %s without writing alphaMode into saved data', async (kind) => {
  const node = kind === 'primitive' ? primitive('legacy') : extrusion();
  await world.reset(api, [node]);
  await settle();
  expect(material(api, node.id).alphaMode).toBe('blend');
  expect(exported().materials[0].alphaMode).toBe('BLEND');
  const saved = JSON.parse(JSON.stringify(api.getNodes()));
  expect(saved[0].material3d?.alphaMode).toBeUndefined();
  await world.reset(reloaded, saved);
  await settle();
  expect(material(reloaded, node.id).alphaMode).toBe('blend');
  await world.edit(api, (editor) => editor.updateNode(editor.getNodeById(node.id), kind === 'primitive'
    ? { material3d: { baseColor: [1, 0, 0, 1] } }
    : { fills: [{ type: 'solid', value: '#00ff00', opacity: 1 }] }));
  await settle();
  expect(material(api, node.id).alphaMode).toBe('opaque');
  await world.history(api, 'undo');
  await settle();
  expect(material(api, node.id).alphaMode).toBe('blend');
  await world.history(api, 'redo');
  await settle();
  expect(material(api, node.id).alphaMode).toBe('opaque');
});

it('infers translucent extrusion sides while retaining opaque caps and saved options', async () => {
  const node: SerializedNode = {
    ...extrusion(),
    extrude3d: { depth: 20, sideColor: 'rgba(0, 0, 255, 0.25)' },
    fills: [{ type: 'solid', value: '#00ff00', opacity: 1 }],
  };
  await world.reset(api, [node]);
  await settle();
  expect(material(api, node.id).baseColor[3]).toBe(1);
  expect(material(api, node.id).sideColor[3]).toBe(0.25);
  expect(material(api, node.id).alphaMode).toBe('blend');
  expect(exported().materials.some((value: any) => value.alphaMode === 'BLEND')).toBe(true);
  const saved = structuredClone(api.getNodes());
  expect(saved[0].extrude3d).toEqual(node.extrude3d);
  expect(saved[0]).not.toHaveProperty('material3d');
  await world.reset(reloaded, saved);
  await settle();
  expect(material(reloaded, node.id).alphaMode).toBe('blend');
});


it('syncs extrusion PBR edits alongside inferred alpha and restores them through history', async () => {
  const node: SerializedNode = {
    ...extrusion(),
    extrude3d: { depth: 20, metallic: 0.2, roughness: 0.8 },
  };
  await world.reset(api, [node]);
  await settle();
  api.clearHistory();
  await world.edit(api, (editor) => editor.updateNode(editor.getNodeById(node.id), {
    extrude3d: { depth: 20, metallic: 0.9, roughness: 0.3 },
  }));
  await settle();
  expect(material(api, node.id).alphaMode).toBe('blend');
  expect(material(api, node.id).metallic).toBeCloseTo(0.9);
  expect(material(api, node.id).roughness).toBeCloseTo(0.3);
  expect(exported().materials[0].pbrMetallicRoughness.metallicFactor).toBeCloseTo(0.9);
  expect(exported().materials[0].pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.3);
  const saved = structuredClone(api.getNodes());
  await world.reset(reloaded, saved);
  await settle();
  expect(material(reloaded, node.id).alphaMode).toBe('blend');
  expect(material(reloaded, node.id).metallic).toBeCloseTo(0.9);
  expect(material(reloaded, node.id).roughness).toBeCloseTo(0.3);
  await world.history(api, 'undo');
  await settle();
  expect(material(api, node.id).alphaMode).toBe('blend');
  expect(material(api, node.id).metallic).toBeCloseTo(0.2);
  expect(material(api, node.id).roughness).toBeCloseTo(0.8);
});
