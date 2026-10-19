// ============================================================================
// MÓDULO CORE: AUTH.JS
// CIO PREDICTIVO 2.0 — Estándar ES6+, Control de Acceso por Roles (RBAC) y Seguridad
// ============================================================================

import { auth, db } from './firebase-config.js';

// ----------------------------------------------------------------------------
// DEFINICIÓN DE ROLES Y MATRIZ DE PERMISOS (RBAC)
// ----------------------------------------------------------------------------
export const ROLES = Object.freeze({
    ADMIN: 'ADMINISTRADOR',
    SUPERVISOR: 'SUPERVISOR',
    ANALISTA: 'ANALISTA CBM',
    OPERADOR: 'OPERADOR TERRENO'
});

const PERMISOS_POR_ROL = Object.freeze({
    [ROLES.ADMIN]: [
        'VER_DASHBOARD',
        'CREAR_EQUIPO',
        'EDITAR_EQUIPO',
        'ELIMINAR_EQUIPO',
        'GESTIONAR_ALERTAS',
        'MODULO_PMS',
        'CONFIGURACION'
    ],
    [ROLES.SUPERVISOR]: [
        'VER_DASHBOARD',
        'CREAR_EQUIPO',
        'EDITAR_EQUIPO',
        'GESTIONAR_ALERTAS',
        'MODULO_PMS'
    ],
    [ROLES.ANALISTA]: [
        'VER_DASHBOARD',
        'EDITAR_EQUIPO',
        'GESTIONAR_ALERTAS',
        'MODULO_PMS'
    ],
    [ROLES.OPERADOR]: [
        'VER_DASHBOARD',
        'CREAR_REPORTE_TERRENO'
    ]
});

const CLAVE_STORAGE = 'cio_sesion';
let sesionActual = null;

// Mapa de errores Firebase Auth a mensajes descriptivos
const ERRORES_AUTH = Object.freeze({
    'auth/user-not-found': 'El correo electrónico no está registrado en el sistema.',
    'auth/wrong-password': 'La contraseña ingresada es incorrecta.',
    'auth/invalid-email': 'El formato del correo electrónico no es válido.',
    'auth/user-disabled': 'Esta cuenta de usuario ha sido inhabilitada.',
    'auth/too-many-requests': 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.',
    'auth/network-request-failed': 'Error de conexión. Verifique su acceso a internet.',
    'auth/invalid-credential': 'Las credenciales proporcionadas son inválidas o han expirado.'
});

// ----------------------------------------------------------------------------
// SERVICIOS DE AUTENTICACIÓN
// ----------------------------------------------------------------------------

/**
 * Autentica al usuario en Firebase Auth y valida su perfil en la tabla RBAC.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{exito: boolean, usuario?: object, mensaje?: string}>}
 */
export const autenticarUsuario = async (email, password) => {
    try {
        const correoLimpio = email?.trim() ?? '';
        const passLimpio = password?.trim() ?? '';

        if (!correoLimpio || !passLimpio) {
            return { exito: false, mensaje: 'Debe ingresar correo y contraseña.' };
        }

        // 1. Autenticación en Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(correoLimpio, passLimpio);
        const { user } = userCredential;

        // 2. Consulta de permisos y perfil RBAC en Realtime Database
        const snapshot = await db.ref(`usuarios_cio/${user.uid}`).once('value');

        if (!snapshot.exists()) {
            await auth.signOut();
            return {
                exito: false,
                mensaje: 'Acceso denegado: Usuario sin permisos asignados en el registro CIO.'
            };
        }

        const datosUsuario = snapshot.val() ?? {};
        const rolNormalizado = (datosUsuario.rol ?? ROLES.ANALISTA).toUpperCase();

        sesionActual = Object.freeze({
            uid: user.uid,
            email: datosUsuario.email ?? user.email,
            nombre: datosUsuario.nombre ?? (user.email ? user.email.split('@')[0].replace('.', ' ') : 'Usuario'),
            rol: rolNormalizado,
            faena: datosUsuario.faena ?? 'Mina Los Colorados',
            permisos: PERMISOS_POR_ROL[rolNormalizado] ?? ['VER_DASHBOARD'],
            ultimoAcceso: Date.now()
        });

        // Persistencia segura en Storage local
        try {
            localStorage.setItem(CLAVE_STORAGE, JSON.stringify(sesionActual));
        } catch (storageError) {
            console.warn('No se pudo guardar la sesión en localStorage:', storageError);
        }

        return { exito: true, usuario: sesionActual };

    } catch (error) {
        console.error('Error durante autenticarUsuario:', error);
        const mensaje = ERRORES_AUTH[error.code] ?? 'No se pudo iniciar sesión. Verifique sus credenciales.';
        return { exito: false, mensaje };
    }
};

/**
 * Retorna la sesión activa en memoria o la recupera desde localStorage.
 * Incluye validación de integridad para evitar excepciones por datos corruptos.
 * @returns {object|null}
 */
export const obtenerSesionActiva = () => {
    if (sesionActual) return sesionActual;

    const sesionGuardada = localStorage.getItem(CLAVE_STORAGE);
    if (!sesionGuardada) return null;

    try {
        const datos = JSON.parse(sesionGuardada);
        if (datos?.uid && datos?.rol) {
            sesionActual = Object.freeze({
                ...datos,
                permisos: PERMISOS_POR_ROL[datos.rol] ?? ['VER_DASHBOARD']
            });
            return sesionActual;
        }
        localStorage.removeItem(CLAVE_STORAGE);
        return null;
    } catch {
        localStorage.removeItem(CLAVE_STORAGE);
        return null;
    }
};

/**
 * Cierra la sesión activa en memoria, elimina el almacenamiento local
 * y ejecuta signOut asincrónico en Firebase Auth.
 * @returns {Promise<void>}
 */
export const cerrarSesion = async () => {
    sesionActual = null;
    try {
        localStorage.removeItem(CLAVE_STORAGE);
    } catch (err) {
        console.warn('Error al limpiar localStorage:', err);
    }
    
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Error al cerrar sesión en Firebase Auth:', error);
    }
};

// ----------------------------------------------------------------------------
// GUARDIAS DE CONTROL DE ACCESO POR ROLES (RBAC HELPERS)
// ----------------------------------------------------------------------------

/**
 * Verifica si el usuario actual posee un rol específico o uno de los roles permitidos.
 * @param {string|string[]} rolesPermitidos
 * @returns {boolean}
 */
export const tieneRol = (rolesPermitidos) => {
    const sesion = obtenerSesionActiva();
    if (!sesion?.rol) return false;

    const listaRoles = Array.isArray(rolesPermitidos) 
        ? rolesPermitidos.map((r) => String(r).toUpperCase())
        : [String(rolesPermitidos).toUpperCase()];

    return listaRoles.includes(sesion.rol.toUpperCase());
};

/**
 * Valida si el usuario en sesión cuenta con un permiso operacional concreto.
 * @param {string} permiso - Ej: 'CREAR_EQUIPO', 'ELIMINAR_EQUIPO', 'MODULO_PMS'
 * @returns {boolean}
 */
export const tienePermiso = (permiso) => {
    const sesion = obtenerSesionActiva();
    return Boolean(sesion?.permisos?.includes(permiso));
};