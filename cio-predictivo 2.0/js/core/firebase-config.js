// ==========================================
// MÓDULO CORE: CONEXIÓN A FIREBASE REALTIME DB
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
  authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
  databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
  projectId: "dashboard-vulnerabilidades-mlc",
  storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
  messagingSenderId: "1043912631590",
  appId: "1:1043912631590:web:14638fc1503882f1268de7",
  measurementId: "G-MBLS9ZNJJL"
};

// Inicializar la Conexión a Google
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase Iniciado: Conectado a CIO Predictivo 2.0 (Los Colorados)");
}

// Exportar las referencias conectadas a TUS nodos reales
export const db = firebase.database();
export const auth = firebase.auth();

export const refEquipos = db.ref('activos_criticos');
export const refAlertas = db.ref('alertas_terreno');
export const refUsuarios = db.ref('usuarios_cio');