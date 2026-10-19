// ============================================================================
// NÚCLEO TERRENO: FIREBASE, INDEXEDDB Y MOTOR OFFLINE
// CIO PREDICTIVO 2.0 — Estándar ES6+, Control de Concurrencia y Sincronización Segura
// ============================================================================

// ----------------------------------------------------------------------------
// CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE (COMPATIBILIDAD INDUSTRIAL)
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// CONFIGURACIÓN DE BÓVEDA LOCAL (INDEXEDDB)
// ----------------------------------------------------------------------------
const DB_NAME = 'CIO_BovedaOffline';
const DB_VERSION = 1;
const STORE_NAME = 'reportes_pendientes';

let dbLocal = null;
let sincronizando = false; // Mutex anti-colisión para evitar duplicados en red lenta

/**
 * Conexión asíncrona segura a IndexedDB en modo Singleton
 * @returns {Promise<IDBDatabase>}
 */
const abrirBovedaLocal = () =>
    new Promise((resolve, reject) => {
        if (dbLocal) {
            resolve(dbLocal);
            return;
        }

        if (!window.indexedDB) {
            reject(new Error('IndexedDB no está disponible en este entorno o navegador.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const base = e.target.result;
            if (!base.objectStoreNames.contains(STORE_NAME)) {
                base.createObjectStore(STORE_NAME, { keyPath: 'id_local' });
            }
        };

        request.onsuccess = (e) => {
            dbLocal = e.target.result;
            dbLocal.onclose = () => {
                dbLocal = null;
            };
            resolve(dbLocal);
        };

        request.onerror = (e) => {
            dbLocal = null;
            console.error('Error al abrir IndexedDB:', e.target.error);
            reject(e.target.error);
        };
    });

/**
 * Inicialización de la bóveda local al arranque del script
 */
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

// ----------------------------------------------------------------------------
// OPERACIONES DE ALMACENAMIENTO LOCAL Y SINCRONIZACIÓN
// ----------------------------------------------------------------------------

/**
 * Guarda un reporte en la bóveda IndexedDB cuando se pierde la conexión
 * @param {object} payload
 * @returns {Promise<boolean>}
 */
window.guardarEnBoveda = async (payload = {}) => {
    try {
        const base = await abrirBovedaLocal();
        const registro = {
            ...payload,
            id_local: payload.id_local ?? `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            fechaGuardadoLocal: new Date().toISOString()
        };

        await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(registro);

            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(e.target.error);
        });

        window.mostrarNotificacion?.('📴 Reporte almacenado en bóveda offline.');
        await actualizarContadorOffline();
        return true;
    } catch (error) {
        console.error('Error al guardar reporte en bóveda offline:', error);
        window.mostrarNotificacion?.('⚠️ Error al guardar en almacenamiento offline.', 'error');
        return false;
    }
};

/**
 * Sincroniza secuencialmente los reportes locales con Firebase al recuperar señal
 */
window.sincronizarBovedaOffline = async () => {
    // Verificación de prerequisitos y semáforo de sincronización
    if (sincronizando || !navigator.onLine || !dbAlertas) return;

    try {
        const base = await abrirBovedaLocal();

        const reportes = await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result ?? []);
            req.onerror = (e) => reject(e.target.error);
        });

        if (reportes.length === 0) return;

        sincronizando = true;
        window.mostrarIndicadorSync?.(true);
        window.mostrarNotificacion?.(`🟢 Sincronizando ${reportes.length} reporte(s) pendiente(s)...`);

        // Sincronización secuencial para evitar condiciones de carrera en base de datos
        for (const reporte of reportes) {
            const idTemp = reporte.id_local;
            const reporteParaSubir = { ...reporte };
            delete reporteParaSubir.id_local;

            try {
                // 1. Envío a Firebase Realtime Database
                await dbAlertas.push(reporteParaSubir);

                // 2. Eliminación atómica del registro local una vez confirmado en el servidor
                await new Promise((res, rej) => {
                    const deleteTx = base.transaction(STORE_NAME, 'readwrite');
                    const deleteStore = deleteTx.objectStore(STORE_NAME);
                    const delReq = deleteStore.delete(idTemp);
                    delReq.onsuccess = () => res(true);
                    delReq.onerror = (err) => rej(err.target.error);
                });
            } catch (itemError) {
                console.error(`Error al sincronizar reporte temporal ${idTemp}:`, itemError);
                // Si falla un elemento por timeout de red, se detiene la secuencia para reintentar después
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

/**
 * Consulta la cantidad de elementos en espera y actualiza el contador accesible en UI
 * @returns {Promise<number>}
 */
const actualizarContadorOffline = async () => {
    try {
        const base = await abrirBovedaLocal();
        const total = await new Promise((resolve, reject) => {
            const tx = base.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
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

// ----------------------------------------------------------------------------
// LISTENERS DE CONECTIVIDAD Y ESTADO DE RED
// ----------------------------------------------------------------------------
const actualizarBadgeConexion = (estaEnLinea) => {
    const badge = document.getElementById('badgeConexion');
    if (!badge) return;

    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');

    if (estaEnLinea) {
        badge.textContent = '🟢 ONLINE';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#34d399';
        badge.setAttribute('aria-label', 'Conexión activa con el servidor');
    } else {
        badge.textContent = '🔴 OFFLINE';
        badge.style.background = 'rgba(239, 68, 68, 0.15)';
        badge.style.color = '#f87171';
        badge.setAttribute('aria-label', 'Modo offline activado. Los datos se guardarán localmente');
    }
};

window.addEventListener('online', () => {
    actualizarBadgeConexion(true);
    window.sincronizarBovedaOffline();
});

window.addEventListener('offline', () => {
    actualizarBadgeConexion(false);
});

// ----------------------------------------------------------------------------
// REGISTRO DEL SERVICE WORKER (PWA)
// ----------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('sw.js');
        } catch (swError) {
            console.warn('Registro de Service Worker omitido o no compatible:', swError);
        }
    });
}

// Inicialización de arranque
inicializarBoveda();

// ----------------------------------------------------------------------------
// CONTRATOS DE EXPORTACIÓN MODULAR
// ----------------------------------------------------------------------------
export { db, activosRef, dbAlertas, abrirBovedaLocal, actualizarContadorOffline };