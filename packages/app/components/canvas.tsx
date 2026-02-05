'use client';

import { throttle } from 'lodash-es';
import { upload } from '@vercel/blob/client';
import {
  App,
  Pen,
  DefaultPlugins,
  Task,
  CheckboardStyle,
  SerializedNode,
  ThemeMode,
} from '@infinite-canvas-tutorial/ecs';
import { Event, UIPlugin, ExtendedAPI } from '@infinite-canvas-tutorial/webcomponents';
// import { SAMPlugin } from '@infinite-canvas-tutorial/sam';
import { LaserPointerPlugin } from '@infinite-canvas-tutorial/laser-pointer';
import { LassoPlugin } from '@infinite-canvas-tutorial/lasso';
import { EraserPlugin } from '@infinite-canvas-tutorial/eraser';
import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useParams } from 'next/navigation';
import { useAtom, useSetAtom } from 'jotai';
import { selectedNodesAtom, canvasApiAtom } from '@/atoms/canvas-selection';
import { CanvasYjsManager } from '@/lib/yjs/canvas-yjs-manager';
import ZoomToolbar from './zoom-toolbar';

let appRunning = false;

interface CanvasProps {
  id?: string;
  initialData?: SerializedNode[];
}

const Canvas = ({ id = 'default', initialData }: CanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef<string>(id);
  const yjsManagerRef = useRef<CanvasYjsManager | null>(null);
  const { resolvedTheme } = useTheme();
  const params = useParams();
  const locale = params.locale as string;

  const setSelectedNodes = useSetAtom(selectedNodesAtom);
  const [canvasApi, setCanvasApi] = useAtom(canvasApiAtom);

  // Update projectIdRef when the id changes
  useEffect(() => {
    projectIdRef.current = id;
  }, [id]);

  // A function that saves canvas data to a database
  const saveCanvasData = useCallback(async (nodes: SerializedNode[]) => {
    const projectId = projectIdRef.current;
    // If the id is 'default', it means that it is not a project page and does not need to be saved
    if (projectId === 'default') {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          canvasData: nodes,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save canvas data:', await response.text());
      }
    } catch (error) {
      console.error('Error saving canvas data:', error);
    }
  }, []);

  // Create a throttle version of the save function, which is executed up to once every 1 second
  const throttledSaveCanvasData = useRef(
    throttle(saveCanvasData, 1000)
  ).current;

  const onReady = async (e: CustomEvent<any>) => {
    const api = e.detail as ExtendedAPI;
    setCanvasApi(api);

    api.setLocale(locale);
    api.setThemeMode(resolvedTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT);
    api.upload = async (file: File) => {
      // TODO: if already uploaded, return the url directly
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/assets/upload',
      });
      return blob.url;
    };

    // initialize the yjs manager
    if (!yjsManagerRef.current) {
      yjsManagerRef.current = new CanvasYjsManager(id);
      await yjsManagerRef.current.waitForSync();

      // Set up the API's onchange callback to sync canvas changes to Yjs and save them to the database
      api.onchange = (snapshot) => {
        const { nodes } = snapshot;
        if (yjsManagerRef.current) {
          yjsManagerRef.current.recordLocalOps(nodes);
        }
        // Convert nodes to SerializedNode[] and save to database (use throttle to limit frequency)
        const serializedNodes = nodes.filter((node) => !node.isDeleted) as SerializedNode[];
        throttledSaveCanvasData(serializedNodes);
      };
    }

    // load saved nodes from yjs if any
    const savedNodes = yjsManagerRef.current.loadNodes();
    const nodes: SerializedNode[] = initialData || savedNodes;

    api.setAppState({
      language: locale,
      themeMode: resolvedTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT,
      cameraZoom: 0.35,
      topbarVisible: false,
      penbarSelected: Pen.SELECT,
      penbarAll: [Pen.HAND, Pen.SELECT, Pen.DRAW_RECT, Pen.DRAW_ELLIPSE, Pen.DRAW_LINE, Pen.DRAW_ARROW, Pen.DRAW_ROUGH_RECT, Pen.DRAW_ROUGH_ELLIPSE, Pen.IMAGE, Pen.TEXT, Pen.PENCIL, Pen.BRUSH, Pen.ERASER, Pen.LASER_POINTER],
      penbarText: {
        ...api.getAppState().penbarText,
        fontFamily: 'system-ui',
        fontFamilies: ['system-ui', 'serif', 'monospace', 'Gaegu'],
      },
      taskbarAll: [
        Task.SHOW_LAYERS_PANEL,
        Task.SHOW_PROPERTIES_PANEL,
      ],
      taskbarSelected: [],
      checkboardStyle: CheckboardStyle.GRID,
      snapToPixelGridEnabled: true,
      snapToPixelGridSize: 1,
      snapToObjectsEnabled: false,
      snapToObjectsDistance: 8,
      taskbarVisible: true,
      contextBarVisible: false,
      rotateEnabled: false,
      flipEnabled: false,
    });

    api.runAtNextTick(() => {
      api.updateNodes(nodes);
      if (nodes.length > 0) {
        api.selectNodes([nodes[0]]);
      }
      api.record();
    });
  };

  const onSelectedNodesChanged = async (e: CustomEvent<any>) => {
    setSelectedNodes(e.detail.selected);
  };

  useEffect(() => {
    if (!appRunning) {
      new App().addPlugins(...DefaultPlugins, UIPlugin
        , LaserPointerPlugin, LassoPlugin, EraserPlugin,
        // SAMPlugin
    ).run();
      appRunning = true;
    }
  }, []);

  useEffect(() => {
    canvasRef.current?.addEventListener(Event.READY, onReady);
    canvasRef.current?.addEventListener(Event.SELECTED_NODES_CHANGED, onSelectedNodesChanged);

    return () => {
      if (canvasApi) {
        try {
          canvasApi.destroy();
        } catch (error) {
          console.error('Error destroying canvas:', error);
        }
        setCanvasApi(null);
      }
      if (yjsManagerRef.current) {
        yjsManagerRef.current.destroy();
        yjsManagerRef.current = null;
      }
      canvasRef.current?.removeEventListener(Event.READY, onReady);
      canvasRef.current?.removeEventListener(Event.SELECTED_NODES_CHANGED, onSelectedNodesChanged);
    }
  }, []);

  useEffect(() => {
    if (canvasApi && resolvedTheme) {
      canvasApi.setThemeMode(resolvedTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    import('@infinite-canvas-tutorial/webcomponents/spectrum');
    import('@infinite-canvas-tutorial/lasso/spectrum');
    import('@infinite-canvas-tutorial/eraser/spectrum');
    import('@infinite-canvas-tutorial/laser-pointer/spectrum');
  }, []);

  return (
    <div className="relative w-full h-full">
      <ic-spectrum-canvas ref={canvasRef} className="w-full h-full" app-state='{"topbarVisible":false}'>
        <ic-spectrum-penbar-laser-pointer slot="penbar-item" />
        <ic-spectrum-penbar-eraser slot="penbar-item" />
      </ic-spectrum-canvas>
      <ZoomToolbar
        canvasApi={canvasApi}
        canvasRef={canvasRef}
      />
    </div>
  );
};

export default Canvas;
