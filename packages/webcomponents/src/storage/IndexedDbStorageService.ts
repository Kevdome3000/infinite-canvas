import { StorageService, CanvasData, CanvasMetadata } from './StorageService';

const DB_NAME = 'InfiniteCanvasDB';
const DB_VERSION = 1;
const STORE_NAME = 'canvases';

export class IndexedDbStorageService implements StorageService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  async saveCanvas(canvas: CanvasData): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(canvas);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadCanvas(id: string): Promise<CanvasData | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCanvas(id: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listCanvases(): Promise<CanvasMetadata[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll(); // Get all for now, can optimize with cursor later

      request.onsuccess = () => {
        const canvases = request.result as CanvasData[];
        const metadata = canvases.map(c => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        })).sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(metadata);
      };
      request.onerror = () => reject(request.error);
    });
  }

  generateId(): string {
    return crypto.randomUUID();
  }
}
