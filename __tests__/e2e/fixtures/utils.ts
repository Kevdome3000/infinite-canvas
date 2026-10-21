import {
  API, App, Commands, DefaultPlugins, DefaultStateManagement, PreStartUp,
  System, system, CheckboardStyle, ThemeMode,
} from '@infinite-canvas-tutorial/ecs';
import { settleECSFrames } from '../../browser/fixtures/ecs-frames';
import { getFillLayerDecodedBitmap } from '../../../packages/ecs/src/utils/fill-layer-image-url-raster';

let element: HTMLCanvasElement;
let renderer: 'webgl' | 'webgpu';
let api: API;

class Bootstrap extends System {
  access = this.query((q) => q.usingAll.write);
  initialize() {
    api = new API(new DefaultStateManagement(), new Commands(this));
    api.createCanvas({
      element, width: 400, height: 400, devicePixelRatio: 1, renderer,
      shaderCompilerPath: '/infinitecanvas/glsl_wgsl_compiler_bg.wasm',
    });
    api.createCamera({ zoom: 1, x: 0, y: 0 });
    api.setAppState({
      checkboardStyle: CheckboardStyle.GRID,
      theme: { mode: ThemeMode.LIGHT },
    });
  }
}

export async function initExample(
  container: HTMLElement,
  render: (api: API) => Promise<void>,
  selectedRenderer: 'webgl' | 'webgpu' = 'webgl',
) {
  element = document.createElement('canvas');
  element.width = element.height = 400;
  element.style.width = element.style.height = '400px';
  container.appendChild(element);
  renderer = selectedRenderer;
  const app = new App().addPlugins(...DefaultPlugins, () => {
    system(PreStartUp)(Bootstrap);
    system((s) => s.inAnyOrderWith(s.allSystems))(Bootstrap);
  });
  try {
    await app.run();
    await render(api);
    const imageUrls = api.getNodes().flatMap((node) =>
      'fills' in node ? (node.fills ?? []).flatMap((fill) =>
        fill.type === 'image' ? [fill.value] : []) : []);
    // Readiness requires decoded paints and completed ECS frames.
    for (let frame = 0; frame < 120; frame++) {
      await settleECSFrames(api);
      if (imageUrls.every((url) => getFillLayerDecodedBitmap(url))) {
        await settleECSFrames(api, 3);
        container.dataset.nodeCount = String(api.getNodes().length);
        return () => app.exit();
      }
    }
    throw new Error('Visual fixture image paints did not finish loading');
  } catch (error) {
    await app.exit();
    throw error;
  }
}
