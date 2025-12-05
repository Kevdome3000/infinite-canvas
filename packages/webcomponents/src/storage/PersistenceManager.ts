import { SerializedNode, AppState } from '@infinite-canvas-tutorial/ecs';
import { StorageService, CanvasData } from './StorageService';
import { debounce } from '../utils';

export class PersistenceManager {
  private canvasId: string | null = null;
  private canvasName: string = 'Untitled Canvas';
  private createdAt: number = Date.now();
  private isLoading: boolean = false; // Flag to prevent race conditions
  private onSaveError?: (error: Error) => void;

  private debouncedSave = debounce(() => this.save(), 1000);

  constructor(private storage: StorageService) {}

  setCanvasId(id: string, name?: string) {
    this.canvasId = id;
    if (name) this.canvasName = name;
  }

  getCanvasId(): string | null {
    return this.canvasId;
  }

  setErrorHandler(handler: (error: Error) => void) {
    this.onSaveError = handler;
  }

  // Called from API.onchange
  onStateChange(snapshot: { appState: AppState; nodes: SerializedNode[] }) {
    // CRITICAL: Do not save if we are currently loading a canvas
    if (this.isLoading) return;

    if (this.canvasId) {
      this.currentSnapshot = snapshot;
      this.debouncedSave();
    }
  }

  private currentSnapshot: { appState: AppState; nodes: SerializedNode[] } | null = null;

  updateSnapshot(snapshot: { appState: AppState; nodes: SerializedNode[] }) {
    this.currentSnapshot = snapshot;
    this.onStateChange(snapshot);
  }

  private async save() {
    if (!this.canvasId || !this.currentSnapshot || this.isLoading) return;

    const canvasData: CanvasData = {
      id: this.canvasId,
      name: this.canvasName,
      nodes: this.currentSnapshot.nodes,
      appState: this.currentSnapshot.appState,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };

    try {
      await this.storage.saveCanvas(canvasData);
      console.log(`[Persistence] Saved canvas ${this.canvasId}`);
    } catch (e) {
      console.error('[Persistence] Save failed', e);
      if (this.onSaveError) {
        this.onSaveError(e as Error);
      }
    }
  }

  async loadCanvas(id: string): Promise<CanvasData | null> {
    this.isLoading = true; // Start loading lock
    try {
      const data = await this.storage.loadCanvas(id);
      if (data) {
        this.canvasId = data.id;
        this.canvasName = data.name;
        this.createdAt = data.createdAt;
        this.currentSnapshot = {
          nodes: data.nodes,
          appState: data.appState as AppState
        };
      }
      return data;
    } finally {
      // Release lock after a short delay to allow the editor to settle
      setTimeout(() => {
        this.isLoading = false;
      }, 100);
    }
  }

  async createNewCanvas(name?: string): Promise<string> {
    this.canvasId = this.storage.generateId();
    this.canvasName = name || 'Untitled Canvas';
    this.createdAt = Date.now();
    this.currentSnapshot = null;
    return this.canvasId;
  }

  // Expose storage for listing canvases
  getStorage(): StorageService {
    return this.storage;
  }

  // Force immediate save (useful for "Back" button)
  async forceSave(): Promise<void> {
    this.debouncedSave.flush();
    // Wait a bit to ensure debounced save completes
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
