# vello-renderer

Using [Vello](https://github.com/linebender/vello) as the minimum workable example of a 2D GPU rendering layer, the structure references the rendering process of [Graphite](https://github.com/GraphiteEditor/Graphite).

## Introduction

Vello is a 2D rendering engine based on GPU Compute that uses wgpu to access the GPU, making it suitable as a rendering backend for 2D scenes such as infinite canvases. This example demonstrates:

- Create windows with event loops using winit
- Use vello::util::RenderContext to manage wgpu devices and surfaces
- Build a Scene (fill/stroke shape) and render it to the texture via Renderer::render_to_texture
- Render the result blit to the window surface and present

## Environmental requirements

- **Rust**: 1.88 or higher (vello 0.7 requires edition 2024)
  - If the current version is lower: 'rustup update'
- GPU drivers that support **WebGPU/wgpu** (desktop: Vulkan / Metal / D3D12; Browser: Chrome 113+, etc.)

## Run

### Desktop

```bash
cd packages/vello-renderer
cargo run
```

Successful will open a window to draw rounded rectangles, circles, and line segments.

### Browser (Wasm)

1. Install [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) (if not already installed): 'cargo install wasm-pack'
2. Execute pnpm build:vello in the project root directory, or under vello-renderer: wasm-pack build --target web, and the pkg/' directory will be generated.  
   - Using 'pnpm build:vello' will automatically remove 'pkg/.gitignore' after the build, making it easier to include pkg in version control.
3. Open with a local server (HTTP required, not file://): 'npx serve.' and access the prompted address (e.g. <http://localhost:3000>).

Requires a browser that supports WebGPU (e.g., Chrome 113+, Edge 113+).

The canvas needs to be created by JS and passed in: await init() first, then call runWithCanvas(canvas, onReady). canvas must be DOM inserted; If the width and height are 0, it will be automatically set by pressing 'clientWidth'/'clientHeight'. **Support for multiple canvases**: Call 'runWithCanvas' separately for multiple canvas, each will call back 'onReady(canvasId)' when ready, and then 'addRect'/'addCircle' needs to pass in the corresponding 'canvasId'.

```js
import init, { runWithCanvas, addRect } from './pkg/vello_renderer.js';
await init();
const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 600;
document.getElementById('container').appendChild(canvas);
runWithCanvas(canvas, (canvasId) => {
    addRect(canvasId, {
        id: 'r1',
        x: 100,
        y: 100,
        width: 80,
        height: 60,
        fill: [1, 0, 0, 1],
    });
});
```

## JS API（仅 Wasm）

In the browser, the wasm module can be introduced via 'import' to append graphics from JS to the canvas. The coordinates are world coordinates and will change with the canvas panning/zooming. The parameter is Object Format, and optional fields and camelCase are supported.

| Method                           | description                                                                                                                                                                  |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `runWithCanvas(canvas, onReady)` | Start the render with the specified canvas. 'onReady(canvasId)' is called when the canvas is ready, and subsequent add\* needs to pass the 'canvasId'. Multi-canvas support. |
| `addRect(canvasId, options)`     | add a rectangle on the specified canvas options`: `{ id, parentId?, zIndex?, x, y, width, height, radius?, fill?, stroke? }`                                                 |
| `addCircle(canvasId, options)`   | add a circle on the specified canvas。`options`: `{ id, parentId?, zIndex?, cx, cy, r, fill?, stroke? }`                                                                      |
| `addLine(canvasId, options)`     | add line segments on the specified canvas。`options`: `{ id, parentId?, zIndex?, x1, y1, x2, y2, strokeWidth?, color? }`                                                      |
| `addText(canvasId, options)`     | Add text on the specified canvas. Need to call first `registerDefaultFont(字体字节)`。`options` ditto。                                                                            |
| `registerDefaultFont(bytes)`     | register the default font。`bytes` For **Uint8Array** Or **ArrayBuffer**（TTF/OTF bytes for follow up `addText` render uses。                                                   |
| `clearShapes(canvasId)`          | Empty all graphics added by JS on the specified canvas。                                                                                                                      |

- id: Required, unique identifier used by parentId to establish a parent-child relationship.
- **parentId**: Optional; If it is passed, the current graph is a child node of the ID corresponding to the graph, and its coordinates (x/y, cx/cy, etc.) are the parent node local space. When there is no parentId, it is the world coordinates.
- **zIndex**: Optional, integer, default 0; the larger the value, the higher it is drawn, and the same zIndex is added in the order in which it is added.
- **fill** / **color**: RGBA array '[r, g, b, a]', with values 0–1; default fill white, stroke black.
- **stroke**: optional, '{ width, color? } `； No pass or 'width ≤ 0' means no stroke.
- radius: Rectangular filleted corners, default 0 (right angles).
- strokeWidth: The line width of the segment, default 1.

Example (called after getting 'canvasId' in 'onReady' callback of 'runWithCanvas'):

```js
import init, { addRect, addCircle, addLine, clearShapes, runWithCanvas } from './pkg/vello_renderer.js';
await init();
const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);
runWithCanvas(canvas, (canvasId) => {
  addRect(canvasId, {
  addRect(canvasId, {
  id: 'rect1',
  x: 300,
  y: 100,
  width: 120,
  height: 80,
  radius: 10,
  fill: [1, 0.6, 0.2, 1],
});

  addCircle(canvasId, {
  id: 'circle1',
  cx: 550,
  cy: 300,
  r: 60,
  fill: [1, 0.5, 0.6, 1],
  stroke: { width: 2, color: [1, 1, 1, 1] },
});

  addCircle(canvasId, {
  id: 'child1',
  parentId: 'rect1',
  cx: 60,
  cy: 40,
  r: 25,
  fill: [1, 1, 0.8, 1],
});

  addLine(canvasId, {
  id: 'line1',
  x1: 100,
  y1: 400,
  x2: 400,
  y2: 350,
  strokeWidth: 4,
  color: [0.3, 0.8, 1, 1],
});

  // clearShapes(canvasId);
});
```

**Text**: You need to register the font (TTF/OTF bytes) first, and then call 'addText(canvasId, options)' in the onReady callback. For example:

```js
runWithCanvas(canvas, (canvasId) => {
    fetch('.../NotoSans-Regular.ttf')
        .then((r) => r.arrayBuffer())
        .then((buf) => {
            registerDefaultFont(buf);
            addText(canvasId, {
                id: 't1',
                content: 'Hello',
                anchorX: 100,
                anchorY: 200,
                fontSize: 24,
                fill: [0, 0, 0, 1],
            });
        });
});
```

## Project structure

```plaintext
packages/vello-renderer/
├── Cargo.toml   # dependOn：vello, winit, pollster, anyhow；wasm：wasm-bindgen 等
├── index.html   # browser entry load pkg/vello_renderer.js
├── README.md
├── src/
│   ├── lib.rs   # shared-logic + run_native / run_wasm_async + runWithCanvas
│   └── main.rs  # desktop-entrance
└── pkg/         # wasm-pack build generation
```

## 参考

- [Vello - linebender](https://github.com/linebender/vello)
- [Graphite - GraphiteEditor](https://github.com/GraphiteEditor/Graphite)
- [Vello README 中的 Getting started](https://github.com/linebender/vello#getting-started)
