import type { API, SerializedNode } from '@infinite-canvas-tutorial/ecs';

export async function render(api: API) {
  const nodes: SerializedNode[] = [
    { id: 'polyline1', type: 'polyline', zIndex: 0,
    points: '50,50 50,150 100,150 100,50',
    strokes: [{ type: 'solid', value: 'black' }],
    strokeWidth: 20,
    strokeDasharray: '10,10',
    fills: [],
    },
    { id: 'polyline2', type: 'polyline', zIndex: 1,
    points: '150,50 150,150 200,150 200,50',
    strokes: [{ type: 'solid', value: 'black' }],
    strokeWidth: 20,
    strokeDasharray: '10,10',
    strokeDashoffset: 10,
    fills: [],
    },
    { id: 'polyline3', type: 'polyline', zIndex: 2,
    points: '250,50 250,150 300,150 300,50',
    strokes: [{ type: 'solid', value: 'black' }],
    strokeWidth: 20,
    strokeDasharray: '5,10',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fills: [],
    }
  ];
  await api.edit(() => api.updateNodes(nodes));
}
