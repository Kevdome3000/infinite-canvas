import { SerializedNode, AppState } from '@infinite-canvas-tutorial/ecs';

export interface CanvasData {
  id: string;
  name: string;
  nodes: SerializedNode[];
  appState: Partial<AppState>;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface StorageService {
  // Canvas CRUD
  saveCanvas(canvas: CanvasData): Promise<void>;
  loadCanvas(id: string): Promise<CanvasData | null>;
  deleteCanvas(id: string): Promise<void>;

  // List operations
  listCanvases(): Promise<CanvasMetadata[]>;

  // Utility
  generateId(): string;
}
