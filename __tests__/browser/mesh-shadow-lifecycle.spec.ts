import { expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { test } from '../isolated-webkit-test';
import type {} from './fixtures/gizmo';

const changedPixels = (a: PNG, b: PNG) => {
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 8) changed++;
  return changed;
};

// Exclude all three foreground pane bounds; only exposed floor receivers count.
const receiverChanges = (a: PNG, b: PNG) => {
  let changed = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if ((x >= 15 && x <= 95 && y >= 15 && y <= 95) ||
        (x >= 100 && x <= 185 && y >= 50 && y <= 140)) continue;
    const i = (y * a.width + x) * 4;
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 8) changed++;
  }
  return changed;
};

test('shadow casters survive light replacement, fractional alpha and rapid undo/deletion', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const diagnostics: string[] = [];
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()); });
  const renderer = testInfo.project.metadata.renderer ?? 'webgl';
  await page.goto(`/gizmo.html?alpha&renderer=${renderer}`);
  await expect(page.locator('#status')).toHaveText('Ready');
  expect(await page.evaluate(() => window.gizmoTest.backend())).toMatch(renderer === 'webgpu' ? /^WebGPU$/ : /^WebGL/);
  await page.evaluate(async () => {
    const api = window.gizmoTest.api();
    await api.edit((editor) => {
      editor.updateNode(editor.getNodeById('alpha-ambient'), { intensity: 0.2 });
      editor.updateNode({ id: 'second-light', type: 'light3d', zIndex: 6,
        lightType: 'spot', x: 100, y: 100, z: -100,
        direction: [0, 0, 1], range: 500, innerConeAngle: 0.5,
        outerConeAngle: 1, castShadow: true, intensity: 1 });
    });
    await window.gizmoTest.settle();
  });
  const image = async () => PNG.sync.read(await page.locator('#canvas').screenshot({ scale: 'css' }));
  const beforeUndoState = await page.evaluate(() => ({ nodes: window.gizmoTest.api().getNodes(), appState: window.gizmoTest.api().getAppState() }));
  const twoLights = await image();
  const changeCaster = async (patch: { castShadow?: boolean; alphaMode?: 'opaque' | 'mask' | 'blend' }) => {
    await page.evaluate(async (patch) => {
      const api = window.gizmoTest.api();
      const node = api.getNodeById('alpha-mask');
      if (node.type !== 'mesh3d') throw new Error('Missing mask');
      await api.edit((editor) => editor.updateNode(node, { material3d: { ...node.material3d, ...patch } }));
      await window.gizmoTest.settle();
    }, patch);
  };
  await changeCaster({ castShadow: false });
  expect(receiverChanges(twoLights, await image())).toBeGreaterThan(20);
  await changeCaster({ castShadow: true, alphaMode: 'opaque' });
  expect(receiverChanges(twoLights, await image())).toBeGreaterThan(20);
  await changeCaster({ alphaMode: 'mask' });
  expect(errors, diagnostics.join('\n')).toEqual([]);
  await page.evaluate(async () => {
    const api = window.gizmoTest.api();
    await api.edit((editor) => editor.deleteNodesById(['second-light']));
    await window.gizmoTest.settle();
  });
  const oneLight = await image();
  expect(changedPixels(twoLights, oneLight)).toBeGreaterThan(100);
  await page.evaluate(async () => {
    window.gizmoTest.api().undo();
    await window.gizmoTest.settle();
  });
  await testInfo.attach('undo-state', { body: JSON.stringify({ before: beforeUndoState, after: await page.evaluate(() => ({ nodes: window.gizmoTest.api().getNodes(), appState: window.gizmoTest.api().getAppState() })), diagnostics }, null, 2), contentType: 'application/json' });
  const restoredScene = await page.evaluate(() => window.gizmoTest.api().getNodes());
  const relevant = (nodes: typeof restoredScene) => nodes.filter((node) => !node.isDeleted).map((node) => ({
    id: node.id, type: node.type,
    material: 'material3d' in node ? node.material3d : null,
    light: node.type === 'light3d' ? { type: node.lightType, intensity: node.intensity, castShadow: node.castShadow } : null,
  })).sort((a, b) => a.id.localeCompare(b.id));
  expect(relevant(restoredScene)).toEqual(relevant(beforeUndoState.nodes));
  expect(errors, diagnostics.join('\n')).toEqual([]);
  expect(changedPixels(twoLights, await image())).toBeLessThan(20);

  await page.evaluate(async () => {
    const api = window.gizmoTest.api();
    const node = api.getNodeById('alpha-mask');
    if (node.type !== 'mesh3d') throw new Error('Missing mesh');
    await api.edit((editor) => editor.updateNode(node, { material3d: {
      ...node.material3d, map: undefined, baseColor: [1, 0, 0, 0.35], alphaMode: 'blend',
    } }));
    await window.gizmoTest.settle();
  });
  const fractional = await image();
  await changeCaster({ castShadow: false });
  expect(receiverChanges(fractional, await image())).toBeGreaterThan(20);
  await changeCaster({ castShadow: true });
  expect(changedPixels(twoLights, fractional)).toBeGreaterThan(100);
  await page.evaluate(async () => {
    const api = window.gizmoTest.api();
    // Submit deletion and immediate history restoration before the next draw.
    await api.edit((editor) => editor.deleteNodesById(['alpha-mask']));
    api.undo();
    await window.gizmoTest.settle();
  });
  expect(changedPixels(fractional, await image())).toBeLessThan(20);
  await page.evaluate(() => window.gizmoTest.dispose());
  expect(errors).toEqual([]);
});
