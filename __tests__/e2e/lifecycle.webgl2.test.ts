import { expect, test } from '@playwright/test';

test('visual fixtures dispose prior scenes during rapid and sequential switching', async ({ page }) => {
  const errors: string[] = [];
  let ready = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('screenshot', () => { ready++; });
  await page.goto('/infinitecanvas/?name=grid_lines&renderer=webgl');
  await expect.poll(() => ready).toBe(1);

  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#example-select')!;
    for (const name of ['ellipse', 'grid_lines', 'rect', 'circle']) {
      select.value = name;
      select.dispatchEvent(new Event('change'));
    }
  });
  await expect.poll(() => ready).toBe(5);
  await expect(page.locator('#example-select')).toHaveValue('circle');
  await expect(page.locator('#container')).toHaveAttribute('data-node-count', '9');
  await expect(page.locator('#container canvas')).toHaveCount(1);
  expect(errors).toEqual([]);

  const before = ready;
  await page.selectOption('#example-select', 'grid_lines');
  await expect.poll(() => ready).toBeGreaterThan(before);
  await expect(page.locator('#container')).toHaveAttribute('data-node-count', '0');
  await expect(page.locator('#container canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const [requestedName, scene, nodeCount] of [
  ['drop-shadow', 'drop_shadow', 3],
  ['polyline', 'polyline', 5],
  ['polyline_stroke_alignment', 'polyline_stroke_alignment', 6],
  ['polyline_stroke_dasharray', 'polyline_stroke_dasharray', 3],
] as const) {
  test(`visual fixture ${requestedName} renders its requested scene`, async ({ page }) => {
    const errors: string[] = [];
    let ready = false;
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    await page.exposeFunction('screenshot', () => { ready = true; });
    await page.goto(`/infinitecanvas/?name=${requestedName}&renderer=webgl`);
    // Include renderer failures in readiness diagnostics instead of only a timeout.
    await expect.poll(() => ({ ready, errors })).toEqual({ ready: true, errors: [] });
    await expect(page.locator('#example-select')).toHaveValue(scene);
    await expect(page.locator('#container')).toHaveAttribute('data-scene', scene);
    await expect(page.locator('#container')).toHaveAttribute('data-node-count', String(nodeCount));
    await expect(page.locator('#container canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
