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

test('asynchronous HDR completion redraws an unchanged camera and survives disposal', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let release: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let requested = false;
  await page.route('**/catchup-environment.hdr', async (route) => {
    requested = true;
    await pending;
    const header = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n');
    // Constant bright red linear radiance, decoded and prefiltered by the real renderer.
    const body = Buffer.from([2, 2, 0, 8, 136, 192, 136, 16, 136, 8, 136, 130]);
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.concat([header, body]) });
  });
  try {
  const renderer = testInfo.project.metadata.renderer ?? 'webgl';
  await page.goto(`/gizmo.html?alpha&renderer=${renderer}`);
  await expect(page.locator('#status')).toHaveText('Ready');
  expect(await page.evaluate(() => window.gizmoTest.backend())).toMatch(renderer === 'webgpu' ? /^WebGPU$/ : /^WebGL/);
  await page.evaluate(async () => {
    const api = window.gizmoTest.api();
    await api.edit((editor) => {
      editor.deleteNodesById(['alpha-mask', 'alpha-near', 'alpha-far', 'alpha-sun']);
      editor.updateNode(editor.getNodeById('alpha-ambient'), { intensity: 0 });
      editor.updateNode(editor.getNodeById('alpha-floor'), { material3d: {
        baseColor: '#ffffff', ambient: 1, diffuse: 1, metallic: 0, roughness: 0.7,
        castShadow: false, environmentMap: '/catchup-environment.hdr',
      } });
    });
    await window.gizmoTest.settle();
  });
  await expect.poll(() => requested).toBe(true);
  const camera = await page.evaluate(() => window.gizmoTest.api().getAppState());
  const image = async () => PNG.sync.read(await page.locator('#canvas').screenshot({ scale: 'css' }));
  const before = await image();
  release!();
  // No scene edits, camera movement, or explicit rendering after completion.
  await expect.poll(async () => changedPixels(before, await image()), { timeout: 15000 }).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.gizmoTest.api().getAppState())).toEqual(camera);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.gizmoTest.dispose());
  expect(errors).toEqual([]);
  } finally {
    release!();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
