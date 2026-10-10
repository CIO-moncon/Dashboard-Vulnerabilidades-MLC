import { autenticarUsuario, obtenerSesionActiva, cerrarSesion } from './core/auth.js';
import { renderizarExpediente } from './ui/expediente.js';
import { renderizarHallazgo } from './ui/terreno.js';
import { inicializarBarraLateral } from './ui/sidebar.js';

const vistaLogin = document.getElementById('vista-login');
const vistaApp = document.getElementById('vista-app');

function init() {
    const sesion = obtenerSesionActiva();
    if (sesion) activarInterfazApp(sesion);
    else activarPantallaLogin();
    configurarEventosBase();
}

function configurarEventosBase() {
    // 1. Evento Login
    document.getElementById('btn-ingresar').addEventListener('click', async () => {
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-pass').value.trim();
        const btn = document.getElementById('btn-ingresar');
        
        // Cambiar botón a estado de carga
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Validando...`;

        // Esperar la respuesta de Firebase
        const res = await autenticarUsuario(email, pass);
        
        if (res.exito) {
            activarInterfazApp(res.usuario);
        } else {
            document.getElementById('login-error').textContent = res.mensaje;
            btn.innerHTML = `Autenticar <span class="material-symbols-outlined">login</span>`; // Restaurar botón
        }
    });

    // 2. Evento Salir
    document.getElementById('btn-salir').addEventListener('click', () => {
        cerrarSesion();
        location.reload();
    });

    // 3. DELEGACIÓN DE EVENTOS MAESTRA (Clics dinámicos)
    document.addEventListener('click', (e) => {
        
        // --- A) Lógica de Pestañas (Tabs) ---
        const tabCatastro = e.target.closest('#btn-tab-catastro');
        if (tabCatastro) {
            document.getElementById('btn-tab-catastro').classList.add('active');
            document.getElementById('btn-tab-alertas').classList.remove('active');
            document.getElementById('lista-catastro').classList.remove('oculta');
            document.getElementById('lista-alertas').classList.add('oculta');
            return;
        }

        const tabAlertas = e.target.closest('#btn-tab-alertas');
        if (tabAlertas) {
            document.getElementById('btn-tab-alertas').classList.add('active');
            document.getElementById('btn-tab-catastro').classList.remove('active');
            document.getElementById('lista-alertas').classList.remove('oculta');
            document.getElementById('lista-catastro').classList.add('oculta');
            return;
        }

        // --- B) Navegación a Expediente CBM o Hallazgo en Terreno ---
        const itemNavegable = e.target.closest('.item-navegable');
        if (itemNavegable) {
            const target = itemNavegable.getAttribute('data-target');
            if (target === 'BF-3102') renderizarExpediente('BF-3102', 'espacio-trabajo-dinamico');
            if (target === 'alerta-001') renderizarHallazgo('alerta-001', 'espacio-trabajo-dinamico');
        }

        // --- C) Volver a Planta ---
        const btnVolver = e.target.closest('#btn-volver-dashboard');
        if (btnVolver) location.reload();

        // --- D) MODO KIOSKO ---
        const btnKiosko = e.target.closest('#btn-kiosko');
        if (btnKiosko) {
            if (!document.fullscreenElement) {
                // Entrar a pantalla completa
                document.documentElement.requestFullscreen().catch(err => console.log(err));
                document.body.classList.add('modo-kiosko');
                btnKiosko.innerHTML = `<span class="material-symbols-outlined">fullscreen_exit</span> Salir Kiosko`;
            } else {
                // Salir de pantalla completa
                document.exitFullscreen();
                document.body.classList.remove('modo-kiosko');
                btnKiosko.innerHTML = `<span class="material-symbols-outlined">fullscreen</span> Kiosko`;
            }
            return;
        }
    });

    // 4. Escuchar si el usuario presiona "ESC" en su teclado para salir del Kiosko
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.body.classList.remove('modo-kiosko');
            const btnKiosko = document.getElementById('btn-kiosko');
            if (btnKiosko) btnKiosko.innerHTML = `<span class="material-symbols-outlined">fullscreen</span> Kiosko`;
        }
    });
}

function activarPantallaLogin() {
    vistaApp.classList.remove('activa');
    vistaApp.classList.add('oculta');
    vistaLogin.classList.remove('oculta');
    vistaLogin.classList.add('activa');
}

function activarInterfazApp(usuario) {
    vistaLogin.classList.remove('activa');
    vistaLogin.classList.add('oculta');
    vistaApp.classList.remove('oculta');
    vistaApp.classList.add('activa');

    document.querySelector('.user-profile .name').textContent = usuario.nombre;
    document.querySelector('.user-profile .role').textContent = usuario.rol;
    document.querySelector('.user-profile .avatar').textContent = usuario.nombre.charAt(0);

    // Seguridad RBAC
    if (usuario.rol === 'lector' || usuario.rol === 'tecnico') {
        document.getElementById('btn-crear-equipo').style.display = 'none';
        document.getElementById('btn-crear-usuario').style.display = 'none';
    } else if (usuario.rol === 'analista') {
        document.getElementById('btn-crear-usuario').style.display = 'none';
    }

    // 🔥 INICIAR SINCRONIZACIÓN EN TIEMPO REAL CON FIREBASE
    inicializarBarraLateral();
}

document.addEventListener('DOMContentLoaded', init);