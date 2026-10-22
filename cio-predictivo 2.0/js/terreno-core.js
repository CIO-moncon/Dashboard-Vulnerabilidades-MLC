// ============================================================================
// NÚCLEO TERRENO: FIREBASE, INDEXEDDB Y MOTOR OFFLINE (v2.1.0)
// CIO PREDICTIVO 2.0 — Mina Los Colorados | CPF Ingeniería
// ============================================================================

const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc",
    storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
    messagingSenderId: "1043912631590",
    appId: "1:1043912631590:web:14638fc1503882f1268de7"
});

let db = null;
let activosRef = null;
let dbAlertas = null;

try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        activosRef = db.ref('activos_criticos'); 
        dbAlertas = db.ref('alertas_terreno');
    }
} catch (error) {
    console.error('Error al inicializar los servicios de Firebase en terreno-core:', error);
}

const DB_NAME = 'CIO_BovedaOffline';
const DB_VERSION = 2; 
const STORE_PENDIENTES = 'reportes_pendientes';
const STORE_CATASTRO = 'catastro_equipos';

let dbLocal = null;
let sincronizando = false;

const abrirBovedaLocal = () =>
    new Promise((resolve, reject) => {
        if (dbLocal) {
            resolve(dbLocal);
            return;
        }

        if (!window.indexedDB) {
            reject(new Error('IndexedDB no está disponible en este navegador.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const base = e.target.result;
            if (!base.objectStoreNames.contains(STORE_PENDIENTES)) {
                base.createObjectStore(STORE_PENDIENTES, { keyPath: 'id_local' });
            }
            if (!base.objectStoreNames.contains(STORE_CATASTRO)) {
                base.createObjectStore(STORE_CATASTRO, { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            dbLocal = e.target.result;
            dbLocal.onclose = () => { dbLocal = null; };
            resolve(dbLocal);
        };

        request.onerror = (e) => {
            dbLocal = null;
            reject(e.target.error);
        };
    });

const inicializarBoveda = async () => {
    try {
        await abrirBovedaLocal();
        await actualizarContadorOffline();
        if (navigator.onLine) {
            window.sincronizarBovedaOffline();
        }
    } catch (err) {
        console.warn('La bóveda local offline no pudo iniciarse de inmediato:', err);
    }
};

window.guardarEnBoveda = async (payload = {}) => {
    try {
        const base = await abrirBovedaLocal();
        const registro = {
            ...payload,
            id_local: payload.id_local ?? `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            fechaGuardadoLocal: new Date().toISOString()
        };

        await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_PENDIENTES, 'readwrite');
            const store = tx.objectStore(STORE_PENDIENTES);
            const req = store.add(registro);
            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(e.target.error);
        });

        window.mostrarNotificacion?.('📴 Guardado en bóveda local (Sin cobertura).');
        await actualizarContadorOffline();

        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('sync-reportes-terreno');
        }

        return true;
    } catch (error) {
        console.error('Error al guardar reporte en bóveda offline:', error);
        window.mostrarNotificacion?.('⚠️ Error al guardar en almacenamiento offline.', 'error');
        return false;
    }
};

window.sincronizarBovedaOffline = async () => {
    if (sincronizando || !navigator.onLine || !dbAlertas) return;

    try {
        const base = await abrirBovedaLocal();

        const reportes = await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_PENDIENTES, 'readonly');
            const store = tx.objectStore(STORE_PENDIENTES);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result ?? []);
            req.onerror = (e) => reject(e.target.error);
        });

        if (reportes.length === 0) return;

        sincronizando = true;
        window.mostrarIndicadorSync?.(true);
        window.mostrarNotificacion?.(`🟢 Sincronizando ${reportes.length} reporte(s) pendiente(s)...`);

        for (const reporte of reportes) {
            const idTemp = reporte.id_local;
            const reporteParaSubir = { ...reporte };
            delete reporteParaSubir.id_local;
            delete reporteParaSubir.fechaGuardadoLocal;

            try {
                await dbAlertas.push(reporteParaSubir);

                await new Promise((res, rej) => {
                    const deleteTx = base.transaction(STORE_PENDIENTES, 'readwrite');
                    const deleteStore = deleteTx.objectStore(STORE_PENDIENTES);
                    const delReq = deleteStore.delete(idTemp);
                    delReq.onsuccess = () => res(true);
                    delReq.onerror = (err) => rej(err.target.error);
                });
            } catch (itemError) {
                console.error(`Error al sincronizar reporte temporal ${idTemp}:`, itemError);
                break;
            }
        }
    } catch (error) {
        console.error('Error durante la sincronización de la bóveda offline:', error);
    } finally {
        sincronizando = false;
        await actualizarContadorOffline();
        window.mostrarIndicadorSync?.(false);
    }
};

const actualizarContadorOffline = async () => {
    try {
        const base = await abrirBovedaLocal();
        const total = await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_PENDIENTES, 'readonly');
            const store = tx.objectStore(STORE_PENDIENTES);
            const req = store.count();
            req.onsuccess = () => resolve(req.result ?? 0);
            req.onerror = (e) => reject(e.target.error);
        });

        const cDiv = document.getElementById('contadorOffline');
        if (cDiv) {
            cDiv.textContent = String(total);
            cDiv.setAttribute('aria-label', `${total} reportes pendientes por sincronizar`);
        }

        return total;
    } catch (err) {
        console.warn('No se pudo leer el contador offline:', err);
        return 0;
    }
};

window.actualizarContadorOffline = actualizarContadorOffline;

export const guardarCatastroLocal = async (catalogo = []) => {
    try {
        const base = await abrirBovedaLocal();
        const tx = base.transaction(STORE_CATASTRO, 'readwrite');
        const store = tx.objectStore(STORE_CATASTRO);
        await store.clear();
        for (const item of catalogo) {
            store.put(item);
        }
    } catch (err) {
        console.warn('Fallo al guardar catastro en IndexedDB:', err);
    }
};

export const cargarCatastroLocal = async () => {
    try {
        const base = await abrirBovedaLocal();
        return await new Promise((resolve) => {
            const tx = base.transaction(STORE_CATASTRO, 'readonly');
            const store = tx.objectStore(STORE_CATASTRO);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result ?? []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
};

const actualizarBadgeConexion = (estaEnLinea) => {
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

window.addEventListener('online', () => {
    actualizarBadgeConexion(true);
    window.sincronizarBovedaOffline();
});

window.addEventListener('offline', () => {
    actualizarBadgeConexion(false);
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.accion === 'DESPACHAR_BOVEDA_OFFLINE') {
            window.sincronizarBovedaOffline();
        }
    });
}

inicializarBoveda();

export { db, activosRef, dbAlertas, abrirBovedaLocal, actualizarContadorOffline };