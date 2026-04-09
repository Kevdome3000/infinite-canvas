import { CanvasData, Event, IndexedDbStorageService, UIPlugin } from '../src';
import {
  App,
  svgElementsToSerializedNodes,
  svgSvgElementToComputedCamera,
  DefaultPlugins,
  EdgeStyle,
  DefaultRendererPlugin,
  RendererPlugin,
  System,
  Commands,
  system,
  PreStartUp,
  ComputeZIndex,
  Screenshot,
  Canvas,
  Theme,
  Grid,
  Camera,
  Parent,
  Children,
  Transform,
  Renderable,
  FillSolid,
  Stroke,
  Rect,
  Visibility,
  Name,
  Opacity,
  ZIndex,
  Text,
  TextDecoration,
  Line,
  Plugin,
  ThemeMode,
  RectSerializedNode,
  getDefaultAppState,
  Pen,
  Task,
  CheckboardStyle,
} from '../../ecs';
import { Event, UIPlugin } from '../src';
import '../src/spectrum';
import { LaserPointerPlugin } from '../../plugin-laser-pointer/src';
import { EraserPlugin } from '../../plugin-eraser/src';
import { LassoPlugin } from '../../plugin-lasso/src';
import { YogaPlugin } from '../../plugin-yoga/src';
import { InitVello, VelloPipeline, registerFont } from '../../plugin-vello/src';
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
// const res = await fetch('/maslow-hierarchy.svg');
// const res = await fetch('/mindmap.svg');
// const res = await fetch('/test-camera.svg');
// const res = await fetch(
//   '/62f5208ddbc232ac973f53d9cfd91ba463c50b8bfd846349247709fe4a7a9053.svg',
// );
const svg = await res.text();
// TODO: extract semantic groups inside comments
const $container = document.createElement('div');
$container.innerHTML = svg;
const $svg = $container.children[0] as SVGSVGElement;

// const camera = svgSvgElementToComputedCamera($svg);
const nodes = svgElementsToSerializedNodes(
  Array.from($svg.children) as SVGElement[],
);
nodes[0].x = 500;
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
    cameraZoom: 1,
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
      Pen.DRAW_TRIANGLE,
      Pen.DRAW_PENTAGON,
      Pen.DRAW_HEXAGON,
      Pen.DRAW_LINE,
      Pen.DRAW_ARROW,
      Pen.DRAW_ROUGH_RECT,
      Pen.DRAW_ROUGH_ELLIPSE,
      Pen.IMAGE,
      Pen.LASSO,
      Pen.TEXT,
      Pen.PENCIL,
      Pen.BRUSH,
      Pen.ERASER,
      Pen.LASER_POINTER,
    ],
      penbarLasso: {
        ...api.getAppState().penbarLasso,
      // mode: 'draw',
      // fill: 'none',
      // stroke: 'red',
      // strokeWidth: 2,
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
    checkboardStyle: CheckboardStyle.NONE,
      snapToPixelGridEnabled: true,
    snapToPixelGridSize: 1,
      // snapToPixelGridEnabled: false,
      // snapToPixelGridSize: 0,
    // snapToObjectsEnabled: true,
      // filter: 'brightness(0.8) noise(0.1)',
      // penbarDrawSizeLabelVisible: true,
    // penbarSelected: Pen.SELECT,
      // contextBarVisible: false,
      // penbarVisible: false,
      // taskbarVisible: false,
    rotateEnabled: true,
    flipEnabled: true,
    // giEnabled: true,
    // giStrength: 0.05,
    // themeMode: ThemeMode.DARK,
      // filter: 'noise(0.5)',
    // layersLassoing: ['parent'],
    });

  const node1: RectSerializedNode = {
    id: 'binding-curved-rect-1',
    type: 'path',
    d: 'M 100 0 L 200 100 L 300 0 Z',
    stroke: 'black',
    strokeWidth: 10,
    zIndex: 1,
  };
  const node2 = {
    id: 'binding-curved-rect-2',
    type: 'ellipse',
    x: 225,
    y: 120,
    width: 100,
    height: 100,
    fill: 'red',
    zIndex: 2,
  };
  const node3 = {
    id: 'binding-curved-rect-3',
    type: 'rect',
    x: 400,
    y: 150,
    width: 100,
    height: 100,
    fill: 'green',
  };
  const edge1 = {
    id: 'binding-curved-line-1',
    type: 'path',
    // type: 'polyline',
    // type: 'line',
    fromId: 'binding-curved-rect-1',
    toId: 'binding-curved-rect-1',
    // targetPoint: {
    //   x: 300,
    //   y: 0,
    // },
    stroke: 'black',
    strokeWidth: 10,
    markerEnd: 'line',
    edgeStyle: EdgeStyle.ORTHOGONAL,
    // exitX: 0.5,
    // exitY: 0.5,
    // exitDx: 0,
    // exitDy: 50,
    curved: true,
  };
  const edge2 = {
    id: 'binding-curved-line-2',
    type: 'path',
    fromId: 'binding-curved-rect-2',
    toId: 'binding-curved-rect-3',
    stroke: 'black',
    strokeWidth: 10,
    markerEnd: 'line',
    edgeStyle: EdgeStyle.ORTHOGONAL,
    curved: true,
  };

  const line = {
    id: 'line-1',
    type: 'line',
    x1: 100,
    y1: 200,
    x2: 200,
    y2: 300,
    stroke: 'white',
    strokeWidth: 10,
  };

  const polyline = {
    id: 'polyline-1',
    type: 'polyline',
    points: '100,0 200,100 300,0',
    stroke: 'white',
    strokeWidth: 10,
    zIndex: 3,
  };

  const path = {
    id: 'path-1',
    type: 'path',
    d: 'M 100 0 L 200 100 L 300 0 Z',
    stroke: 'black',
    strokeWidth: 10,
    zIndex: 3,
  }

  const vn = {
    type: 'vector-network',
    id: 'vn-1',
    zIndex: 3,
    stroke: 'black',
    strokeWidth: 10,
    fill: 'red',

    // The vertices of the triangle
    vertices: [
      { x: 100, y: 0 },
      { x: 200, y: 100 },
      { x: 300, y: 0 },
    ],

    // The edges of the triangle. 'start' and 'end' refer to indices in the vertices array.
    segments: [
      {
        start: 0,
        tangentStart: { x: 0, y: 0 }, // optional
        end: 1,
        tangentEnd: { x: 0, y: 0 }, // optional
      },
      {
        start: 1,
        end: 2,
      },
      {
        start: 2,
        end: 0,
      },
    ],

    // The loop that forms the triangle. Each loop is a
    // sequence of indices into the segments array.
    regions: [{ fillRule: 'nonzero', loops: [[0, 1, 2]] }],
  };

  // Bezier
  const vn2 = {
    type: 'vector-network',
    id: 'vn-2',
    zIndex: 3,
    stroke: 'black',
    strokeWidth: 10,
    vertices: [
      {
        x: 0,
        y: 0,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
      {
        x: 100,
        y: 0,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }
    ],
    segments: [
      {
        start: 0,
        end: 1,
        tangentStart: { x: 50, y: -50 },
        tangentEnd: { x: -50, y: -50 }
      }
    ],
    regions: []
  };

  const vn3 = {
    type: 'vector-network',
    id: 'vn-3',
    zIndex: 3,
    stroke: 'black',
    strokeWidth: 10,
    fill: 'red',
    "regions": [
      {
        "fillRule": "nonzero",
        "loops": [
          [
            10,
            11,
            12,
            13
          ]
        ],
        "fills": [
          {
            "type": "SOLID",
            "visible": true,
            "opacity": 1,
            "blendMode": "NORMAL",
            "color": {
              "r": 0.9882352948188782,
              "g": 0.5411764979362488,
              "b": 0.4117647111415863
            },
            "boundVariables": {}
          }
        ],
        "fillStyleId": ""
      }
    ],
    "segments": [
      {
        "start": 0,
        "end": 1,
        "tangentStart": {
          "x": 10.685233116149902,
          "y": -64.4997329711914
        },
        "tangentEnd": {
          "x": -70.5,
          "y": -8.500020027160645
        }
      },
      {
        "start": 1,
        "end": 2,
        "tangentStart": {
          "x": 34.5614013671875,
          "y": 64.82703399658203
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 2,
        "end": 3,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 17.183069229125977,
          "y": -48.62030029296875
        }
      },
      {
        "start": 3,
        "end": 4,
        "tangentStart": {
          "x": -74,
          "y": 39.99969482421875
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 4,
        "end": 0,
        "tangentStart": {
          "x": 10.739418029785156,
          "y": -64.82703399658203
        },
        "tangentEnd": {
          "x": -10.685233116149902,
          "y": 64.4997329711914
        }
      },
      {
        "start": 5,
        "end": 1,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": -11.520466804504395,
          "y": 50.96342086791992
        }
      },
      {
        "start": 3,
        "end": 5,
        "tangentStart": {
          "x": -28.8987979888916,
          "y": -62.483909606933594
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 4,
        "end": 5,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 6,
        "end": 7,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 7,
        "end": 8,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 2,
        "end": 1,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 1,
        "end": 5,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 5,
        "end": 3,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      },
      {
        "start": 3,
        "end": 2,
        "tangentStart": {
          "x": 0,
          "y": 0
        },
        "tangentEnd": {
          "x": 0,
          "y": 0
        }
      }
    ],
    "vertices": [
      {
        "x": 144,
        "y": 73.6352767944336,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "ANGLE_AND_LENGTH"
      },
      {
        "x": 294.5,
        "y": 2.135254383087158,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "ANGLE_AND_LENGTH"
      },
      {
        "x": 383,
        "y": 168.13525390625,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      },
      {
        "x": 339,
        "y": 292.63531494140625,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "ANGLE_AND_LENGTH"
      },
      {
        "x": 116.5,
        "y": 239.63525390625,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      },
      {
        "x": 265,
        "y": 132.63525390625,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      },
      {
        "x": 51,
        "y": 37.135257720947266,
        "strokeCap": "ARROW_LINES",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      },
      {
        "x": 33,
        "y": 177.13525390625,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      },
      {
        "x": 0,
        "y": 85.6352767944336,
        "strokeCap": "NONE",
        "strokeJoin": "MITER",
        "cornerRadius": 0,
        "handleMirroring": "NONE"
      }
    ]
  }

  api.updateNodes([
    // vn,
    // vn2,
    // vn3,
    node1,
    // node2,
    // line,
    // polyline,
    // path
    // node3,
    // edge1, edge2
  ]);
  // api.selectNodes([node1])

    isLoading = false;

  const animation = api.animate(
    node1,
    [
      { fill: 'green', d: 'M 100 0 L 200 100 L 300 0 Z' },
      { fill: 'red', d: 'M 100 0 L 200 100 L 300 0 Q 400 100 500 0' },
    ],
    { duration: 1000, direction: 'alternate', iterations: 'infinite', easing: 'ease-in-out' },
  );

  // animation.finish();
  });

const VelloRendererPlugin = RendererPlugin.configure({
  setupDeviceSystemCtor: InitVello,
  rendererSystemCtor: VelloPipeline,
});
DefaultPlugins.splice(DefaultPlugins.indexOf(DefaultRendererPlugin), 1, VelloRendererPlugin);
// registerFont('/Gaegu-Regular.ttf');
// registerFont('/NotoSansCJKsc-VF.ttf');
// registerFont('/NotoSans-Regular.ttf');
// registerFont('/NotoSans-Bold.ttf');
// registerFont('/NotoSans-Italic.ttf');
// registerFont('/NotoSansArabic.ttf');

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
    YogaPlugin
  );
  app.run();
} catch (e) {
  console.error(e);
}
