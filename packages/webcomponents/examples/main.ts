import { App, CheckboardStyle, DefaultPlugins, getDefaultAppState, Pen, Task, } from '@infinite-canvas-tutorial/ecs';
import { CanvasData, Event, IndexedDbStorageService, UIPlugin } from '../src';
import '../src/spectrum';
import { LaserPointerPlugin } from '../../plugin-laser-pointer';
import { EraserPlugin } from '../../plugin-eraser';
import { LassoPlugin } from '../../plugin-lasso';
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
    } else {
      // api.runAtNextTick(() => {
      api.setAppState({
        ...api.getAppState(),
        cameraX: 0,
        penbarSelected: Pen.SELECT,
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
        checkboardStyle: CheckboardStyle.GRID,
        snapToPixelGridEnabled: true,
        snapToPixelGridSize: 10,
        // snapToPixelGridEnabled: false,
        // snapToPixelGridSize: 0,
        snapToObjectsEnabled: true,
        // checkboardStyle: CheckboardStyle.NONE,
        // penbarSelected: Pen.SELECT,
        // topbarVisible: false,
        // contextBarVisible: false,
        // penbarVisible: false,
        // taskbarVisible: false,
        // rotateEnabled: false,
        // flipEnabled: false,
      });

      // api.updateNodes(nodes);
      // Create default nodes
      const node1 = {
        id: 'rect-1',
        type: 'rect',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        fill: 'grey',
      };
      const node2 = {
        id: 'text-1',
        type: 'text',
        parentId: 'rect-1',
        anchorX: 10,
        anchorY: 50,
        content: 'Hello',
        fill: 'black',
        fontSize: 30,
        fontFamily: 'system-ui',
      };
      const node3 = {
        id: 'rect-2',
        type: 'rect',
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        fill: 'red',
      };

      const node4 = {
        id: 'rect-3',
        type: 'rect',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        fill: 'green',
      };

      api.updateNodes([node1, node2, node3, node4]);
      api.record();

      // Release loading lock
      isLoading = false;
    }
  }
  );

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
  );
  app.run();
} catch (e) {
  console.error(e);
}
