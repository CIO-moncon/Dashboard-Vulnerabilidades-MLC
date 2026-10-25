import { SyncManager } from '../../core/offline/syncManager';
import { AuthService } from '../../core/auth/authService';

export interface ComponenteActivo {
  id: string;
  nombre: string;
  tipo: string;
  rmsActual?: number;
  temperatura?: number;
  condicion?: string;
}

export interface ActivoTerreno {
  id: string;
  tenantId: string;
  tag: string;
  area: string;
  siteId: string;
  lat: number | null;
  lng: number | null;
  sev: string;
  components: ComponenteActivo[];
}

export interface EvidenciaAlerta {
  tipo: 'IMAGEN_BASE64' | 'AUDIO_NOTA' | 'ESPECTRO_FFT';
  data: string;
  metadata?: Record<string, unknown>;
}

export interface AlertaTerrenoPayload {
  tenantId: string;
  area: string;
  tag: string;
  componente: string;
  severidad: string;
  severidadIso?: string;
  rmsLectura?: number;
  detalle: string;
  descripcion: string;
  evidencias: EvidenciaAlerta[];
  timestamp: string;
  inspector: string;
  estado: string;
}

const DB_NAME = 'CIOPredictivoDB';
const DB_VERSION = 2; // Sincronizado con OutboxDatabase
const STORE_CATASTRO = 'catastro_equipos';
const STORE_OUTBOX = 'cbm_outbox';

const abrirBovedaCatastro = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB no disponible'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Garantizar la existencia de ambos almacenes
      if (!db.objectStoreNames.contains(STORE_CATASTRO)) {
        const storeCatastro = db.createObjectStore(STORE_CATASTRO, { keyPath: 'id' });
        storeCatastro.createIndex('tenantId', 'tenantId', { unique: false });
        storeCatastro.createIndex('tag', 'tag', { unique: false });
        storeCatastro.createIndex('tenant_tag', ['tenantId', 'tag'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const storeOutbox = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        storeOutbox.createIndex('tenantId', 'tenantId', { unique: false });
        storeOutbox.createIndex('estado', 'estado', { unique: false });
        storeOutbox.createIndex('timestamp', 'timestamp', { unique: false });
        storeOutbox.createIndex('tenant_estado', ['tenantId', 'estado'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const guardarCatastroLocal = async (catalogo: ActivoTerreno[] = []): Promise<void> => {
  try {
    const sesion = AuthService.getSesion();
    const tenantIdActual = sesion?.tenantId;
    const db = await abrirBovedaCatastro();

    if (!db.objectStoreNames.contains(STORE_CATASTRO)) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CATASTRO], 'readwrite');
      const store = tx.objectStore(STORE_CATASTRO);

      catalogo.forEach((item) => {
        store.put({
          ...item,
          tenantId: item.tenantId || tenantIdActual || 'default_tenant'
        });
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[TerrenoCore] Fallo al guardar catastro en IndexedDB:', err);
  }
};

export const cargarCatastroLocal = async (): Promise<ActivoTerreno[]> => {
  try {
    const sesion = AuthService.getSesion();
    const tenantIdActual = sesion?.tenantId;
    const db = await abrirBovedaCatastro();

    if (!db.objectStoreNames.contains(STORE_CATASTRO)) return [];

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CATASTRO], 'readonly');
      const store = tx.objectStore(STORE_CATASTRO);

      if (tenantIdActual && store.indexNames.contains('tenantId')) {
        const index = store.index('tenantId');
        const req = index.getAll(IDBKeyRange.only(tenantIdActual));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      }
    });
  } catch {
    return [];
  }
};

export const transmitirAlertaTerreno = async (
  payload: AlertaTerrenoPayload
): Promise<{ exito: boolean; modo: 'online' | 'offline_outbox' }> => {
  const sesion = AuthService.getSesion();
  const tenantId = sesion?.tenantId || payload.tenantId;

  const resultado = await SyncManager.despacharOEncolar(
    `alerta_terreno:${payload.tag}`,
    'CREATE',
    {
      ...payload,
      tenantId
    }
  );

  return {
    exito: true,
    modo: resultado.sincronizadoDirecto ? 'online' : 'offline_outbox'
  };
};

export const actualizarBadgeConexionUI = (estaEnLinea: boolean): void => {
  if (typeof document === 'undefined') return;

  const badge = document.getElementById('badgeConexion');
  if (!badge) return;

  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');

  if (estaEnLinea) {
    badge.textContent = '🟢 ONLINE';
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = '#34d399';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
  } else {
    badge.textContent = '🔴 OFFLINE';
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#f87171';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  }
};