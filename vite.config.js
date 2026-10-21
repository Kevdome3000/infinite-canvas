import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve('./__tests__/e2e/fixtures'),
  resolve: {
    alias: {
      '@infinite-canvas-tutorial/ecs': path.resolve('./packages/ecs/src/index.ts'),
      '@infinite-canvas-tutorial/device-api': path.resolve('./packages/device-api/src/index.ts'),
    },
  },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  server: { port: 8080, strictPort: true },
  base: '/infinitecanvas/',
});