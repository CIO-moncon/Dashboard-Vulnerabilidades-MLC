import { SyncManager } from '../../core/offline/syncManager';
import { AuthService } from '../../core/auth/authService';

export interface ActivoTerreno {
  id: string;
  tag: string;
  area: string;
  siteId: string;
  lat: number | null;
  lng: number | null;
  sev: string;
  components: any[];
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
  evidencias: Array<{ tipo: string; data: string }>;
  timestamp: string;
  inspector: string;
  estado: string;
}

const DB_NAME = 'CIOPredictivoDB';
const DB_VERSION = 1;
const STORE_CATASTRO = 'catastro_equipos';

const abrirBovedaCatastro = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const guardarCatastroLocal = async (catalogo: ActivoTerreno[] = []): Promise<void> => {
  try {
    const db = await abrirBovedaCatastro();
    if (!db.objectStoreNames.contains(STORE_CATASTRO)) return;

    const tx = db.transaction([STORE_CATASTRO], 'readwrite');
    const store = tx.objectStore(STORE_CATASTRO);
    store.clear();
    for (const item of catalogo) {
      store.put(item);
    }
  } catch (err) {
    console.warn('[TerrenoCore] Fallo al guardar catastro en IndexedDB:', err);
  }
};

export const cargarCatastroLocal = async (): Promise<ActivoTerreno[]> => {
  try {
    const db = await abrirBovedaCatastro();
    if (!db.objectStoreNames.contains(STORE_CATASTRO)) return [];

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CATASTRO], 'readonly');
      const store = tx.objectStore(STORE_CATASTRO);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
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
  const badge = document.getElementById('badgeConexion');
  if (!badge) return;

  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');

  if (estaEnLinea) {
    badge.textContent = '🟢 ONLINE';
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = '#34d399';
  } else {
    badge.textContent = '🔴 OFFLINE';
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#f87171';
  }
};