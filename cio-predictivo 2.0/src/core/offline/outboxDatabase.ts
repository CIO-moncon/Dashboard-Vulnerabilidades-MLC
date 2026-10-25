export interface OutboxItem<T = unknown> {
  id: string;
  tenantId: string;
  userId: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'CBM_MEASURE';
  resource: string;
  payload: T;
  timestamp: number;
  intentos: number;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'FALLIDO';
  ultimoError?: string;
  fechaUltimoIntento?: number;
}

const DB_NAME = 'CIOPredictivoDB';
const DB_VERSION = 2; // Incrementado para soportar índices compuestos
const STORE_OUTBOX = 'cbm_outbox';

export class OutboxDatabase {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static abrirDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return Promise.reject(new Error('IndexedDB no está soportado en este entorno.'));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        let store: IDBObjectStore;

        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        } else {
          store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_OUTBOX);
        }

        // Creación y actualización de índices
        if (!store.indexNames.contains('tenantId')) {
          store.createIndex('tenantId', 'tenantId', { unique: false });
        }
        if (!store.indexNames.contains('estado')) {
          store.createIndex('estado', 'estado', { unique: false });
        }
        if (!store.indexNames.contains('timestamp')) {
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!store.indexNames.contains('tenant_estado')) {
          store.createIndex('tenant_estado', ['tenantId', 'estado'], { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        db.onclose = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
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

      let req: IDBRequest<OutboxItem[]>;

      if (store.indexNames.contains('tenant_estado')) {
        const index = store.index('tenant_estado');
        req = index.getAll(IDBKeyRange.only([tenantId, 'PENDIENTE']));
      } else {
        const index = store.index('tenantId');
        req = index.getAll(IDBKeyRange.only(tenantId));
      }

      req.onsuccess = () => {
        const items = req.result || [];
        // Filtrar pendientes en caso de usar el índice simple
        const pendientes = items.filter((item) => item.estado === 'PENDIENTE');
        resolve(pendientes);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public static async actualizarEstado(
    id: string,
    estado: OutboxItem['estado'],
    errorMensaje?: string
  ): Promise<void> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX], 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      const req = store.get(id);

      req.onsuccess = () => {
        const item: OutboxItem | undefined = req.result;
        if (!item) {
          resolve();
          return;
        }

        item.estado = estado;
        item.fechaUltimoIntento = Date.now();

        if (estado === 'FALLIDO') {
          item.intentos += 1;
          if (errorMensaje) item.ultimoError = errorMensaje;
        }

        const updateReq = store.put(item);
        updateReq.onsuccess = () => resolve();
        updateReq.onerror = () => reject(updateReq.error);
      };

      req.onerror = () => reject(req.error);
    });
  }

  public static async eliminarItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
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