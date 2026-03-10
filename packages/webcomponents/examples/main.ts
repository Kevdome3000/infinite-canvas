import { CanvasData, Event, IndexedDbStorageService, UIPlugin } from '../src';
import {
  App,
  svgElementsToSerializedNodes,
  svgSvgElementToComputedCamera,
  DefaultPlugins,
  EdgeStyle,
  getDefaultAppState,
  Pen,
  Task, CheckboardStyle,
} from '@infinite-canvas-tutorial/ecs';
import '../src/spectrum';
import { LaserPointerPlugin } from '../../plugin-laser-pointer/src';
import { EraserPlugin } from '../../plugin-eraser/src';
import { LassoPlugin } from '../../plugin-lasso/src';
import { YogaPlugin } from '../../plugin-yoga/src';
import '../../plugin-laser-pointer/src/spectrum';
import '../../plugin-eraser/src/spectrum';
import '../../plugin-lasso/src/spectrum';
import WebFont from 'webfontloader';

WebFont.load({
  google: {
    families: ['Gaegu'],
  },
});

const storage = new IndexedDbStorageService();

// State
let currentCanvasId: string | null = null;
let currentCanvasName: string = 'Untitled Canvas';
let currentCanvasCreatedAt: number = Date.now();
let currentApi: any = null;
let isLoading = false;

// Debounce helper with flush capability
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = () => {
    clearTimeout(timeoutId);
    fn();
  };
  return debounced;
}

// Auto-save function
const saveCanvas = debounce(async () => {
  if (!currentCanvasId || !currentApi || isLoading) return;
  const canvasData: CanvasData = {
    id: currentCanvasId,
    name: currentCanvasName,
    nodes: currentApi.getNodes(),
    appState: currentApi.getAppState(),
    createdAt: currentCanvasCreatedAt,
    updatedAt: Date.now(),
  };

  await storage.saveCanvas(canvasData);
  console.log('[Persistence] Saved canvas', currentCanvasId);
}, 1000);

// Render canvas list on home screen
async function renderCanvasList() {
  const list = await storage.listCanvases();
  const container = document.getElementById('canvas-list')!;

  if (list.length === 0) {
    container.innerHTML = '<p>No canvases yet. Create one!</p>';
    return;
  }

  container.innerHTML = list
    .map(
      (meta) => `
    <div class="canvas-card" data-id="${meta.id}">
      <strong>${meta.name}</strong><br>
      <small>${new Date(meta.updatedAt).toLocaleString()}</small>
    </div>
  `,
    )
    .join('');
const res = await fetch('/test.svg');
// const res = await fetch('/maslow-hierarchy.svg');
// const res = await fetch('/mindmap.svg');
// const res = await fetch('/test-camera.svg');
// const res = await fetch(
//   '/62f5208ddbc232ac973f53d9cfd91ba463c50b8bfd846349247709fe4a7a9053.svg',
// );
// const svg = await res.text();
// TODO: extract semantic groups inside comments
// const $container = document.createElement('div');
// $container.innerHTML = svg;
// const $svg = $container.children[0] as SVGSVGElement;

  // Add click handlers to canvas cards
  container.querySelectorAll('.canvas-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset['id']!;
      openCanvas(id);
    });
  });
}

// Create canvas element dynamically
function createCanvasElement(): HTMLElement {
  const canvas = document.createElement('ic-spectrum-canvas');
  canvas.setAttribute('style', 'width: 100%; height: 100%;');
  canvas.setAttribute('renderer', 'webgl');
// const root = {
//   id: 'root',
//   type: 'rect',
//   x: 0,
//   y: 0,
//   width: 1000,
//   height: 1000
// };
// nodes.forEach((node) => node.parentId = root.id);
// console.log('nodes', nodes);

  // Add Eraser and Laser Pointer plugins to the dynamic element
  const eraser = document.createElement('ic-spectrum-penbar-eraser');
  eraser.setAttribute('slot', 'penbar-item');
  const laser = document.createElement('ic-spectrum-penbar-laser-pointer');
  laser.setAttribute('slot', 'penbar-item');
  canvas.appendChild(eraser);
  canvas.appendChild(laser);

  // Use the full default app state from ECS
  const defaultAppState = getDefaultAppState();
  canvas.setAttribute('app-state', JSON.stringify(defaultAppState));
  return canvas;
}

// Open a canvas (new or existing)
async function openCanvas(id?: string) {
  isLoading = true;

  // For new canvases, prompt for a name
  if (!id) {
    const name = prompt('Enter a name for your new canvas:', 'My Canvas');
    if (name === null) {
      // User cancelled, don't create canvas
      isLoading = false;
      return;
    }
    currentCanvasId = storage.generateId();
    currentCanvasName = name || 'Untitled Canvas';
    currentCanvasCreatedAt = Date.now();
  } else {
    // Existing canvas - load metadata
    currentCanvasId = id;
    const savedData = await storage.loadCanvas(id);
    if (savedData) {
      currentCanvasName = savedData.name;
      currentCanvasCreatedAt = savedData.createdAt;
    }
  }

  // Switch views
  document.getElementById('home-screen')!.style.display = 'none';
  document.getElementById('editor-screen')!.style.display = 'block';

  // Create canvas element dynamically
  const container = document.getElementById('canvas-container')!;
  container.innerHTML = '';
  const canvasElement = createCanvasElement();
  container.appendChild(canvasElement);

  // Wait for canvas to be ready
  canvasElement.addEventListener(Event.READY, async (e) => {
    const api = (e as CustomEvent).detail;
    currentApi = api;

    // Setup auto-save on changes
    api.onchange = () => {
      if (!isLoading) {
        saveCanvas();
      }
    };

    // Load existing data if this is an existing canvas
    if (id) {
      const savedData = await storage.loadCanvas(id);
      if (savedData) {
        // Defer state restoration to next ECS tick to avoid nested command execution
        // (READY event is dispatched from within InitCanvas.execute(), so we can't
        // call commands.execute() directly without causing "Entity handle no longer valid" errors)
        api.runAtNextTick(() => {
          // Restore app state first (camera position, UI settings)
          api.setAppState({
            ...api.getAppState(),
            ...savedData.appState,
          });

          // Then restore nodes using updateNodes (creates actual ECS entities)
          if (savedData.nodes && savedData.nodes.length > 0) {
            api.updateNodes(savedData.nodes);
          }

          // Release loading lock after restoration completes
          isLoading = false;
        });
      } else {
        // No saved data, release loading lock
        isLoading = false;
      }

      return;
    }

    // New canvas setup
    api.setAppState({
      ...api.getAppState(),
      cameraX: 0,
      // cameraZoom: 0.35,
      penbarSelected: Pen.SELECT,
    penbarAll: [
      Pen.HAND,
      Pen.SELECT,
      Pen.DRAW_RECT,
      Pen.DRAW_ELLIPSE,
      Pen.DRAW_LINE,
      Pen.DRAW_ARROW,
      Pen.DRAW_ROUGH_RECT,
      Pen.DRAW_ROUGH_ELLIPSE,
      Pen.IMAGE,
      Pen.LASSO,
      // Pen.TEXT,
      // Pen.PENCIL,
      // Pen.BRUSH,
      // Pen.ERASER,
      // Pen.LASER_POINTER,
    ],
      penbarLasso: {
        ...api.getAppState().penbarLasso,
        mode: 'draw',
      fill: 'none',
      stroke: 'red',
      strokeWidth: 2,
      },
      penbarText: {
        ...api.getAppState().penbarText,
        fontFamily: 'system-ui',
        fontFamilies: ['system-ui', 'serif', 'monospace', 'Gaegu'],
      },
      penbarPencil: {
        ...api.getAppState().penbarPencil,
        freehand: true,
      },
      taskbarAll: [
        Task.SHOW_CHAT_PANEL,
        Task.SHOW_LAYERS_PANEL,
        Task.SHOW_PROPERTIES_PANEL,
      ],
    penbarVisible: true,
    taskbarVisible: true,
      checkboardStyle: CheckboardStyle.GRID,
      snapToPixelGridEnabled: true,
      snapToPixelGridSize: 10,
      // snapToPixelGridEnabled: false,
      // snapToPixelGridSize: 0,
      // snapToObjectsEnabled: true,
      // filter: 'brightness(0.8) noise(0.1)',
      // penbarDrawSizeLabelVisible: true,
      // checkboardStyle: CheckboardStyle.NONE,
      // topbarVisible: false,
      // contextBarVisible: false,
      // penbarVisible: false,
      // taskbarVisible: false,
      // rotateEnabled: false,
      flipEnabled: false,
      // filter: 'noise(0.5)',
    layersLassoing: ['parent'],
    });

  const parent = {
    id: 'parent',
    type: 'rect',
    x: 100,
    y: 100,
    fill: '/canvas.png',
    // display: 'flex',
      width: 200,
    height: 200,
    // padding: 10,
    // flexWrap: 'wrap',
    // gap: 10,
    zIndex: 0,
    } as const;

  const child = {
    id: 'child',
    //   parentId: 'parent',
    type: 'rect',
    fill: 'red',
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    zIndex: 1,
  } as const;

  // const child2 = {
  //   id: 'child3',
    //   parentId: 'parent',
  //   type: 'text',
  //   content: 'Hello',
  //   fill: 'blue',
  //   fontSize: 20,
  //   fontFamily: 'system-ui',
  //   zIndex: 2,
  // } as const;

  const child3 = {
    id: 'child3',
    parentId: 'parent',
    type: 'rough-path',
    d: 'M 100 100 L 200 200 L 300 100 Z',
    fill: 'red',
    stroke: 'black',
    strokeWidth: 10,
    zIndex: 3,
  } as const;

  api.updateNodes([
    parent,
  ]);
  api.selectNodes([parent]);
  api.record();

    isLoading = false;
  });

  // Wait a tick to ensure READY event is processed
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Go back to home screen
async function goBack() {
  // Force save before leaving
  if (currentApi && currentCanvasId) {
    saveCanvas.flush();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Destroy canvas by removing it from DOM (triggers disconnectedCallback -> api.destroy())
  const container = document.getElementById('canvas-container')!;
  container.innerHTML = '';

  // Reset state
  currentApi = null;
  currentCanvasId = null;
  currentCanvasName = 'Untitled Canvas';
  currentCanvasCreatedAt = Date.now();
  isLoading = false;

  // Switch views
  document.getElementById('editor-screen')!.style.display = 'none';
  document.getElementById('home-screen')!.style.display = 'block';

  // Refresh canvas list
  await renderCanvasList();
}

// Initialize event listeners
document.getElementById('create-btn')!.addEventListener('click', () => openCanvas());
document.getElementById('back-btn')!.addEventListener('click', goBack);

// Render initial canvas list
renderCanvasList();

// Start the ECS app
try {
  const app = new App().addPlugins(
    ...DefaultPlugins,
    UIPlugin,
    EraserPlugin,
    LaserPointerPlugin,
    LassoPlugin,
    // YogaPlugin
  );
  app.run();
} catch (e) {
  console.error(e);
}
