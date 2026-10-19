// ============================================================================
// MÓDULO PRINCIPAL: JS/APP.JS
// CIO PREDICTIVO 2.0 — Estándar ES6+, MapLibre 3D, WAI-ARIA y Pulsaciones CBM
// ============================================================================

import { auth, db } from './core/firebase-config.js';
import { inicializarBarraLateral } from './ui/sidebar.js'; 
import { renderizarExpediente } from './ui/expediente.js';
import { renderizarModuloPMS } from './ui/pms.js';

// ----------------------------------------------------------------------------
// ESTADO REACTIVO Y REFERENCIAS GLOBALES
// ----------------------------------------------------------------------------
let datosGlobalesEquipos = {}; 
let mapaActivo = null; 
let listaMarcadoresActivos = []; 
let diccionarioMarcadores = {};  
let nivelFiltroActual = 'TODOS'; 
let esVista3D = true;

let filtroModoMapa = 'TODOS';
let filtroValorMapa = '';

let appInicializada = false;
let rafDibujoPines = null;
let cacheAlertasTerreno = null;

const dbAlertas = db.ref('alertas_terreno');
const dbActivos = db.ref('activos_criticos');

// Publicación de contratos globales para interoperabilidad modular
window.datosGlobalesEquipos = datosGlobalesEquipos;
window.mapaActivo = null;

// ----------------------------------------------------------------------------
// UTILIDADES PURAS: ESCAPADO, RESOLUCIÓN VISUAL Y CONTROL DE RECURSOS
// ----------------------------------------------------------------------------
const escaparHTML = (texto = '') => 
    String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const resolverConfiguracionVisual = (severidad = '') => {
    const sev = String(severidad).trim().toLowerCase();

    if (sev === 'rojo' || sev === 'critico' || sev === 'd') {
        return {
            colorHex: '#ef4444',
            animacion: 'animation: pulsePinRojo 1.1s infinite ease-out;',
            claseEstado: 'critica',
            textoEstado: 'Crítico (Zona D)'
        };
    }

    if (sev === 'naranja' || sev === 'salmon' || sev === 'c') {
        return {
            colorHex: '#f97316',
            animacion: 'animation: pulsePinSalmon 1.9s infinite ease-out;',
            claseEstado: 'alerta',
            textoEstado: 'Alerta (Zona C)'
        };
    }

    if (sev === 'amarillo' || sev === 'b') {
        return {
            colorHex: '#eab308',
            animacion: 'animation: pulsePinAmarillo 2.8s infinite ease-out;',
            claseEstado: 'seguimiento',
            textoEstado: 'Seguimiento (Zona B)'
        };
    }

    return {
        colorHex: '#00e676',
        animacion: 'box-shadow: 0 0 8px rgba(0, 230, 118, 0.65), 0 3px 10px rgba(0, 0, 0, 0.8);',
        claseEstado: 'normal',
        textoEstado: 'Óptimo (Zona A)'
    };
};

const destruirMapaActivo = () => {
    if (rafDibujoPines) {
        cancelAnimationFrame(rafDibujoPines);
        rafDibujoPines = null;
    }
    
    for (const marcador of listaMarcadoresActivos) {
        marcador?.remove?.();
    }
    listaMarcadoresActivos = [];
    diccionarioMarcadores = {};

    if (mapaActivo) {
        mapaActivo.remove();
        mapaActivo = null;
        window.mapaActivo = null;
    }
};

// ----------------------------------------------------------------------------
// CONTROL DE MODO KIOSKO
// ----------------------------------------------------------------------------
const alternarModoKiosko = () => {
    const activo = document.body.classList.toggle('modo-kiosko-activo');
    const btnKiosko = document.getElementById('kiosko');

    if (btnKiosko) {
        btnKiosko.setAttribute('aria-pressed', activo ? 'true' : 'false');
    }

    let btnFlotante = document.getElementById('btn-salir-kiosko-flotante');
    if (!btnFlotante) {
        btnFlotante = document.createElement('button');
        btnFlotante.id = 'btn-salir-kiosko-flotante';
        btnFlotante.className = 'btn-salir-kiosko-flotante';
        btnFlotante.type = 'button';
        btnFlotante.setAttribute('aria-label', 'Salir del modo Kiosko pantalla completa');
        btnFlotante.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 1.15rem;" aria-hidden="true">fullscreen_exit</span>
            <span>Salir de Kiosko (Esc)</span>
        `;
        btnFlotante.addEventListener('click', alternarModoKiosko);
        document.body.appendChild(btnFlotante);
    }

    if (mapaActivo) {
        setTimeout(() => mapaActivo.resize(), 250);
    }
};

const salirModoKioskoSiAplica = () => {
    if (!document.body.classList.contains('modo-kiosko-activo')) return;

    document.body.classList.remove('modo-kiosko-activo');
    const btnKiosko = document.getElementById('kiosko');
    if (btnKiosko) {
        btnKiosko.setAttribute('aria-pressed', 'false');
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-kiosko-activo')) {
        alternarModoKiosko();
    }
});

// ----------------------------------------------------------------------------
// MODAL: REGISTRAR NUEVO USUARIO
// ----------------------------------------------------------------------------
const abrirModalCrearUsuario = () => {
    const modalId = 'modal-crear-usuario-cbm';
    document.getElementById(modalId)?.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'titulo-modal-usuario');

    modal.innerHTML = `
        <div class="modal-box glass-panel" style="max-width: 480px; width: 92%; padding: 0;">
            <header class="modal-header">
                <h3 id="titulo-modal-usuario" style="margin: 0; color: #ffffff; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="color: var(--primary-blue, #38bdf8);" aria-hidden="true">person_add</span>
                    Registrar Nuevo Usuario del Sistema
                </h3>
                <button type="button" id="btn-cerrar-modal-user" class="btn-cerrar-modal" aria-label="Cerrar">&times;</button>
            </header>

            <form id="form-nuevo-usuario" onsubmit="event.preventDefault();" style="padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;">
                <div class="campo-formulario">
                    <label for="nuevo-user-nombre" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Nombre Completo *</label>
                    <input type="text" id="nuevo-user-nombre" placeholder="Ej: Juan Pérez" required style="width: 100%; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline: none; box-sizing: border-box;">
                </div>

                <div class="campo-formulario">
                    <label for="nuevo-user-email" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Correo Electrónico Corporativo *</label>
                    <input type="email" id="nuevo-user-email" placeholder="jperez@cpf.cl" required style="width: 100%; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline: none; box-sizing: border-box;">
                </div>

                <div class="campo-formulario">
                    <label for="nuevo-user-rol" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Rol en la Plataforma</label>
                    <select id="nuevo-user-rol" style="width: 100%; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline: none; cursor: pointer; box-sizing: border-box;">
                        <option value="Analista CBM">Analista CBM</option>
                        <option value="Inspector Terreno">Inspector Terreno</option>
                        <option value="Supervisor Planta">Supervisor Planta</option>
                        <option value="Administrador">Administrador</option>
                    </select>
                </div>

                <div class="campo-formulario">
                    <label for="nuevo-user-pass" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Contraseña Provisoria *</label>
                    <input type="password" id="nuevo-user-pass" placeholder="••••••••" required style="width: 100%; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline: none; box-sizing: border-box;">
                </div>

                <footer class="modal-footer" style="padding: 12px 0 0 0; margin-top: 6px; background: transparent; border-top: 1px solid rgba(255,255,255,0.06);">
                    <button type="button" id="btn-cancelar-user" class="btn-secundario">Cancelar</button>
                    <button type="button" id="btn-guardar-user" class="btn-primario" style="background: #0284c7; color: white; border: none; font-weight: 700;">
                        <span>Guardar Usuario</span>
                    </button>
                </footer>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const cerrar = () => modal.remove();
    modal.querySelector('#btn-cerrar-modal-user')?.addEventListener('click', cerrar);
    modal.querySelector('#btn-cancelar-user')?.addEventListener('click', cerrar);
    modal.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') cerrar();
    });

    modal.querySelector('#btn-guardar-user')?.addEventListener('click', async () => {
        const nombre = modal.querySelector('#nuevo-user-nombre')?.value.trim();
        const email = modal.querySelector('#nuevo-user-email')?.value.trim().toLowerCase();
        const rol = modal.querySelector('#nuevo-user-rol')?.value;
        const pass = modal.querySelector('#nuevo-user-pass')?.value.trim();

        if (!nombre || !email || !pass) {
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast("Complete todos los campos obligatorios.", "alerta");
            } else {
                alert("Complete todos los campos obligatorios.");
            }
            return;
        }

        const btnGuardar = modal.querySelector('#btn-guardar-user');
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = `Guardando...`;
        }

        try {
            const keyUsuario = email.replace(/[@.]/g, '_');

            await db.ref(`usuarios_cio/${keyUsuario}`).set({
                nombre,
                email,
                rol,
                activo: true,
                fechaRegistro: new Date().toISOString()
            });

            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast(`Usuario ${nombre} (${rol}) creado exitosamente.`, "exito");
            }

            cerrar();
        } catch (err) {
            console.error("Error al registrar usuario:", err);
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast("Error de conexión al registrar usuario.", "error");
            }
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = `Guardar Usuario`;
            }
        }
    });
};

// ----------------------------------------------------------------------------
// AUTENTICACIÓN Y CICLO DE VIDA (ES6+ / ASYNC-AWAIT)
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            mostrarPlataforma(user);
        } else {
            document.getElementById('vista-login')?.classList.remove('oculta');
            document.getElementById('vista-app')?.classList.add('oculta');
        }
    });

    const btnIngresar = document.getElementById('btn-ingresar');
    btnIngresar?.addEventListener('click', ejecutarInicioSesion);
});

const ejecutarInicioSesion = async () => {
    const inputEmail = document.getElementById('login-email');
    const inputPass = document.getElementById('login-pass');
    const errorDiv = document.getElementById('login-error');
    const btnIngresar = document.getElementById('btn-ingresar');

    const email = inputEmail?.value.trim() ?? '';
    const pass = inputPass?.value.trim() ?? '';

    if (!email || !pass) {
        if (errorDiv) {
            errorDiv.textContent = 'Ingrese correo y contraseña.';
            errorDiv.setAttribute('role', 'alert');
        }
        return;
    }

    if (btnIngresar) {
        btnIngresar.innerHTML = `<span>Autenticando...</span> <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;" aria-hidden="true">autorenew</span>`;
        btnIngresar.disabled = true;
    }
    if (errorDiv) errorDiv.textContent = '';

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
        console.error('Error de autenticación:', err);
        if (errorDiv) {
            errorDiv.textContent = 'Usuario o contraseña incorrectos.';
            errorDiv.setAttribute('role', 'alert');
        }
    } finally {
        if (btnIngresar) {
            btnIngresar.innerHTML = `<span>Autenticar</span> <span class="material-symbols-outlined" aria-hidden="true">login</span>`;
            btnIngresar.disabled = false;
        }
    }
};

const mostrarPlataforma = (user) => {
    document.getElementById('vista-login')?.classList.add('oculta');
    document.getElementById('vista-app')?.classList.remove('oculta');

    const nombreTemp = user.email ? user.email.split('@')[0].replace('.', ' ') : 'Usuario';
    const perfilNombre = document.getElementById('perfil-nombre');
    const perfilRol = document.getElementById('perfil-rol');
    const avatarIniciales = document.getElementById('avatar-iniciales');

    if (perfilNombre) perfilNombre.textContent = nombreTemp;
    if (perfilRol) perfilRol.textContent = 'Analista CBM';
    if (avatarIniciales) avatarIniciales.textContent = nombreTemp.substring(0, 2).toUpperCase();

    inicializarApp();
};

const inicializarApp = () => {
    if (appInicializada) return;
    appInicializada = true;

    inicializarBarraLateral();

    // 1. ESCUCHA DE ALERTAS: SOLO CUANDO EL USUARIO ESTÁ AUTENTICADO
    dbAlertas.on('value', (snap) => {
        cacheAlertasTerreno = snap.val();
        renderizarAlertasTerrenoManager(cacheAlertasTerreno);
    }, (err) => {
        console.warn('[Alertas] Esperando permisos de lectura:', err.message);
    });

    // 2. ESCUCHA DE ACTIVOS
    dbActivos.on('value', (snapshot) => {
        if (!snapshot.exists()) return;

        datosGlobalesEquipos = snapshot.val() ?? {};
        window.datosGlobalesEquipos = datosGlobalesEquipos;

        const espacioDinamico = document.getElementById('espacio-trabajo-dinamico');
        if (espacioDinamico && (!espacioDinamico.innerHTML.includes('mapa-satelital') || espacioDinamico.innerHTML.includes('Cargando Dashboard'))) {
            if (!espacioDinamico.innerHTML.includes('panel-industrial')) {
                renderizarMapaPlanta();
            }
        } else if (mapaActivo) {
            dibujarPinesEnMapa();
        }

        document.dispatchEvent(new CustomEvent('datosEquiposActualizados', { detail: datosGlobalesEquipos }));
    }, (err) => {
        console.warn('[Activos] Error al cargar equipos:', err.message);
    });

    // Delegación central de eventos
    document.addEventListener('click', async (e) => {
        const btnEquipo = e.target.closest('.item-navegable');
        if (btnEquipo) {
            salirModoKioskoSiAplica();

            const idFirebase = btnEquipo.getAttribute('data-target');
            document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));

            if (btnEquipo.closest('.sidebar-principal')) {
                btnEquipo.style.border = '1px solid var(--primary-blue, #38bdf8)';
            }

            destruirMapaActivo();
            renderizarExpediente(idFirebase, 'espacio-trabajo-dinamico');
            return;
        }

        const btnSalir = e.target.closest('#btn-salir');
        if (btnSalir) {
            const confirmado = typeof UI !== 'undefined' && UI.confirmar
                ? await UI.confirmar('¿Estás seguro de cerrar tu sesión en el sistema?', 'Cerrar Sesión')
                : confirm('¿Estás seguro de cerrar tu sesión en el sistema?');

            if (confirmado) {
                await auth.signOut();
                window.location.reload();
            }
            return;
        }

        const btnVolver = e.target.closest('#btn-volver-dashboard') ?? e.target.closest('#btn-cerrar-expediente');
        if (btnVolver) {
            document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));
            if (window.miniMapaInstancia) {
                window.miniMapaInstancia.remove();
                window.miniMapaInstancia = null;
            }
            renderizarMapaPlanta();
            return;
        }

        const btnCrearEquipo = e.target.closest('#btn-crear-equipo');
        if (btnCrearEquipo) {
            document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));
            destruirMapaActivo();
            renderizarExpediente('NUEVO', 'espacio-trabajo-dinamico');
            return;
        }

        const btnCrearUsuario = e.target.closest('#btn-crear-usuario');
        if (btnCrearUsuario) {
            abrirModalCrearUsuario();
            return;
        }

        const btnModuloPMS = e.target.closest('#btn-modulo-pms');
        if (btnModuloPMS) {
            document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));
            destruirMapaActivo();
            renderizarModuloPMS('espacio-trabajo-dinamico');
            return;
        }

        const btnKiosko = e.target.closest('#kiosko');
        if (btnKiosko) {
            alternarModoKiosko();
            return;
        }
    });
};

// ----------------------------------------------------------------------------
// BANDEJA DE ALERTAS DE TERRENO
// ----------------------------------------------------------------------------
window.abrirModalAlertasTerreno = () => {
    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) {
        modal.classList.remove('oculto');
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    }
    window.renderizarAlertasTerrenoModal();
};

window.renderizarAlertasTerrenoModal = () => {
    if (cacheAlertasTerreno) {
        renderizarAlertasTerrenoManager(cacheAlertasTerreno);
    } else {
        dbAlertas?.once('value', (snap) => {
            cacheAlertasTerreno = snap.val();
            renderizarAlertasTerrenoManager(cacheAlertasTerreno);
        });
    }
};

window.abrirFotoAlerta = (fotoBase64) => {
    if (!fotoBase64) return;
    try {
        const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64;
        const binario = atob(base64Data);
        const len = binario.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binario.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const fileUrl = URL.createObjectURL(blob);
        const ventana = window.open(fileUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
        if (!ventana) window.location.href = fileUrl;
    } catch {
        const win = window.open('', '_blank');
        win?.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head><title>Evidencia de Terreno</title></head>
            <body style="margin:0; background:#0f172a; display:flex; justify-content:center; align-items:center; min-height:100vh;">
                <img src="${fotoBase64}" style="max-width:95%; max-height:95vh; object-fit:contain; border-radius:8px;" alt="Fotografía de terreno ampliada"/>
            </body>
            </html>
        `);
    }
};

const renderizarAlertasTerrenoManager = (alertasData) => {
    const contenedor = document.getElementById('lista-alertas-terreno-container')
        || document.getElementById('lista-alertas-terreno')
        || document.getElementById('contenedor-alertas-terreno')
        || document.querySelector('#modal-alertas-terreno .modal-body');

    const badge = document.getElementById('badgeAlertasTerreno')
        || document.querySelector('.badge-alerta');
    
    if (!alertasData) {
        if (badge) {
            badge.innerText = '0';
            badge.classList.remove('pulsante');
            badge.setAttribute('aria-label', '0 reportes de terreno pendientes');
        }
        if (contenedor) {
            contenedor.innerHTML = `
                <div role="status" style="text-align: center; color: var(--text-muted, #94a3b8); padding: 2.5rem 1rem;">
                    <span class="material-symbols-outlined" style="font-size: 2.5rem; color: #00e676; margin-bottom: 8px;" aria-hidden="true">check_circle</span>
                    <p style="margin: 0; font-size: 0.95rem;">No hay reportes de terreno pendientes en este momento.</p>
                </div>
            `;
        }
        return;
    }

    const keys = Object.keys(alertasData);
    if (badge) {
        badge.innerText = String(keys.length);
        badge.setAttribute('aria-label', `${keys.length} reportes de terreno pendientes`);
        if (keys.length > 0) badge.classList.add('pulsante');
        else badge.classList.remove('pulsante');
    }
    
    if (!contenedor) return;

    contenedor.setAttribute('role', 'feed');
    contenedor.style.display = 'flex';
    contenedor.style.flexDirection = 'column';
    contenedor.style.gap = '12px';
    contenedor.style.maxHeight = '65vh';
    contenedor.style.overflowY = 'auto';

    try {
        const itemsHTML = keys.reverse().map((key) => {
            const al = alertasData[key] ?? {};
            
            let fechaISO = '';
            let fechaTexto = 'Fecha no registrada';
            if (al.timestamp) {
                try {
                    const d = new Date(al.timestamp);
                    if (!isNaN(d.getTime())) {
                        fechaISO = d.toISOString();
                        fechaTexto = d.toLocaleString();
                    } else {
                        fechaTexto = String(al.timestamp);
                    }
                } catch {
                    fechaTexto = String(al.timestamp);
                }
            }
            
            const tagLimpio = escaparHTML(al.tag ?? 'SIN TAG');
            const detalleLimpio = escaparHTML(al.detalle ?? 'Sin detalle adjunto');
            const areaLimpia = escaparHTML(al.area ?? 'General');
            const componenteLimpio = escaparHTML(al.componente ?? 'General');
            
            const configVisual = resolverConfiguracionVisual(al.severidad);
            const esCritica = configVisual.claseEstado === 'critica';

            const htmlFoto = al.fotoBase64
                ? `
                    <figure style="margin: 0; flex-shrink: 0;">
                        <img src="${al.fotoBase64}" 
                             style="width: 82px; height: 82px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-glass, rgba(255,255,255,0.12)); cursor: pointer; transition: transform 0.15s ease;" 
                             onclick="event.stopPropagation(); window.abrirFotoAlerta('${al.fotoBase64}')" 
                             alt="Evidencia fotográfica ${tagLimpio}" 
                             title="Clic para ver foto ampliada"
                             tabindex="0"
                             onmouseover="this.style.transform='scale(1.05)'"
                             onmouseout="this.style.transform='scale(1)'">
                    </figure>
                  `
                : '';

            return `
                <article class="alerta-card-moderna ${configVisual.claseEstado}" 
                         role="article"
                         tabindex="0"
                         onclick="window.irAExpedienteDesdeAlerta('${tagLimpio}')" 
                         title="Haz clic para abrir el expediente de ${tagLimpio}"
                         style="cursor: pointer;">
                    
                    ${htmlFoto}
                    
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 0.35rem; min-width: 0;">
                        <header style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="radar-box" title="Estado: ${configVisual.textoEstado}">
                                    <span class="radar-dot" style="background: ${configVisual.colorHex};"></span>
                                    ${esCritica ? `<span class="radar-wave" style="background: ${configVisual.colorHex};"></span>` : ''}
                                </div>
                                <h4 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-family: monospace; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                                    TAG: ${tagLimpio}
                                    <span class="material-symbols-outlined" style="font-size: 1rem; color: var(--primary-blue, #38bdf8);" aria-hidden="true">open_in_new</span>
                                </h4>
                            </div>
                            <time datetime="${fechaISO}" style="font-size: 0.72rem; color: var(--text-muted, #94a3b8);">${fechaTexto}</time>
                        </header>
                        
                        <p style="margin: 0; font-size: 0.78rem; color: #38bdf8; font-weight: 600;">
                            Área: <span style="color: #f8fafc;">${areaLimpia}</span> | Componente: <span style="color: #f8fafc;">${componenteLimpio}</span>
                        </p>
                        
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #e2e8f0; white-space: pre-line; background: rgba(0,0,0,0.3); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.04); line-height: 1.35;">
                            ${detalleLimpio}
                        </p>
                        
                        <nav aria-label="Acciones del reporte" style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                            <button type="button"
                                    onclick="event.stopPropagation(); window.ubicarEnMapaDesdeAlerta('${tagLimpio}')" 
                                    style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                                <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">my_location</span> Ver en Mapa 3D
                            </button>
                            
                            <button type="button"
                                    onclick="event.stopPropagation(); window.irAExpedienteDesdeAlerta('${tagLimpio}')" 
                                    style="background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.35); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                                <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">folder_open</span> Abrir Expediente
                            </button>
                        </nav>
                    </div>

                    <button type="button"
                            onclick="event.stopPropagation(); window.eliminarAlertaTerreno('${escaparHTML(key)}')" 
                            style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px 8px; border-radius: 6px; cursor: pointer; flex-shrink: 0;" 
                            title="Eliminar reporte de terreno"
                            aria-label="Eliminar reporte">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem; vertical-align: middle;" aria-hidden="true">delete</span>
                    </button>
                </article>
            `;
        }).join('');

        contenedor.innerHTML = itemsHTML;
    } catch (err) {
        console.error('[Alertas] Error renderizando tarjetas:', err);
    }
};

window.eliminarAlertaTerreno = async (key) => {
    if (!key) return;
    const seguro = typeof UI !== 'undefined' && UI.confirmar
        ? await UI.confirmar('¿Estás seguro de eliminar este reporte de la bandeja?', 'Eliminar Reporte')
        : confirm('¿Estás seguro de eliminar este reporte de la bandeja?');

    if (!seguro) return;

    try {
        await dbAlertas.child(key).remove();
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Reporte de terreno eliminado con éxito.', 'exito');
        }
    } catch (err) {
        console.error('Error al eliminar alerta:', err);
    }
};

// ----------------------------------------------------------------------------
// NAVEGACIÓN Y VINCULACIÓN ENTRE MÓDULOS
// ----------------------------------------------------------------------------
const obtenerIdEquipoPorTag = (tagBuscado) => {
    if (!tagBuscado) return '';
    const tagLimpio = tagBuscado.trim().toUpperCase();
    const tagNormalizado = tagLimpio.replace(/\s+/g, '_');

    if (datosGlobalesEquipos[tagNormalizado]) return tagNormalizado;
    if (datosGlobalesEquipos[tagLimpio]) return tagLimpio;

    for (const [idKey, eq] of Object.entries(datosGlobalesEquipos)) {
        if (eq?.tag && eq.tag.trim().toUpperCase() === tagLimpio) {
            return idKey;
        }
    }

    return tagNormalizado;
};

window.irAExpedienteDesdeAlerta = (tag) => {
    const idFirebase = obtenerIdEquipoPorTag(tag);
    if (!idFirebase) return;

    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('oculto');
        modal.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));
    const itemSidebar = document.querySelector(`.sidebar-principal .item-navegable[data-target="${idFirebase}"]`);
    if (itemSidebar) {
        itemSidebar.style.border = '1px solid var(--primary-blue, #38bdf8)';
        itemSidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    destruirMapaActivo();
    renderizarExpediente(idFirebase, 'espacio-trabajo-dinamico');
};

window.ubicarEnMapaDesdeAlerta = (tag) => {
    const idFirebase = obtenerIdEquipoPorTag(tag);
    if (!idFirebase) return;

    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('oculto');
        modal.setAttribute('aria-hidden', 'true');
    }

    if (nivelFiltroActual !== 'TODOS') {
        nivelFiltroActual = 'TODOS';
    }

    const mapaContenedor = document.getElementById('mapa-satelital');
    if (!mapaActivo || !mapaContenedor) {
        document.querySelectorAll('.item-navegable').forEach((b) => (b.style.border = 'none'));
        renderizarMapaPlanta();
    } else {
        dibujarPinesEnMapa();
    }

    const ejecutarVuelo = () => {
        const claveNorm = tag.trim().toUpperCase().replace(/\s+/g, '_');
        const infoPin = diccionarioMarcadores[idFirebase] ?? diccionarioMarcadores[claveNorm];

        if (infoPin && mapaActivo) {
            for (const item of Object.values(diccionarioMarcadores)) {
                if (item?.popup?.isOpen()) item.popup.remove();
            }

            mapaActivo.flyTo({
                center: infoPin.coords,
                zoom: 18.5,
                pitch: 65,
                bearing: -20,
                speed: 1.3,
                curve: 1.4,
                essential: true
            });

            setTimeout(() => {
                infoPin.marker?.togglePopup();
            }, 950);
        } else {
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast(`El equipo ${tag} no posee coordenadas GPS asignadas. Mostrando expediente...`, 'alerta');
            }
            window.irAExpedienteDesdeAlerta(tag);
        }
    };

    if (mapaActivo?.loaded()) {
        setTimeout(ejecutarVuelo, 200);
    } else if (mapaActivo) {
        mapaActivo.once('load', ejecutarVuelo);
    } else {
        setTimeout(ejecutarVuelo, 400);
    }
};

window.filtrarMapaPorNivel = (nivel) => {
    nivelFiltroActual = nivel;
    const botones = document.querySelectorAll('.btn-filtro-nivel');
    botones.forEach((btn) => {
        const activo = btn.getAttribute('data-nivel') === nivel;
        btn.style.background = activo ? '#38bdf8' : 'rgba(255,255,255,0.05)';
        btn.style.color = activo ? '#0f172a' : '#e2e8f0';
        btn.style.borderColor = activo ? '#38bdf8' : 'var(--border-glass, rgba(255,255,255,0.1))';
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
    dibujarPinesEnMapa();
};

window.alternarPerspectivaMapa = () => {
    if (!mapaActivo) return;
    esVista3D = !esVista3D;
    const btn = document.getElementById('btn-toggle-3d');
    
    if (esVista3D) {
        mapaActivo.easeTo({ pitch: 60, bearing: -15, duration: 800 });
        if (btn) {
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">3d_rotation</span> <span>Modo 3D</span>`;
            btn.setAttribute('aria-label', 'Perspectiva actual 3D. Clic para cambiar a 2D');
        }
    } else {
        mapaActivo.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        if (btn) {
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">map</span> <span>Plano 2D</span>`;
            btn.setAttribute('aria-label', 'Perspectiva actual 2D. Clic para cambiar a 3D');
        }
    }
};

window.filtrarMapaPorAreaOSearch = (modo, valor = '') => {
    filtroModoMapa = modo;
    filtroValorMapa = valor.toLowerCase();
    dibujarPinesEnMapa();
};

// ----------------------------------------------------------------------------
// RENDERIZADO DEL MAPA GEOESPACIAL (MAPLIBRE GL)
// ----------------------------------------------------------------------------
const renderizarMapaPlanta = () => {
    const contenedor = document.getElementById('espacio-trabajo-dinamico');
    if (!contenedor) return;

    destruirMapaActivo();

    const nivelesDisponibles = ['TODOS', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel -1', 'Nivel -2'];
    const htmlBotonesNivel = nivelesDisponibles.map((niv) => {
        const activo = nivelFiltroActual === niv;
        return `
            <button type="button" 
                    class="btn-filtro-nivel" 
                    data-nivel="${niv}" 
                    onclick="window.filtrarMapaPorNivel('${niv}')"
                    aria-pressed="${activo ? 'true' : 'false'}"
                    style="background: ${activo ? '#38bdf8' : 'rgba(255,255,255,0.05)'}; color: ${activo ? '#0f172a' : '#e2e8f0'}; border: 1px solid ${activo ? '#38bdf8' : 'var(--border-glass, rgba(255,255,255,0.1))'}; padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: background 0.15s, color 0.15s;">
                ${niv === 'TODOS' ? 'Global' : niv}
            </button>
        `;
    }).join('');

    contenedor.innerHTML = `
        <section class="contenedor-mapa-seccion" 
                 role="region" 
                 aria-label="Monitoreo geoespacial de activos de planta"
                 style="animation: fadeIn 0.3s ease; padding: 0.5rem; height: 100%; display: flex; flex-direction: column; gap: 0.75rem; box-sizing: border-box;">
            
            <header style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; background: rgba(15, 23, 42, 0.85); padding: 1rem 1.25rem; border-radius: 12px; border: 1px solid var(--border-glass, rgba(255,255,255,0.1));">
                <div>
                    <h2 style="color: #ffffff; font-size: 1.25rem; margin: 0 0 0.25rem 0; display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-symbols-outlined" style="color: var(--primary-blue, #38bdf8);" aria-hidden="true">domain</span>
                        Monitoreo Geoespacial de Activos — Planta Mina Los Colorados
                    </h2>
                    <p style="color: var(--text-muted, #94a3b8); margin: 0; font-size: 0.78rem;">
                        Visualización tridimensional de condición operativa. Rotación e inclinación con <kbd style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">Clic Derecho</kbd>.
                    </p>
                </div>

                <nav aria-label="Controles de nivel y perspectiva 3D" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--text-muted, #94a3b8);">Cota / Nivel:</span>
                    ${htmlBotonesNivel}
                    <button type="button" 
                            id="btn-toggle-3d" 
                            onclick="window.alternarPerspectivaMapa()"
                            aria-label="Alternar entre perspectiva 3D y plano 2D"
                            style="margin-left: 0.5rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">3d_rotation</span>
                        <span>${esVista3D ? 'Modo 3D' : 'Plano 2D'}</span>
                    </button>
                </nav>
            </header>
            
            <div id="mapa-satelital" 
                 role="application"
                 aria-label="Lienzo satelital interactivo MapLibre"
                 style="flex-grow: 1; min-height: 480px; border-radius: 12px; border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); overflow: hidden; position: relative; z-index: 1;">
            </div>
        </section>
    `;

    mapaActivo = new maplibregl.Map({
        container: 'mapa-satelital',
        style: {
            version: 8,
            sources: {
                'esri-satellite': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    maxzoom: 17,
                    attribution: '© Esri World Imagery | CPF Ingeniería'
                },
                'terreno-dem': {
                    type: 'raster-dem',
                    tiles: [
                        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
                    ],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15
                }
            },
            layers: [
                {
                    id: 'capa-satelital-esri',
                    type: 'raster',
                    source: 'esri-satellite',
                    minzoom: 0,
                    maxzoom: 22
                }
            ],
            terrain: {
                source: 'terreno-dem',
                exaggeration: 1.25
            }
        },
        center: [-70.813030, -28.290846],
        zoom: 15.6,
        pitch: esVista3D ? 60 : 0,
        bearing: esVista3D ? -15 : 0,
        maxPitch: 82,
        minZoom: 13,
        maxZoom: 21
    });

    mapaActivo.addControl(new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true
    }), 'top-right');

    window.mapaActivo = mapaActivo;

    mapaActivo.on('load', () => {
        dibujarPinesEnMapa();
    });
};

// ----------------------------------------------------------------------------
// DIBUJO DE PINES EN MAPA
// ----------------------------------------------------------------------------
const dibujarPinesEnMapa = () => {
    if (!mapaActivo) return;

    if (rafDibujoPines) {
        cancelAnimationFrame(rafDibujoPines);
    }

    rafDibujoPines = requestAnimationFrame(() => {
        for (const m of listaMarcadoresActivos) {
            m?.remove?.();
        }
        listaMarcadoresActivos = [];
        diccionarioMarcadores = {};

        const entries = Object.entries(datosGlobalesEquipos);

        for (const [idKey, eq] of entries) {
            if (!eq) continue;

            const lat = parseFloat(eq.latitud);
            const lng = parseFloat(eq.longitud);

            if (isNaN(lat) || isNaN(lng)) continue;

            const nivelEquipo = eq.nivel ?? 'Nivel 1';
            const areaEq = (eq.area ?? '').trim();
            const tagEq = (eq.tag ?? '').toLowerCase();
            const nombreEq = (eq.nombre ?? '').toLowerCase();

            if (nivelFiltroActual !== 'TODOS' && nivelEquipo !== nivelFiltroActual) {
                continue;
            }

            if (filtroModoMapa === 'AREA' && areaEq.toLowerCase() !== filtroValorMapa) {
                continue;
            }
            if (filtroModoMapa === 'SEARCH' && !tagEq.includes(filtroValorMapa) && !nombreEq.includes(filtroValorMapa)) {
                continue;
            }

            const configVisual = resolverConfiguracionVisual(eq.severidad ?? eq.estado);
            const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;
            const textoTooltip = `${eq.tag ?? idKey} (${nivelEquipo}) — ${eq.nombre ?? 'Activo Crítico'}`;

            const el = document.createElement('div');
            el.className = 'maplibre-pin-node';
            el.title = textoTooltip;
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            el.setAttribute('aria-label', `Equipo ${eq.tag ?? idKey}, condición ${configVisual.textoEstado}`);
            el.style.cssText = `
                width: 20px; 
                height: 20px; 
                background-color: ${configVisual.colorHex}; 
                border-radius: 50%; 
                border: 3px solid #ffffff; 
                box-sizing: border-box;
                cursor: pointer;
                ${configVisual.animacion}
            `;

            const popupHTML = `
                <article style="text-align: center; font-family: 'Inter', system-ui, sans-serif; min-width: 195px; padding: 0.25rem;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 4px;">${escaparHTML(nivelEquipo)}</span>
                        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${configVisual.colorHex}; display: inline-block;" aria-hidden="true"></span>
                    </header>
                    <h4 style="margin: 0 0 4px 0; font-size: 1rem; color: #ffffff; font-family: monospace;">${escaparHTML(eq.tag ?? '')}</h4>
                    <p style="margin: 0 0 4px 0; font-size: 0.8rem; color: #cbd5e1; font-weight: 600;">${escaparHTML(eq.nombre ?? 'Sin descripción')}</p>
                    <p style="margin: 0 0 10px 0; font-size: 0.72rem; color: #94a3b8;">Área: ${escaparHTML(eq.area ?? 'General')}</p>
                    <button type="button" 
                            class="item-navegable" 
                            data-target="${escaparHTML(targetId)}" 
                            aria-label="Abrir expediente técnico de ${escaparHTML(eq.tag ?? '')}"
                            style="background: #38bdf8; color: #0f172a; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; width: 100%; font-size: 0.8rem;">
                        Abrir Expediente CBM
                    </button>
                </article>
            `;

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
                .setHTML(popupHTML);

            const coords = [lng, lat];
            const marcador = new maplibregl.Marker({ element: el })
                .setLngLat(coords)
                .setPopup(popup)
                .addTo(mapaActivo);

            listaMarcadoresActivos.push(marcador);

            const registro = { marker: marcador, popup, coords, eq };
            diccionarioMarcadores[idKey] = registro;
            diccionarioMarcadores[targetId] = registro;
        }
    });
};

window.renderizarMapaPlanta = renderizarMapaPlanta;
window.dibujarPinesEnMapa = dibujarPinesEnMapa;

// ============================================================================
// VISOR DE PDF INTEGRADO GLOBAL (CIO PREDICTIVO 2.0)
// ============================================================================
window.abrirVisorPDFDesdeBase64 = (base64Data, nombreArchivo = 'documento.pdf') => {
    let modal = document.getElementById('modal-visor-pdf');
    
    // Si el modal no existe en el DOM, lo creamos dinámicamente con Glassmorphism
    if (!modal) {
        const div = document.createElement('div');
        div.innerHTML = `
            <div id="modal-visor-pdf" class="modal-overlay oculto" role="dialog" aria-modal="true" aria-hidden="true" style="position: fixed; inset: 0; z-index: 99999; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);">
                <div class="modal-box glass-panel" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 60px rgba(0,0,0,0.7); border-radius: 14px; width: 95%; max-width: 1100px; height: 90vh; display: flex; flex-direction: column; overflow: hidden;">
                    <header style="background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.4rem;">picture_as_pdf</span>
                            <h3 id="modal-pdf-titulo" style="margin: 0; color: white; font-size: 1rem; font-weight: 700;">Visor Documental CBM</h3>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <a id="btn-pdf-descargar" href="#" download class="btn-secundario" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;">
                                <span class="material-symbols-outlined" style="font-size: 1rem;">download</span> Descargar
                            </a>
                            <button type="button" onclick="window.cerrarVisorPDF()" style="background: transparent; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px;">&times;</button>
                        </div>
                    </header>
                    <div style="flex: 1; background: #1e293b; position: relative; overflow: hidden;">
                        <iframe id="iframe-visor-pdf" src="" style="width: 100%; height: 100%; border: none; background: #0f172a;" title="Visor PDF"></iframe>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById('modal-visor-pdf');
    }

    const iframe = document.getElementById('iframe-visor-pdf');
    const btnDescargar = document.getElementById('btn-pdf-descargar');
    const titulo = document.getElementById('modal-pdf-titulo');

    // Convertir Base64 a Blob URL para renderizado fluido en iframe
    const byteCharacters = atob(base64Data.split(',')[1] || base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    iframe.src = blobUrl;
    if (titulo) titulo.textContent = `Visualizando: ${nombreArchivo}`;
    if (btnDescargar) {
        btnDescargar.href = blobUrl;
        btnDescargar.download = nombreArchivo;
    }

    modal.style.display = 'flex';
    modal.classList.remove('oculto');
};

window.cerrarVisorPDF = () => {
    const modal = document.getElementById('modal-visor-pdf');
    const iframe = document.getElementById('iframe-visor-pdf');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('oculto');
    }
    if (iframe) {
        iframe.src = '';
    }
};