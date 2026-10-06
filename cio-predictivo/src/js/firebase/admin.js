// src/js/firebase/admin.js
import { auth, db } from './config.js';

// Inicializamos una app secundaria silenciosa solo para crear cuentas
// IMPORTANTE: Usa los mismos datos de tu config.js aquí
const adminApp = firebase.initializeApp({
    apiKey: "TU_API_KEY", 
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
}, "SecondaryApp");

window.crearNuevoUsuario = async function() {
    const nombre = document.getElementById('nuevo-nombre').value;
    const email = document.getElementById('nuevo-email').value;
    const rol = document.getElementById('nuevo-rol').value;
    const msgBox = document.getElementById('admin-msg');
    const passGenerica = "Cmp2026.";

    if (!nombre || !email) {
        msgBox.style.color = "var(--status-alarma)";
        msgBox.innerText = "Completa todos los campos.";
        return;
    }

    try {
        msgBox.style.color = "var(--text-main)";
        msgBox.innerText = "Creando usuario...";

        // 1. Crear el usuario en Firebase Auth usando la app secundaria
        const userCredential = await adminApp.auth().createUserWithEmailAndPassword(email, passGenerica);
        const nuevoUid = userCredential.user.uid;

        // 2. Guardar el rol y nombre en la base de datos usando la conexión principal
        await db.ref(`usuarios_cio/${nuevoUid}`).set({
            nombre: nombre,
            email: email,
            rol: rol, // Guardará "lector", "analista" o "admin"
            faena: "Mina Los Colorados", // Mantenemos tu estándar
            fechaRegistro: new Date().toISOString() // Usamos tu formato de nombre de variable
        });

        // 3. Desconectar la app secundaria para limpiarla
        await adminApp.auth().signOut();

        msgBox.style.color = "var(--status-ok)";
        msgBox.innerText = `✅ ${rol.toUpperCase()} creado con éxito.`;
        
        // Limpiar inputs
        document.getElementById('nuevo-nombre').value = '';
        document.getElementById('nuevo-email').value = '';

    } catch (error) {
        console.error("Error creando usuario:", error);
        msgBox.style.color = "var(--status-critico)";
        msgBox.innerText = "Error: " + error.message;
    }
};