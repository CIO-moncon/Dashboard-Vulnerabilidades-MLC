export interface OutboxItem<T = any> {
  id: string;
  tenantId: string;
  userId: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'CBM_MEASURE';
  resource: string;
  payload: T;
  timestamp: number;
  intentos: number;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'FALLIDO';
}

const DB_NAME = 'CIOPredictivoDB';
const DB_VERSION = 1;
const STORE_OUTBOX = 'cbm_outbox';

export class OutboxDatabase {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static abrirDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public static async encolarOperacion<T>(
    tenantId: string,
    userId: string,
    actionType: OutboxItem['actionType'],
    resource: string,
    payload: T
  ): Promise<OutboxItem<T>> {
    const db = await this.abrirDB();
    const item: OutboxItem<T> = {
      id: `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tenantId,
      userId,
      actionType,
      resource,
      payload,
      timestamp: Date.now(),
      intentos: 0,
      estado: 'PENDIENTE'
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX], 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      const req = store.add(item);

      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }

  public static async obtenerPendientesPorTenant(tenantId: string): Promise<OutboxItem[]> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX], 'readonly');
      const store = tx.objectStore(STORE_OUTBOX);
      const req = store.getAll();

      req.onsuccess = () => {
        const todos: OutboxItem[] = req.result || [];
        const filtrados = todos.filter(
          (item) => item.tenantId === tenantId && item.estado !== 'EN_PROCESO'
        );
        resolve(filtrados);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public static async eliminarItems(ids: string[]): Promise<void> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX], 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);

      ids.forEach((id) => store.delete(id));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}