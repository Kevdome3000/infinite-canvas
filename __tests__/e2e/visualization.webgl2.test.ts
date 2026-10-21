import { test, expect } from '@playwright/test';
import tests from './config.json';

const renderer = 'webgl2';

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout + 160000);
});

test.describe('E2E Suite', () => {
  tests.forEach(({ name, nodeCount }) => {
    test(`${name} with ${renderer}`, async ({ page, context }) => {
      let resolveReadyPromise: () => void;
      const readyPromise = new Promise((resolve) => {
        resolveReadyPromise = () => {
          resolve(this);
        };
      });

      await context.exposeFunction('screenshot', async () => {
        resolveReadyPromise();
      });

      const url = `./infinitecanvas/?name=${name}&renderer=webgl`;
      await page.goto(url);
      await readyPromise;
      const scene = name === 'drop-shadow' ? 'drop_shadow' : name;
      await expect(page.locator('#example-select')).toHaveValue(scene);
      await expect(page.locator('#container')).toHaveAttribute('data-scene', scene);
      await expect(page.locator('#container')).toHaveAttribute('data-node-count', String(nodeCount));
      await expect(page.locator('#container canvas')).toHaveCount(1);

      await expect(page.locator('canvas')).toHaveScreenshot([
        renderer,
        `${name}.png`,
      ], {
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
