// src/js/firebase/config.js

const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc"
};

// Inicializamos Firebase de forma global (usando las librerías compat del index.html)
firebase.initializeApp(firebaseConfig);

// Exportamos las referencias para usarlas en otros módulos
export const auth = firebase.auth();
export const db = firebase.database();