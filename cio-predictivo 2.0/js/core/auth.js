import { auth, db } from './firebase-config.js';

let sesionActual = null;

export async function autenticarUsuario(email, password) {
    try {
        // 1. Validar correo y contraseña en Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 2. Buscar los datos del perfil (nombre, rol, faena) en Realtime Database
        const snapshot = await db.ref('usuarios_cio/' + user.uid).once('value');
        
        if (snapshot.exists()) {
            const datosUsuario = snapshot.val();
            sesionActual = {
                uid: user.uid,
                email: datosUsuario.email,
                nombre: datosUsuario.nombre,
                rol: datosUsuario.rol,
                faena: datosUsuario.faena
            };
            localStorage.setItem('cio_sesion', JSON.stringify(sesionActual));
            return { exito: true, usuario: sesionActual };
        } else {
            // Si entra pero no tiene perfil asignado en usuarios_cio
            await auth.signOut();
            return { exito: false, mensaje: 'Usuario sin permisos en la tabla CIO.' };
        }
    } catch (error) {
        console.error("Error de Firebase:", error);
        let mensaje = 'Credenciales inválidas.';
        if (error.code === 'auth/user-not-found') mensaje = 'El correo no está registrado.';
        if (error.code === 'auth/wrong-password') mensaje = 'Contraseña incorrecta.';
        return { exito: false, mensaje: mensaje };
    }
}

export function obtenerSesionActiva() {
    if (!sesionActual) {
        const guardada = localStorage.getItem('cio_sesion');
        if (guardada) sesionActual = JSON.parse(guardada);
    }
    return sesionActual;
}

export function cerrarSesion() {
    sesionActual = null;
    localStorage.removeItem('cio_sesion');
    auth.signOut(); // Cierra la sesión activa en el servidor de Google
}