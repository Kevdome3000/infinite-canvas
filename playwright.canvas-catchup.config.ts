import { defineConfig } from '@playwright/test';
import browserConfig from './playwright.browser.config';
import webkitConfig from './playwright.webkit.config';

// Separate actual backend runs: never treat a browser engine as a GPU backend.
export default defineConfig({
  ...browserConfig,
  testMatch: ['mesh-alpha.spec.ts', 'mesh-shadow-lifecycle.spec.ts', 'mesh-environment-async.spec.ts'],
  outputDir: '.test-results/canvas-catchup',
  projects: [
    { name: 'webkit-webgl', metadata: { renderer: 'webgl' }, use: webkitConfig.use },
    { name: 'webgl-swiftshader', metadata: { renderer: 'webgl' }, use: browserConfig.use },
    { name: 'webgpu-metal', metadata: { renderer: 'webgpu' }, use: {
      ...browserConfig.use,
      launchOptions: { args: ['--use-angle=metal'] },
    } },
  ],
});
