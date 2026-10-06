// src/js/firebase/auth.js
import { auth, db } from './config.js';

// Variable global para exportar el rol actual y que otros módulos lo lean
export let usuarioActual = { uid: null, email: null, rol: 'lector' }; 

export function initAuth() {
    const modalLogin = document.getElementById('modal-login');
    const layoutApp = document.querySelector('.layout-dashboard');

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log(`✅ Autenticado: ${user.email}`);
            
            // Buscar el rol en la base de datos
            try {
                // 1. CAMBIO AQUÍ: Apuntamos al nodo usuarios_cio
                const snapshot = await db.ref(`usuarios_cio/${user.uid}`).once('value');
                const datosUsuario = snapshot.val();
                
                usuarioActual = {
                    uid: user.uid,
                    email: user.email,
                    // 2. CAMBIO AQUÍ: Convertimos a minúsculas para evitar errores de tipeo
                    rol: datosUsuario?.rol ? datosUsuario.rol.toLowerCase() : 'lector', 
                    nombre: datosUsuario?.nombre || 'Usuario'
                };
                
                console.log(`🛡️ Nivel de Acceso: ${usuarioActual.rol.toUpperCase()}`);
                
                // Mostrar UI y aplicar restricciones
                if (modalLogin) modalLogin.close();
                if (layoutApp) layoutApp.style.display = 'grid';
                
                aplicarPermisosUI();

            } catch (error) {
                console.error("Error obteniendo rol:", error);
            }
        } else {
            console.log("🔒 Sesión cerrada.");
            usuarioActual = { uid: null, email: null, rol: 'lector' };
            if (layoutApp) layoutApp.style.display = 'none';
            if (modalLogin) modalLogin.showModal(); 
        }
    });
}

function aplicarPermisosUI() {
    // Si NO es admin, ocultamos el botón de crear usuarios (que crearemos en el paso 3)
    const btnAdmin = document.getElementById('btn-panel-admin');
    if (btnAdmin) {
        btnAdmin.style.display = (usuarioActual.rol === 'admin') ? 'flex' : 'none';
    }

    // Ocultar botones de edición para lectores
    if (usuarioActual.rol === 'lector') {
        document.querySelectorAll('.btn-editar, .btn-guardar').forEach(btn => btn.style.display = 'none');
    }
}

// ... (Aquí mantienes tu código existente de window.iniciarSesion) ...

// Lógica de inicio de sesión (El resto queda igual a lo que ya tenías)
window.iniciarSesion = async function() {
    const email = document.getElementById('login-email')?.value;
    const pass = document.getElementById('login-pass')?.value;
    const errorMsg = document.getElementById('login-error');

    if (!email || !pass) {
        if(errorMsg) {
            errorMsg.innerText = '⚠️ Ingresa correo y contraseña';
            errorMsg.style.display = 'block';
        }
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        if(errorMsg) {
            errorMsg.innerText = '❌ Credenciales incorrectas o sin acceso.';
            errorMsg.style.display = 'block';
        }
    }
};

// Función global para que el HTML la pueda llamar
window.iniciarSesion = async function() {
    const email = document.getElementById('login-email')?.value;
    const pass = document.getElementById('login-pass')?.value;
    const errorMsg = document.getElementById('login-error');

    if (!email || !pass) {
        if(errorMsg) {
            errorMsg.innerText = '⚠️ Ingresa correo y contraseña';
            errorMsg.style.display = 'block';
        }
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        if(errorMsg) {
            errorMsg.innerText = '❌ Credenciales incorrectas o sin acceso.';
            errorMsg.style.display = 'block';
        }
    }
};