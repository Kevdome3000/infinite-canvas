import type { API, SerializedNode } from '@infinite-canvas-tutorial/ecs';

export async function render(api: API) {
  const nodes: SerializedNode[] = [
    { id: 'polyline1', type: 'polyline', zIndex: 0,
    points: '50,50 150,150 150,50',
    strokes: [{ type: 'solid', value: 'red' }],
    strokeWidth: 20,
    strokeLinejoin: 'round',
    },
    { id: 'polyline2', type: 'polyline', zIndex: 1,
    points: '150,50 250,150 250,50',
    strokes: [{ type: 'solid', value: 'red' }],
    strokeWidth: 20,
    strokeLinejoin: 'bevel',
    },
    { id: 'polyline3', type: 'polyline', zIndex: 2,
    points: '250,50 350,150 350,50',
    strokes: [{ type: 'solid', value: 'red' }],
    strokeWidth: 20,
    strokeLinejoin: 'miter',
    },
    { id: 'polyline4', type: 'polyline', zIndex: 3,
    points: '50,200 150,300 150,200',
    strokes: [{ type: 'solid', value: 'red' }],
    strokeWidth: 20,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    },
    { id: 'polyline5', type: 'polyline', zIndex: 4,
    points: '200,200 300,300 300,200',
    strokes: [{ type: 'solid', value: 'red' }],
    strokeWidth: 20,
    strokeLinejoin: 'round',
    strokeLinecap: 'square',
    }
  ];
  await api.edit(() => api.updateNodes(nodes));
}
