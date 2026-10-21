import type { API, SerializedNode } from '@infinite-canvas-tutorial/ecs';

export async function render(api: API) {
  const nodes: SerializedNode[] = [
    { id: 'rect1', type: 'rect', zIndex: 0,
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    fills: [{ type: 'solid', value: 'black' }],
    dropShadowBlurRadius: 10,
    dropShadowColor: 'red',
    dropShadowOffsetX: 10,
    dropShadowOffsetY: 10,
    },
    { id: 'rect2', type: 'rect', zIndex: 1,
    x: 200,
    y: 50,
    width: 100,
    height: 100,
    fills: [{ type: 'solid', value: 'black' }],
    strokes: [{ type: 'solid', value: 'black', opacity: 0.5 }],
    strokeWidth: 10,
    dropShadowBlurRadius: 10,
    dropShadowColor: 'red',
    },
    { id: 'rect3', type: 'rect', zIndex: 2,
    x: 50,
    y: 250,
    width: 100,
    height: 100,
    fills: [{ type: 'image', value: new URL('canvas.png', document.baseURI).href }],
    strokes: [{ type: 'solid', value: 'black', opacity: 0.5 }],
    strokeWidth: 10,
    dropShadowBlurRadius: 10,
    dropShadowColor: 'red',
    }
  ];
  await api.edit(() => api.updateNodes(nodes));
}
