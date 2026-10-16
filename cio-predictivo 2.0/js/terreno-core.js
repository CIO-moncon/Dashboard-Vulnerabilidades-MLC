// ==========================================
// NÚCLEO TERRENO: FIREBASE, INDEXEDDB Y OFFLINE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc",
    storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
    messagingSenderId: "1043912631590",
    appId: "1:1043912631590:web:14638fc1503882f1268de7"
};

let db = null, activosRef = null, dbAlertas = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        activosRef = db.ref('activos_criticos'); 
        dbAlertas = db.ref('alertas_terreno');
    }
} catch (e) { console.error("Error Firebase:", e); }

const DB_NAME = 'CIO_BovedaOffline';
const STORE_NAME = 'reportes_pendientes';
let dbLocal = null;

function inicializarBoveda() {
    try {
        if (!window.indexedDB) return;
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const base = e.target.result;
            if (!base.objectStoreNames.contains(STORE_NAME)) base.createObjectStore(STORE_NAME, { keyPath: 'id_local' });
        };
        request.onsuccess = (e) => {
            dbLocal = e.target.result;
            actualizarContadorOffline();
            window.sincronizarBovedaOffline();
        };
    } catch (error) {}
}
inicializarBoveda();

window.guardarEnBoveda = function(payload) {
    if (!dbLocal) return;
    payload.id_local = Date.now().toString();
    try {
        const tx = dbLocal.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(payload);
        tx.oncomplete = () => { window.mostrarNotificacion("📴 Guardado offline en boveda."); actualizarContadorOffline(); };
    } catch(e) {}
}

window.sincronizarBovedaOffline = function() {
    if (!navigator.onLine || !dbLocal || !dbAlertas) return;
    if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(true);
    try {
        const tx = dbLocal.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const reportes = request.result;
            if (reportes.length === 0) {
                if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(false);
                return;
            }
            window.mostrarNotificacion(`🟢 Sincronizando ${reportes.length} pendientes con Firebase...`);
            reportes.forEach(reporte => {
                const idTemp = reporte.id_local;
                delete reporte.id_local;
                dbAlertas.push(reporte).then(() => {
                    const deleteTx = dbLocal.transaction(STORE_NAME, 'readwrite');
                    deleteTx.objectStore(STORE_NAME).delete(idTemp);
                    deleteTx.oncomplete = () => {
                        actualizarContadorOffline();
                        if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(false);
                    };
                });
            });
        };
    } catch(e) {
        if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(false);
    }
}

function actualizarContadorOffline() {
    if (!dbLocal) return;
    try {
        const tx = dbLocal.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).count();
        request.onsuccess = () => {
            const count = request.result;
            const cDiv = document.getElementById('contadorOffline');
            if (cDiv) cDiv.innerText = count;
            if(count > 0 && navigator.onLine) window.sincronizarBovedaOffline();
        };
    } catch(e) {}
}

window.addEventListener('online', () => {
    const badge = document.getElementById('badgeConexion');
    if (badge) { badge.innerText = '🟢 ONLINE'; badge.style.background = 'rgba(16, 185, 129, 0.15)'; badge.style.color = '#34d399'; }
    window.sincronizarBovedaOffline();
});

window.addEventListener('offline', () => {
    const badge = document.getElementById('badgeConexion');
    if (badge) { badge.innerText = '🔴 OFFLINE'; badge.style.background = 'rgba(239, 68, 68, 0.15)'; badge.style.color = '#f87171'; }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

export { db, activosRef, dbAlertas };