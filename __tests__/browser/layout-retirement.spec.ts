import { expect, test } from '@playwright/test';
import type { BrowserHarness } from './fixtures/main';

declare global {
  interface Window {
    canvasRegression: BrowserHarness;
  }
}

test('upstream Yoga lays out a native flex container and responds to spacing changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?yoga');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    await window.canvasRegression.setScene(
      'left',
      [
        {
          id: 'container',
          type: 'rect',
          zIndex: 0,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 10,
          alignItems: 'flex-start',
        },
        {
          id: 'first',
          type: 'rect',
          zIndex: 0,
          parentId: 'container',
          x: 99,
          y: 99,
          width: 40,
          height: 20,
        },
        {
          id: 'second',
          type: 'rect',
          zIndex: 0,
          parentId: 'container',
          x: 99,
          y: 99,
          width: 30,
          height: 25,
        },
      ],
      'container',
    );
    await window.canvasRegression.settleFrames();
  });
  const geometry = () =>
    page.evaluate(() => window.canvasRegression.layoutGeometry('left'));
  await expect.poll(geometry).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'first',
        x: 10,
        y: 10,
        width: 40,
        height: 20,
      }),
      expect.objectContaining({
        id: 'second',
        x: 10,
        y: 42,
        width: 30,
        height: 25,
      }),
    ]),
  );
  await page.evaluate(async () => {
    await window.canvasRegression.update('left', 'container', { gap: 24 });
    await window.canvasRegression.settleFrames();
  });
  await expect
    .poll(geometry)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', x: 10, y: 10 }),
        expect.objectContaining({ id: 'second', x: 10, y: 54 }),
      ]),
    );
  await page.evaluate(() => window.canvasRegression.shutdown());
  expect(errors).toEqual([]);
});

test('upstream align and distribute move ordinary nodes without a fork layout container', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    await window.canvasRegression.setScene(
      'left',
      [
        {
          id: 'a',
          type: 'rect',
          zIndex: 0,
          x: 10,
          y: 20,
          width: 20,
          height: 20,
        },
        {
          id: 'b',
          type: 'rect',
          zIndex: 0,
          x: 60,
          y: 60,
          width: 20,
          height: 20,
        },
        {
          id: 'c',
          type: 'rect',
          zIndex: 0,
          x: 150,
          y: 100,
          width: 20,
          height: 20,
        },
      ],
      'a',
    );
    await window.canvasRegression.settleFrames();
    await window.canvasRegression.align('left', 'top', ['a', 'b', 'c']);
    await window.canvasRegression.settleFrames();
    await window.canvasRegression.distribute('left', 'horizontal', [
      'a',
      'b',
      'c',
    ]);
    await window.canvasRegression.settleFrames();
  });
  const nodes = await page.evaluate(() =>
    window.canvasRegression.layoutGeometry('left'),
  );
  expect(nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'a', x: 10, y: 20 }),
      expect.objectContaining({ id: 'b', x: 80, y: 20 }),
      expect.objectContaining({ id: 'c', x: 150, y: 20 }),
    ]),
  );
  await page.evaluate(() => window.canvasRegression.shutdown());
  expect(errors).toEqual([]);
});
