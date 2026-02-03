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
import { LaserPointerPlugin } from '@infinite-canvas-tutorial/laser-pointer';
import { LassoPlugin } from '@infinite-canvas-tutorial/lasso';
import { EraserPlugin } from '@infinite-canvas-tutorial/eraser';
import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { usePromptInputAttachments } from './ai-elements/prompt-input';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
//@ts-ignore
import deepEqual from 'deep-equal';
import { useTheme } from 'next-themes';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Undo2, Redo2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileUIPart } from 'ai';
import { load } from '@loaders.gl/core';
import { ImageLoader } from '@loaders.gl/images';
import { RectSerializedNode } from '@infinite-canvas-tutorial/ecs';

// 定义暴露给父组件的 API 接口
export interface CanvasAPI {
  getApi: () => ExtendedAPI | null;
  insertImages: (imageUrls: string[], position?: { x: number; y: number }) => Promise<void>;
}

let appRunning = false;

// 用于标识本地操作的唯一标识符
const local = Math.random().toString();


// 全局 Yjs 文档和数组引用
let doc: Y.Doc | null = null;
let yArray: Y.Array<Y.Map<any>> | null = null;
let indexeddbProvider: IndexeddbPersistence | null = null;

// synchronize local nodes to yjs arrays
function recordLocalOps(
  yArray: Y.Array<Y.Map<any>>,
  nodes: readonly { version?: number; isDeleted?: boolean }[],
): void {
  doc?.transact(() => {
    nodes = nodes.filter((e) => !e.isDeleted);

    // synchronize array lengths
    while (yArray.length < nodes.length) {
      const map = new Y.Map();
      yArray.push([map]);
    }

    while (yArray.length > nodes.length) {
      yArray.delete(yArray.length - 1, 1);
    }

    // synchronize the properties of each node
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const map = yArray.get(i) as Y.Map<any> | undefined;
      if (!map) {
        break;
      }

      const elem = nodes[i];
      const currentVersion = map.get("version");

      if (currentVersion === elem.version) {
        continue;
      }

      // update-all-attributes
      for (const [key, value] of Object.entries(elem)) {
        const src = map.get(key);
        if (
          (typeof src === 'object' && !deepEqual(src, value)) ||
          src !== value
        ) {
          map.set(key, value);
        }
      }
    }
  }, local);
}

interface CanvasProps {
  id?: string;
  initialData?: SerializedNode[];
}

const Canvas = forwardRef<CanvasAPI, CanvasProps>(({ id = 'default', initialData }, ref) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExtendedAPI | null>(null);
  const projectIdRef = useRef<string>(id);
  const { resolvedTheme } = useTheme();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('zoom');

  const attachments = usePromptInputAttachments();

  // toolbar status
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

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

  // Update the undo/redo status
  const updateHistoryState = useCallback(() => {
    if (apiRef.current) {
      setCanUndo(!apiRef.current.isUndoStackEmpty());
      setCanRedo(!apiRef.current.isRedoStackEmpty());
    }
  }, []);

  const onReady = async (e: CustomEvent<any>) => {
    const api = e.detail as ExtendedAPI;
    apiRef.current = api;

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

    // initialize the toolbar state
    const appState = api.getAppState();
    setZoomLevel(appState.cameraZoom || 1);
    setCanUndo(!api.isUndoStackEmpty());
    setCanRedo(!api.isRedoStackEmpty());

    // Initialize the YJS documentation and IndexedDB persistent
    if (!doc) {
      doc = new Y.Doc();
      yArray = doc.getArray("nodes");

      // create IndexedDB provider For local persistence
      indexeddbProvider = new IndexeddbPersistence(`infinite-canvas-data-${id}`, doc);

      // wait for the indexeddb to finish loading
      await new Promise<void>((resolve) => {
        indexeddbProvider!.on('synced', () => {
          resolve();
        });
      });

      // Set up the API's onchange callback to sync canvas changes to Yjs and save them to the database
      api.onchange = (snapshot) => {
        const { nodes } = snapshot;
        if (yArray) {
          recordLocalOps(yArray, nodes);
        }
        // Convert nodes to SerializedNode[] and save to database (use throttle to limit frequency)
        const serializedNodes = nodes.filter((node) => !node.isDeleted) as SerializedNode[];
        throttledSaveCanvasData(serializedNodes);
        // update the undo redo status
        updateHistoryState();
      };
    }

    // load saved nodes from yjs if any
    let savedNodes: SerializedNode[] = [];
    if (yArray && yArray.length > 0) {
      savedNodes = yArray.toArray().map((map: Y.Map<any>) => map.toJSON()) as SerializedNode[];
    }

    // If there is no saved node, use the default node
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
      taskbarSelected: [ Task.SHOW_LAYERS_PANEL],
      checkboardStyle: CheckboardStyle.GRID,
      snapToPixelGridEnabled: true,
      snapToPixelGridSize: 1,
      snapToObjectsEnabled: false,
      snapToObjectsDistance: 8,
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

  // how to insert a picture
  const insertImages = useCallback(async (imageUrls: string[], position?: { x: number; y: number }) => {
    const api = apiRef.current;
    if (!api) {
      console.warn('Canvas API is not ready yet');
      return;
    }

    try {
      await Promise.all(imageUrls.map(async (imageUrl) => {
        await api.createImageFromFile(imageUrl, position);
      }));
    } catch (error) {
      console.error('Failed to insert images:', error);
    }
  }, []);

  // Use the useImperativeHandle to expose the API to the parent component
  useImperativeHandle(ref, () => ({
    getApi: () => apiRef.current,
    insertImages,
  }), [insertImages]);

  const onSelectedNodesChanged = async (e: CustomEvent<any>) => {
    const currentApi = apiRef.current;
    if (!currentApi) {
      return;
    }

    const selectedNodes = currentApi.getAppState().layersSelected.map(id => currentApi.getNodeById(id));

    try {
      attachments.clear();
      const files: (File | FileUIPart)[] = await Promise.all(selectedNodes.map(async node => {
        // Image
        if (node.type === 'rect') {
          const base64OrURL = (node as any).fill as string;
          const isDataURL = base64OrURL.startsWith('data:');
          const isURL = base64OrURL.startsWith('http');

          if (isDataURL) {
            // convert base64 strings to blobs
            const base64Data = base64OrURL.includes(',')
              ? base64OrURL.split(',')[1]
              : base64OrURL;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            // Extract the MIME type from the data URL, which defaults to image/png
            const mimeType = base64OrURL.match(/data:([^;]+);/)?.[1] || 'image/png';
            const blob = new Blob([byteArray], { type: mimeType });

            // Create a File object from a blob, using node.id as the file name
            return new File([blob], node.id, { type: mimeType });
          } else if (isURL) {
            // fetch HEAD to get the MIME type
            const response = await fetch(base64OrURL, { method: 'HEAD' });
            const mediaType = response.headers.get('content-type') || 'image/png';
            const filename = base64OrURL.split('/').pop()?.split('?')[0] || node.id;
            return {
              id: node.id,
              type: 'file' as const,
              url: base64OrURL,
              mediaType,
              filename,
            } as FileUIPart;
          }
        }
        return {
          id: node.id,
          type: 'file' as const,
          url: 'shape', // TODO: should create mask later
          mediaType: 'application/octet-stream',
          filename: node.id,
        } as FileUIPart;
      }));

      if (files.length > 0) {
        attachments.add(files.filter(Boolean) as File[]);
      }
    } catch (error) {
      console.error('Failed to convert base64 to File:', error);
    }
  };

  useEffect(() => {
    if (!appRunning) {
      new App().addPlugins(...DefaultPlugins, UIPlugin
        , LaserPointerPlugin, LassoPlugin, EraserPlugin
    ).run();
      appRunning = true;
    }
  }, []);

  // listen for zoom changes
  const onZoomChanged = useCallback((e: CustomEvent<{ zoom: number }>) => {
    setZoomLevel(e.detail.zoom);
  }, []);

  // process revocation
  const handleUndo = useCallback(() => {
    if (apiRef.current && !apiRef.current.isUndoStackEmpty()) {
      apiRef.current.undo();
      // Delay updating the status and wait for API processing to complete
      setTimeout(updateHistoryState, 0);
    }
  }, [updateHistoryState]);

  // processing rework
  const handleRedo = useCallback(() => {
    if (apiRef.current && !apiRef.current.isRedoStackEmpty()) {
      apiRef.current.redo();
      // Delay updating the status and wait for API processing to complete
      setTimeout(updateHistoryState, 0);
    }
  }, [updateHistoryState]);

  // scaling related helper functions
  const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.33, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
  const findZoomCeil = (zoom: number) => {
    return ZOOM_STEPS.find((step) => step > zoom) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  };
  const findZoomFloor = (zoom: number) => {
    return [...ZOOM_STEPS].reverse().find((step) => step < zoom) || ZOOM_STEPS[0];
  };

  // handle scaling
  const handleZoomIn = useCallback(() => {
    if (apiRef.current) {
      const currentZoom = apiRef.current.getAppState().cameraZoom;
      apiRef.current.zoomTo(findZoomCeil(currentZoom));
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (apiRef.current) {
      const currentZoom = apiRef.current.getAppState().cameraZoom;
      apiRef.current.zoomTo(findZoomFloor(currentZoom));
    }
  }, []);

  const handleZoomTo50 = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.zoomTo(0.5);
    }
  }, []);

  const handleZoomTo100 = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.zoomTo(1);
    }
  }, []);

  const handleZoomTo200 = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.zoomTo(2);
    }
  }, []);

  const handleFitToProject = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.fitToScreen();
    }
  }, []);

  const handleFitToSelection = useCallback(() => {
    if (!apiRef.current) {
      return;
    }
    const selectedIds = apiRef.current.getAppState().layersSelected;
    if (selectedIds.length === 0) {
      return;
    }
    const selectedNodes = selectedIds
      .map(id => apiRef.current!.getNodeById(id))
      .filter(Boolean) as SerializedNode[];
    if (selectedNodes.length === 0) {
      return;
    }
    const bounds = apiRef.current.getBounds(selectedNodes);
    // check that the boundary is valid
    if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
      return;
    }
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) {
      return;
    }
    // get the dimensions of the canvas element
    const canvasElement = apiRef.current.getCanvasElement();
    const canvasWidth = canvasElement.clientWidth || canvasElement.width;
    const canvasHeight = canvasElement.clientHeight || canvasElement.height;
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }
    const scaleX = canvasWidth / width;
    const scaleY = canvasHeight / height;
    const newZoom = Math.min(scaleX, scaleY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const currentZoom = apiRef.current.getAppState().cameraZoom;
    apiRef.current.gotoLandmark(
      apiRef.current.createLandmark({
        x: centerX - canvasWidth / 2 / currentZoom,
        y: centerY - canvasHeight / 2 / currentZoom,
      }),
      {
        duration: 0,
        onfinish: () => {
          apiRef.current?.zoomTo(newZoom);
        },
      },
    );
  }, []);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === '+' || e.key === '=') && e.metaKey) {
      e.preventDefault();
      handleZoomIn();
    } else if ((e.key === '-' || e.key === '_') && e.metaKey) {
      e.preventDefault();
      handleZoomOut();
    } else if (e.key === '1' && e.metaKey) {
      e.preventDefault();
      handleZoomTo100();
    } else if (e.key === '2' && e.metaKey) {
      e.preventDefault();
      handleZoomTo200();
    } else if (e.key === '0' && e.metaKey) {
      e.preventDefault();
      handleFitToProject();
    }
  }, []);

  useEffect(() => {
    canvasRef.current?.addEventListener(Event.READY, onReady);
    canvasRef.current?.addEventListener(Event.SELECTED_NODES_CHANGED, onSelectedNodesChanged);
    canvasRef.current?.addEventListener(Event.ZOOM_CHANGED, onZoomChanged as EventListener);

    return () => {
      // clean up resources
      if (indexeddbProvider) {
        indexeddbProvider.destroy();
        indexeddbProvider = null;
      }
      if (doc) {
        doc.destroy();
        doc = null;
        yArray = null;
      }
      canvasRef.current?.removeEventListener(Event.READY, onReady);
      canvasRef.current?.removeEventListener(Event.SELECTED_NODES_CHANGED, onSelectedNodesChanged);
      canvasRef.current?.removeEventListener(Event.ZOOM_CHANGED, onZoomChanged as EventListener);
    }
  }, [onZoomChanged]);

  useEffect(() => {
    if (apiRef.current && resolvedTheme) {
      apiRef.current.setThemeMode(resolvedTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    import('@infinite-canvas-tutorial/webcomponents/spectrum');
    import('@infinite-canvas-tutorial/lasso/spectrum');
    import('@infinite-canvas-tutorial/eraser/spectrum');
    import('@infinite-canvas-tutorial/laser-pointer/spectrum');
  }, []);

  return (
    <div className="relative w-full h-full" onKeyDown={handleCanvasKeyDown}>
      <ic-spectrum-canvas ref={canvasRef} className="w-full h-full" app-state='{"topbarVisible":false}'>
        <ic-spectrum-penbar-laser-pointer slot="penbar-item" />
        <ic-spectrum-penbar-eraser slot="penbar-item" />
        {/* <ic-spectrum-taskbar-chat slot="taskbar-item" />
        <ic-spectrum-taskbar-chat-panel slot="taskbar-panel" /> */}

      </ic-spectrum-canvas>
      <div className="absolute bottom-0 right-0 flex items-center gap-2 p-4 z-50">
        <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={!canUndo}
            className="h-8 w-8"
            title="撤销 (⌘Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRedo}
            disabled={!canRedo}
            className="h-8 w-8"
            title="重做 (⇧⌘Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 px-2 gap-1 text-sm font-medium"
              >
                <span className="min-w-[50px] text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" alignOffset={-5} sideOffset={8}>
              <DropdownMenuItem onClick={handleZoomIn}>
                {t('zoomIn')}
                <span className="ml-auto text-xs text-muted-foreground">⌘+</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleZoomOut}>
                {t('zoomOut')}
                <span className="ml-auto text-xs text-muted-foreground">⌘-</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleZoomTo50}>
                {t('zoomTo50')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleZoomTo100}>
                {t('zoomTo100')}
                <span className="ml-auto text-xs text-muted-foreground">⌘1</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleZoomTo200}>
                {t('zoomTo200')}
                <span className="ml-auto text-xs text-muted-foreground">⌘2</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleFitToProject}>
                {t('fitToProject')}
                <span className="ml-auto text-xs text-muted-foreground">⌘0</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleFitToSelection}
                disabled={!apiRef.current || apiRef.current.getAppState().layersSelected.length === 0}
              >
                {t('fitToSelection')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;
