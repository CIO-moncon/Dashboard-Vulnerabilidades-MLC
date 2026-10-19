// ============================================================================
// MÓDULO CORE: CONEXIÓN Y CONFIGURACIÓN FIREBASE REALTIME DATABASE
// CIO PREDICTIVO 2.0 — Estándar ES6+, Inicialización Defensiva y Singletons
// ============================================================================

/**
 * Configuración inmutable del proyecto en Google Firebase (Mina Los Colorados)
 */
export const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc",
    storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
    messagingSenderId: "1043912631590",
    appId: "1:1043912631590:web:14638fc1503882f1268de7",
    measurementId: "G-MBLS9ZNJJL"
});

// ----------------------------------------------------------------------------
// INICIALIZACIÓN DEFENSIVA DEL SDK DE GOOGLE FIREBASE
// ----------------------------------------------------------------------------
let appInstancia = null;
let dbInstancia = null;
let authInstancia = null;

try {
    const fb = typeof window !== 'undefined' ? window.firebase : (typeof firebase !== 'undefined' ? firebase : null);

    if (fb) {
        if (!fb.apps || fb.apps.length === 0) {
            appInstancia = fb.initializeApp(firebaseConfig);
        } else {
            appInstancia = fb.app();
        }

        dbInstancia = fb.database();
        authInstancia = fb.auth();
    } else {
        console.warn('⚠️ SDK de Google Firebase no detectado en el ámbito global. Verifique los scripts en index.html.');
    }
} catch (error) {
    console.error('🔥 Error crítico al inicializar Firebase en firebase-config.js:', error);
}

// ----------------------------------------------------------------------------
// EXPORTACIÓN DE SERVICIOS Y REFERENCIAS CORE (CONTRATOS COMPARTIDOS)
// ----------------------------------------------------------------------------
export const app = appInstancia;
export const db = dbInstancia;
export const auth = authInstancia;

// Referencias directas a los nodos maestros de Mina Los Colorados
export const refEquipos = dbInstancia ? dbInstancia.ref('activos_criticos') : null;
export const refAlertas = dbInstancia ? dbInstancia.ref('alertas_terreno') : null;
export const refUsuarios = dbInstancia ? dbInstancia.ref('usuarios_cio') : null;