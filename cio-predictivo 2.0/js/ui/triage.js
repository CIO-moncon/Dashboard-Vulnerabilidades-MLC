// ============================================================================
// MÓDULO UI: JS/UI/TRIAGE.JS (v2.3.0)
// CIO PREDICTIVO 2.0 — Escucha Global de Alertas, Integración con Timeline y Catastro
// ============================================================================

import { auth, db } from '../core/firebase-config.js';
import { dibujarCabeceraCorporativa, dibujarPiePaginaCorporativo, resolverPaletaSeveridadISO } from '../core/pdf-plantilla.js';

let dbTriage = db.ref('alertas_terreno');
let dbActivos = db.ref('activos_criticos');
let listaHallazgosActuales = {};
let filtroEstadoTriage = 'PENDIENTES';
let filtroBusquedaTriage = '';
let escuchaIniciada = false;

const escaparHTML = (texto = '') =>
    String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const normalizarSeveridadParaCatastro = (textoSev = '') => {
    const s = String(textoSev).toLowerCase();
    if (s.includes('rojo') || s.includes('zona d') || s.includes('critico') || s.includes('crítico')) return 'Rojo';
    if (s.includes('naranja') || s.includes('zona c') || s.includes('alerta')) return 'Naranja';
    if (s.includes('amarillo') || s.includes('zona b') || s.includes('seguimiento')) return 'Amarillo';
    return 'Verde';
};

const obtenerColorCriticidad = (textoSev = '') => {
    const s = String(textoSev).toLowerCase();
    if (s.includes('rojo') || s.includes('d')) return '#ef4444';
    if (s.includes('naranja') || s.includes('c')) return '#f97316';
    if (s.includes('amarillo') || s.includes('b')) return '#eab308';
    if (s.includes('verde') || s.includes('a')) return '#00e676';
    return '#38bdf8';
};

const resolverKeyActivoCritico = async (tagBuscado) => {
    if (!tagBuscado) return null;
    const tagLimpio = String(tagBuscado).trim().toUpperCase();
    const tagNormalizado = tagLimpio.replace(/\s+/g, '_');

    if (window.datosGlobalesEquipos) {
        if (window.datosGlobalesEquipos[tagNormalizado]) return tagNormalizado;
        if (window.datosGlobalesEquipos[tagLimpio]) return tagLimpio;
        for (const [idKey, eq] of Object.entries(window.datosGlobalesEquipos)) {
            if (eq?.tag && eq.tag.trim().toUpperCase() === tagLimpio) return idKey;
        }
    }

    try {
        const snapDirecto = await dbActivos.child(tagNormalizado).once('value');
        if (snapDirecto.exists()) return tagNormalizado;

        const snapQuery = await dbActivos.orderByChild('tag').equalTo(tagBuscado).once('value');
        if (snapQuery.exists()) {
            return Object.keys(snapQuery.val())[0];
        }
    } catch (err) {
        console.warn('[Triage] Fallo al buscar key de activo en Firebase:', err);
    }

    return tagNormalizado;
};

// ============================================================================
// ESCUCHA PERMANENTE DEL BADGE DE TRIAGE EN EL SIDEBAR
// ============================================================================
export const iniciarEscuchaBadgeGlobal = () => {
    if (escuchaIniciada) return;
    escuchaIniciada = true;

    dbTriage.on('value', (snapshot) => {
        listaHallazgosActuales = snapshot.val() || {};
        actualizarBadgeTriageGlobal();
        if (document.getElementById('triage-lista-container')) {
            renderizarListaTriage();
        }
    }, (err) => {
        console.warn('[Triage] Esperando permisos para contador de alertas:', err.message);
    });
};

const actualizarBadgeTriageGlobal = () => {
    const entries = Object.entries(listaHallazgosActuales);
    let pend = 0;
    entries.forEach(([, h]) => {
        const estadoH = h.estado || 'Pendiente';
        if (estadoH === 'Pendiente' || estadoH === 'nuevo') pend++;
    });

    // Soporte para ambos selectores usados en app.js y el sidebar
    const badgeSidebar = document.getElementById('badgeTriagePendientes') || 
                         document.getElementById('badgeAlertasTerreno') || 
                         document.querySelector('.badge-alerta');

    if (badgeSidebar) {
        badgeSidebar.textContent = String(pend);
        if (pend > 0) {
            badgeSidebar.style.display = 'inline-flex';
            badgeSidebar.classList.add('pulsante');
        } else {
            badgeSidebar.style.display = 'none';
            badgeSidebar.classList.remove('pulsante');
        }
    }
};

// ============================================================================
// VISOR INTERNO DE IMÁGENES / MULTIMEDIA
// ============================================================================
window.abrirVisorMultimediaInterno = (urlMedia, tipo = 'imagen') => {
    let modal = document.getElementById('modal-visor-multimedia');
    if (!modal) {
        const div = document.createElement('div');
        div.innerHTML = `
            <div id="modal-visor-multimedia" class="modal-overlay" role="dialog" aria-modal="true" style="position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);">
                <div class="modal-box glass-panel" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 60px rgba(0,0,0,0.8); border-radius: 14px; width: 95%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
                    <header style="background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.4rem;">photo_camera</span>
                            <h3 style="margin: 0; color: white; font-size: 1rem; font-weight: 700;">Visor de Evidencia de Terreno</h3>
                        </div>
                        <button type="button" onclick="window.cerrarVisorMultimedia()" style="background: transparent; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px;">&times;</button>
                    </header>
                    <div style="flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px;" id="contenedor-contenido-media">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById('modal-visor-multimedia');
    }

    const contenedorMedia = document.getElementById('contenedor-contenido-media');
    if (contenedorMedia) {
        if (tipo === 'video') {
            contenedorMedia.innerHTML = `<video src="${urlMedia}" controls autoplay style="max-width: 100%; max-height: 100%; border-radius: 8px;"></video>`;
        } else {
            contenedorMedia.innerHTML = `<img src="${urlMedia}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;" alt="Evidencia ampliada">`;
        }
    }

    modal.style.display = 'flex';
    modal.classList.remove('oculto');
};

window.cerrarVisorMultimedia = () => {
    const modal = document.getElementById('modal-visor-multimedia');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('oculto');
        const contenedorMedia = document.getElementById('contenedor-contenido-media');
        if (contenedorMedia) contenedorMedia.innerHTML = '';
    }
};

export const renderizarModuloTriage = (idContenedor = 'espacio-trabajo-dinamico') => {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    iniciarEscuchaBadgeGlobal();

    contenedor.innerHTML = `
        <section class="seccion-triage-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; animation: fadeIn 0.25s ease;">
            
            <header style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
                <div>
                    <h2 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: #f59e0b;" aria-hidden="true">fact_check</span>
                        Bandeja de Triage de Hallazgos de Terreno
                    </h2>
                    <p style="margin: 0; font-size: 0.78rem; color: #94a3b8;">
                        Validación experta CBM con actualización de Timeline del activo, Mapa 3D y Avisos SAP.
                    </p>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="display: gap: 4px; background: rgba(0,0,0,0.4); padding: 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                        <button type="button" id="btn-triage-pendientes" onclick="window.filtrarTriageEstado('PENDIENTES')" style="background: #f59e0b; color: #0f172a; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
                            Pendientes / Vistos (<span id="lbl-triage-pend-count">0</span>)
                        </button>
                        <button type="button" id="btn-triage-validados" onclick="window.filtrarTriageEstado('VALIDADOS')" style="background: transparent; color: #94a3b8; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                            Validados (<span id="lbl-triage-val-count">0</span>)
                        </button>
                        <button type="button" id="btn-triage-todos" onclick="window.filtrarTriageEstado('TODOS')" style="background: transparent; color: #94a3b8; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                            Todos
                        </button>
                    </div>
                </div>
            </header>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="position: relative; max-width: 320px; flex: 1;">
                    <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: #94a3b8; pointer-events: none;" aria-hidden="true">search</span>
                    <input type="search" id="triage-busqueda-input" placeholder="Buscar por TAG, Área, Componente..." oninput="window.filtrarTriageTexto(this.value)" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px 8px 34px; border-radius: 6px; font-size: 0.82rem; outline: none; box-sizing: border-box;">
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                    <select id="select-rango-pdf" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 7px 12px; border-radius: 6px; font-size: 0.78rem; outline: none; cursor: pointer;">
                        <option value="HOY">📅 Hallazgos de Hoy (Día)</option>
                        <option value="SEMANA" selected>📊 Hallazgos de la Semana</option>
                        <option value="MES">📈 Hallazgos del Mes</option>
                        <option value="ANIO">🗂️ Hallazgos del Año</option>
                        <option value="TODOS">📑 Todos los Registros</option>
                    </select>

                    <button type="button" onclick="window.generarReportePDFTriage()" style="background: rgba(0, 230, 118, 0.18); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.45); padding: 7px 14px; border-radius: 6px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">picture_as_pdf</span>
                        Imprimir / Exportar PDF
                    </button>
                </div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;">
                <div id="triage-lista-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </div>
        </section>
    `;

    renderizarListaTriage();
};

const renderizarListaTriage = () => {
    const cont = document.getElementById('triage-lista-container');
    const lblPendCount = document.getElementById('lbl-triage-pend-count');
    const lblValCount = document.getElementById('lbl-triage-val-count');
    if (!cont) return;

    const entries = Object.entries(listaHallazgosActuales);
    
    let pend = 0;
    let val = 0;
    entries.forEach(([, h]) => {
        const estadoH = h.estado || 'Pendiente';
        if (estadoH === 'Validado' || estadoH === 'Descartado') val++;
        else pend++;
    });

    if (lblPendCount) lblPendCount.textContent = String(pend);
    if (lblValCount) lblValCount.textContent = String(val);

    const filtrados = entries.filter(([, h]) => {
        const texto = filtroBusquedaTriage.toLowerCase();
        const coincideTexto = !texto ||
            String(h.tag || '').toLowerCase().includes(texto) ||
            String(h.area || '').toLowerCase().includes(texto) ||
            String(h.componente || '').toLowerCase().includes(texto) ||
            String(h.descripcion || '').toLowerCase().includes(texto);

        let coincideEstado = true;
        const estadoH = h.estado || 'Pendiente';
        if (filtroEstadoTriage === 'PENDIENTES') {
            coincideEstado = estadoH === 'Pendiente' || estadoH === 'nuevo' || estadoH === 'Visto';
        } else if (filtroEstadoTriage === 'VALIDADOS') {
            coincideEstado = estadoH === 'Validado' || estadoH === 'Descartado';
        }
        return coincideTexto && coincideEstado;
    });

    filtrados.sort(([, a], [, b]) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
    });

    if (filtrados.length === 0) {
        cont.innerHTML = `
            <div style="padding: 2.5rem; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                <span class="material-symbols-outlined" style="font-size: 2.2rem; color: #38bdf8; margin-bottom: 8px;" aria-hidden="true">inbox</span>
                <p style="margin: 0;">No se encontraron hallazgos en la bandeja bajo el filtro seleccionado.</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = filtrados.map(([idKey, h]) => {
        const estado = h.estado || 'Pendiente';
        const esValidado = estado === 'Validado';
        const esDescartado = estado === 'Descartado';
        const esVisto = estado === 'Visto';
        const esNuevo = estado === 'nuevo' || estado === 'Pendiente';
        
        let colorEstado = '#f59e0b';
        let etiquetaEstado = estado.toUpperCase();
        if (esValidado) { colorEstado = '#00e676'; }
        else if (esDescartado) { colorEstado = '#ef4444'; }
        else if (esVisto) { colorEstado = '#38bdf8'; etiquetaEstado = 'VISTO'; }
        else if (esNuevo) { colorEstado = '#f59e0b'; etiquetaEstado = 'PENDIENTE'; }

        let fechaFmt = h.timestamp ? new Date(h.timestamp).toLocaleDateString() + ' ' + new Date(h.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : (h.fecha || 'Reciente');
        let componenteText = h.componente || 'Condición Global';
        let severidadText = h.severidadValidada || h.severidadPreliminar || h.severidad || 'Zona C';
        let colorSev = obtenerColorCriticidad(severidadText);
        let avisoSapText = h.avisoSap ? ` | Aviso SAP: ${h.avisoSap}` : '';

        return `
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 180px minmax(220px, 1fr) 220px 140px; align-items: center; gap: 16px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(0,0,0,0.3)'">
                
                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                    <span style="background: rgba(0,0,0,0.5); color: ${colorEstado}; border: 1px solid ${colorEstado}; padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 0.65rem; text-align: center; width: 85px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${etiquetaEstado}
                    </span>
                    <div style="min-width: 0;">
                        <div style="font-weight: 800; color: #ffffff; font-family: monospace; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escaparHTML(h.tag || 'TAG')}</div>
                        <div style="font-size: 0.68rem; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Área: ${escaparHTML(h.area || 'Planta')}</div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
                    <div style="font-size: 0.78rem; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        📍 Punto: <span style="color: #38bdf8;">${escaparHTML(componenteText)}</span>
                    </div>
                    <div style="font-size: 0.68rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escaparHTML(h.descripcion || '').substring(0, 50)}...
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
                    <div style="font-size: 0.74rem; color: #94a3b8; white-space: nowrap;">
                        Criticidad: <strong style="color: ${colorSev};">${escaparHTML(severidadText)}</strong>
                    </div>
                    <div style="font-size: 0.68rem; color: #64748b; white-space: nowrap;">
                        Fecha: ${escaparHTML(fechaFmt)}${escaparHTML(avisoSapText)}
                    </div>
                </div>

                <div style="text-align: right;">
                    <button type="button" onclick="window.abrirModalValidacionAnalista('${idKey}')" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer; white-space: nowrap;">
                        ${estado === 'Pendiente' || estado === 'nuevo' ? 'Ver Reporte' : (esVisto ? 'Validar Caso' : 'Ver / Editar')}
                    </button>
                </div>

            </div>
        `;
    }).join('');
};

window.filtrarTriageEstado = (estado) => {
    filtroEstadoTriage = estado;
    const btnPend = document.getElementById('btn-triage-pendientes');
    const btnVal = document.getElementById('btn-triage-validados');
    const btnTodos = document.getElementById('btn-triage-todos');

    if (btnPend) {
        btnPend.style.background = estado === 'PENDIENTES' ? '#f59e0b' : 'transparent';
        btnPend.style.color = estado === 'PENDIENTES' ? '#0f172a' : '#94a3b8';
    }
    if (btnVal) {
        btnVal.style.background = estado === 'VALIDADOS' ? '#00e676' : 'transparent';
        btnVal.style.color = estado === 'VALIDADOS' ? '#0f172a' : '#94a3b8';
    }
    if (btnTodos) {
        btnTodos.style.background = estado === 'TODOS' ? '#38bdf8' : 'transparent';
        btnTodos.style.color = estado === 'TODOS' ? '#0f172a' : '#94a3b8';
    }
    renderizarListaTriage();
};

window.filtrarTriageTexto = (txt) => {
    filtroBusquedaTriage = txt;
    renderizarListaTriage();
};

window.abrirModalValidacionAnalista = async (idKey) => {
    const hallazgo = listaHallazgosActuales[idKey];
    if (!hallazgo) return;

    if (!hallazgo.estado || hallazgo.estado === 'Pendiente' || hallazgo.estado === 'nuevo') {
        try {
            await dbTriage.child(idKey).update({ estado: 'Visto' });
        } catch (e) {
            console.warn('No se pudo actualizar estado a visto:', e);
        }
    }

    const idModal = 'modal-val-' + Date.now();
    const overlay = document.createElement('div');
    overlay.id = idModal;
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;';

    let multimediaHTML = `<div style="font-size: 0.78rem; color: #94a3b8; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">📷 Sin evidencias multimedia adjuntas.</div>`;
    
    const listaEvidencias = hallazgo.evidencias || (hallazgo.fotoBase64 ? [{ tipo: 'imagen', data: hallazgo.fotoBase64 }] : []);

    if (listaEvidencias.length > 0) {
        multimediaHTML = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;" role="region" aria-label="Carrusel de evidencias">
                ${listaEvidencias.map((ev, i) => {
                    if (ev.tipo === 'video') {
                        return `<video src="${ev.data}" controls style="height: 110px; width: 160px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;"></video>`;
                    }
                    return `<img src="${ev.data}" style="height: 110px; width: 110px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; flex-shrink: 0;" onclick="window.abrirVisorMultimediaInterno('${ev.data}', 'imagen')" title="Clic para abrir en visor interno" alt="Evidencia ${i+1}">`;
                }).join('')}
            </div>
        `;
    }

    const sevActual = hallazgo.severidadValidada || hallazgo.severidadPreliminar || hallazgo.severidad || 'Zona C (Naranja)';

    overlay.innerHTML = `
        <div class="modal-box glass-panel" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; width: 100%; max-width: 540px; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
            <header style="background: rgba(245, 158, 11, 0.18); border-bottom: 1px solid rgba(245, 158, 11, 0.35); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color: #f59e0b; font-size: 1.4rem;" aria-hidden="true">fact_check</span>
                    <h3 style="margin: 0; color: white; font-size: 1.05rem; font-weight: 700;">Validación: ${escaparHTML(hallazgo.tag)}</h3>
                </div>
                <button type="button" onclick="window.generarFichaWhatsApp('${idKey}')" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;" title="Generar tarjeta gráfica para WhatsApp">
                    <span class="material-symbols-outlined" style="font-size: 0.95rem;">share</span> Ficha WhatsApp
                </button>
            </header>
            
            <div style="padding: 18px 20px; color: #e2e8f0; font-size: 0.85rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <label style="font-size: 0.72rem; color: #94a3b8; display: block; margin-bottom: 4px; font-weight: 700; text-transform: uppercase;">Carrusel de Evidencias (Clic para visor interno):</label>
                    ${multimediaHTML}
                </div>

                <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                    <p style="margin: 0 0 4px 0; color: #38bdf8; font-weight: bold; font-size: 0.78rem;">Descripción del Reporte de Terreno:</p>
                    <p style="margin: 0; color: #e2e8f0; white-space: pre-line; line-height: 1.4;">${escaparHTML(hallazgo.descripcion || hallazgo.detalle)}</p>
                </div>

                <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px; color: #38bdf8; font-weight: bold; font-size: 0.8rem;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">assignment</span>
                        <span>Gestión de Orden de Mantenimiento / Aviso SAP</span>
                    </div>
                    <div class="campo-formulario">
                        <label style="font-size: 0.72rem; color: #94a3b8;">Número de Aviso SAP Generado:</label>
                        <input type="text" id="input-aviso-sap-val" value="${escaparHTML(hallazgo.avisoSap || '')}" placeholder="Ej: AV-928471" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; font-size: 0.82rem; outline: none; font-family: monospace;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 4px;">Decisión del Analista</label>
                        <select id="select-estado-val" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; outline: none; cursor: pointer; font-weight: bold;">
                            <option value="Validado" ${hallazgo.estado === 'Validado' ? 'selected' : ''}>✅ Validar (Impacta Timeline y Mapa 3D)</option>
                            <option value="Descartado" ${hallazgo.estado === 'Descartado' ? 'selected' : ''}>❌ Descartar (Registra en Timeline sin alterar Mapa)</option>
                            <option value="Visto" ${hallazgo.estado === 'Visto' ? 'selected' : ''}>👁️ Visto (En revisión)</option>
                        </select>
                    </div>

                    <div>
                        <label style="font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 4px;">Ajustar Severidad / Color</label>
                        <select id="select-severidad-val" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; outline: none; cursor: pointer; font-weight: bold;">
                            <option value="Zona A (Verde)" ${sevActual.includes('Verde') || sevActual.includes('Zona A') ? 'selected' : ''}>🟢 Zona A (Verde)</option>
                            <option value="Zona B (Amarillo)" ${sevActual.includes('Amarillo') || sevActual.includes('Zona B') ? 'selected' : ''}>🟡 Zona B (Amarillo)</option>
                            <option value="Zona C (Naranja)" ${sevActual.includes('Naranja') || sevActual.includes('Zona C') ? 'selected' : ''}>🟠 Zona C (Naranja)</option>
                            <option value="Zona D (Rojo)" ${sevActual.includes('Rojo') || sevActual.includes('Zona D') ? 'selected' : ''}>🔴 Zona D (Rojo)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 4px;">Diagnóstico / Comentario Técnico Experto</label>
                    <textarea id="textarea-diag-val" placeholder="Ingrese el diagnóstico técnico..." rows="3" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; box-sizing: border-box; resize: none; outline: none;">${escaparHTML(hallazgo.diagnostico || '')}</textarea>
                </div>
            </div>

            <footer style="padding: 12px 20px; background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                <button type="button" id="btn-cerrar-val" style="background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Cerrar</button>
                <button type="button" id="btn-guardar-val" style="background: #f59e0b; color: #0f172a; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 800;">Guardar y Registrar en Timeline</button>
            </footer>
        </div>
    `;

    document.body.appendChild(overlay);

    const cerrarModal = () => overlay.remove();
    overlay.querySelector('#btn-cerrar-val').onclick = cerrarModal;

    overlay.querySelector('#btn-guardar-val').onclick = async () => {
        const btnGuardar = overlay.querySelector('#btn-guardar-val');
        const nuevoEstado = overlay.querySelector('#select-estado-val').value;
        const nuevaSeveridad = overlay.querySelector('#select-severidad-val').value;
        const avisoSapVal = overlay.querySelector('#input-aviso-sap-val').value.trim();
        const diagnosticoTxt = overlay.querySelector('#textarea-diag-val').value.trim();

        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = 'Registrando...';
        }

        try {
            const fechaValidacion = new Date().toISOString();
            const usuarioValidador = auth.currentUser?.email || 'Analista CBM';

            await dbTriage.child(idKey).update({
                estado: nuevoEstado,
                severidadValidada: nuevaSeveridad,
                severidad: normalizarSeveridadParaCatastro(nuevaSeveridad),
                avisoSap: avisoSapVal,
                diagnostico: diagnosticoTxt,
                analistaValidador: usuarioValidador,
                fechaValidacion: fechaValidacion
            });

            const tagEquipo = hallazgo.tag;
            const keyActivo = await resolverKeyActivoCritico(tagEquipo);

            if (keyActivo) {
                const snapActivo = await dbActivos.child(keyActivo).once('value');
                const dataActivo = snapActivo.val() || {};
                const sevAnterior = dataActivo.severidad || dataActivo.estado || 'Verde';

                if (nuevoEstado === 'Validado') {
                    const sevNormalizada = normalizarSeveridadParaCatastro(nuevaSeveridad);
                    
                    await dbActivos.child(keyActivo).update({
                        severidad: sevNormalizada,
                        estado: sevNormalizada,
                        ultimoHallazgo: diagnosticoTxt || hallazgo.descripcion || 'Hallazgo de terreno validado',
                        avisoSapActivo: avisoSapVal || null,
                        fechaUltimaActualizacion: fechaValidacion
                    });

                    await dbActivos.child(`${keyActivo}/timeline`).push({
                        tipo: 'HALLAZGO_VALIDADO',
                        titulo: `Hallazgo Validado — ${hallazgo.componente || 'General'}`,
                        detalle: diagnosticoTxt || hallazgo.descripcion || 'Diagnóstico de terreno validado por analista.',
                        descripcionOriginal: hallazgo.descripcion || hallazgo.detalle || '',
                        severidadAnterior: sevAnterior,
                        severidadNueva: sevNormalizada,
                        avisoSap: avisoSapVal || null,
                        componente: hallazgo.componente || 'Condición Global',
                        autor: usuarioValidador,
                        timestamp: fechaValidacion,
                        evidencias: listaEvidencias,
                        idAlertaRef: idKey
                    });

                } else if (nuevoEstado === 'Descartado') {
                    await dbActivos.child(`${keyActivo}/timeline`).push({
                        tipo: 'HALLAZGO_DESCARTADO',
                        titulo: `Hallazgo Descartado — ${hallazgo.componente || 'General'}`,
                        detalle: diagnosticoTxt || 'El hallazgo fue revisado y descartado por el analista CBM.',
                        severidadAnterior: sevAnterior,
                        severidadNueva: sevAnterior,
                        componente: hallazgo.componente || 'Condición Global',
                        autor: usuarioValidador,
                        timestamp: fechaValidacion,
                        evidencias: listaEvidencias,
                        idAlertaRef: idKey
                    });
                }
            }

            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast(`✅ Validación guardada y registrada en la bitácora de ${tagEquipo}.`, 'exito');
            }
            cerrarModal();
        } catch (err) {
            console.error('Error al actualizar triage y timeline:', err);
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = 'Guardar y Registrar en Timeline';
            }
        }
    };
};

window.generarFichaWhatsApp = async (idKey) => {
    const hallazgo = listaHallazgosActuales[idKey];
    if (!hallazgo) return;

    const inputSapModal = document.getElementById('input-aviso-sap-val');
    const avisoSapActual = inputSapModal ? inputSapModal.value.trim() : (hallazgo.avisoSap || '');

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast('Generando tarjeta gráfica multi-imagen para WhatsApp...', 'info');
    }

    const cardDiv = document.createElement('div');
    cardDiv.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 620px;
        background: #0f172a;
        color: #f8fafc;
        font-family: 'Inter', system-ui, sans-serif;
        padding: 24px;
        box-sizing: border-box;
        border: 2px solid #38bdf8;
        border-radius: 16px;
    `;

    const fechaStr = hallazgo.timestamp ? new Date(hallazgo.timestamp).toLocaleString('es-CL') : (hallazgo.fecha || 'Reciente');
    const severidadTxt = hallazgo.severidadValidada || hallazgo.severidadPreliminar || hallazgo.severidad || 'Zona C';
    const colorSev = obtenerColorCriticidad(severidadTxt);
    const avisoSapFinal = avisoSapActual !== '' ? avisoSapActual : 'PENDIENTE DE ASIGNAR';
    const colorAviso = avisoSapActual !== '' ? '#00e676' : '#facc15';

    let listaFotos = [];
    if (hallazgo.evidencias && Array.isArray(hallazgo.evidencias)) {
        listaFotos = hallazgo.evidencias.filter(ev => ev.tipo === 'imagen' || !ev.tipo).map(ev => ev.data);
    }
    if (listaFotos.length === 0 && hallazgo.fotoBase64) {
        listaFotos.push(hallazgo.fotoBase64);
    }

    let contenedorEvidenciasHTML = '';
    if (listaFotos.length > 0) {
        if (listaFotos.length === 1) {
            contenedorEvidenciasHTML = `
                <div style="margin-bottom: 16px; text-align: center; background: #000; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); max-height: 280px;">
                    <img src="${listaFotos[0]}" style="width: 100%; height: 260px; object-fit: contain;" crossorigin="anonymous" />
                </div>
            `;
        } else if (listaFotos.length === 2) {
            contenedorEvidenciasHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; background: #000; padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    ${listaFotos.map(img => `<img src="${img}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 6px;" crossorigin="anonymous" />`).join('')}
                </div>
            `;
        } else {
            contenedorEvidenciasHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; background: #000; padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    ${listaFotos.map(img => `<img src="${img}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 6px;" crossorigin="anonymous" />`).join('')}
                </div>
            `;
        }
    } else {
        contenedorEvidenciasHTML = `<div style="font-size: 0.78rem; color: #94a3b8; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center; margin-bottom: 16px;">📷 Sin evidencias fotográficas adjuntas.</div>`;
    }

    cardDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 16px;">
            <div>
                <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; text-transform: uppercase;">Mina Los Colorados (CMP)</span>
                <h2 style="margin: 2px 0 0 0; font-size: 1.25rem; font-weight: 900; color: #ffffff;">REPORTE TÉCNICO CBM</h2>
            </div>
            <div style="background: ${colorSev}; color: #0f172a; padding: 6px 12px; border-radius: 8px; font-weight: 900; font-size: 0.85rem; text-align: center;">
                ${severidadTxt.toUpperCase()}
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
            <div>
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">EQUIPO / TAG</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #ffffff; font-family: monospace;">${escaparHTML(hallazgo.tag)}</div>
            </div>
            <div>
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">ÁREA / PLANTA</div>
                <div style="font-size: 1rem; font-weight: 700; color: #38bdf8;">${escaparHTML(hallazgo.area)}</div>
            </div>
            <div>
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">PUNTO / COMPONENTE</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #e2e8f0;">${escaparHTML(hallazgo.componente || 'Condición Global')}</div>
            </div>
            <div>
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">AVISO SAP</div>
                <div style="font-size: 0.9rem; font-weight: 800; color: ${colorAviso}; font-family: monospace;">${escaparHTML(avisoSapFinal)}</div>
            </div>
        </div>

        ${contenedorEvidenciasHTML}

        <div style="margin-bottom: 16px;">
            <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600; margin-bottom: 4px;">DESCRIPCIÓN DEL HALLAZGO / DIAGNÓSTICO</div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; font-size: 0.85rem; color: #e2e8f0; line-height: 1.4; white-space: pre-line;">
                ${escaparHTML(hallazgo.diagnostico || hallazgo.descripcion || hallazgo.detalle)}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 0.72rem; color: #94a3b8;">
            <span>📅 Fecha: ${escaparHTML(fechaStr)}</span>
            <span>CPF Ingeniería Ltda. | CIO Predictivo 2.0</span>
        </div>
    `;

    document.body.appendChild(cardDiv);

    try {
        if (typeof html2canvas === 'undefined') {
            alert('Librería html2canvas no disponible.');
            cardDiv.remove();
            return;
        }

        const canvas = await html2canvas(cardDiv, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#0f172a'
        });

        cardDiv.remove();

        const imageUri = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imageUri;
        link.download = `Reporte_${hallazgo.tag}_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('✅ Ficha gráfica multi-imagen lista para WhatsApp.', 'exito');
        }
    } catch (err) {
        console.error('Error al generar imagen:', err);
        cardDiv.remove();
        alert('Error al generar la tarjeta gráfica.');
    }
};

window.generarReportePDFTriage = async () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Cargando librería de exportación PDF...', 'alerta');
        }
        return;
    }

    const selectRango = document.getElementById('select-rango-pdf');
    const rangoFiltro = selectRango ? selectRango.value : 'SEMANA';

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast(`Generando reporte PDF (${rangoFiltro})...`, 'info');
    }

    const ahora = new Date();
    const entradas = Object.entries(listaHallazgosActuales);

    const filtradosPorRango = entradas.filter(([, h]) => {
        if (!h.timestamp) return true;
        const fechaReg = new Date(h.timestamp);
        if (isNaN(fechaReg.getTime())) return true;

        if (rangoFiltro === 'HOY') {
            return fechaReg.toDateString() === ahora.toDateString();
        } else if (rangoFiltro === 'SEMANA') {
            const diferenciaDias = (ahora - fechaReg) / (1000 * 60 * 60 * 24);
            return diferenciaDias <= 7;
        } else if (rangoFiltro === 'MES') {
            return fechaReg.getMonth() === ahora.getMonth() && fechaReg.getFullYear() === ahora.getFullYear();
        } else if (rangoFiltro === 'ANIO') {
            return fechaReg.getFullYear() === ahora.getFullYear();
        }
        return true;
    });

    if (filtradosPorRango.length === 0) {
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast(`No se encontraron hallazgos registrados para el rango seleccionado (${rangoFiltro}).`, 'alerta');
        }
        return;
    }

    let countD = 0;
    let countC = 0;
    let countB = 0;
    let countA = 0;

    filtradosPorRango.forEach(([, h]) => {
        const sev = String(h.severidadValidada || h.severidadPreliminar || h.severidad || '').toLowerCase();
        if (sev.includes('rojo') || sev.includes('zona d')) countD++;
        else if (sev.includes('naranja') || sev.includes('zona c')) countC++;
        else if (sev.includes('amarillo') || sev.includes('zona b')) countB++;
        else countA++;
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margenX = 14;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);

    await dibujarCabeceraCorporativa(doc, {
        titulo: `REPORTE CONSOLIDADO DE TRIAGE — (${rangoFiltro})`,
        subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
        referencia: `Auditoría y Validación de Hallazgos de Terreno`,
        severidad: '',
        textoCondicion: '',
        margenX
    });

    let posY = 32;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(anchoPagina - margenX - 95, posY, 95, 14, 1.5, 1.5, 'FD');
    
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('RESUMEN DE CRITICIDAD (KPIs)', anchoPagina - margenX - 92, posY + 4);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');

    doc.setTextColor(220, 38, 38);
    doc.text(`D: ${countD}`, anchoPagina - margenX - 92, posY + 10);

    doc.setTextColor(234, 88, 12);
    doc.text(`C: ${countC}`, anchoPagina - margenX - 70, posY + 10);

    doc.setTextColor(202, 138, 4);
    doc.text(`B: ${countB}`, anchoPagina - margenX - 48, posY + 10);

    doc.setTextColor(22, 163, 74);
    doc.text(`A: ${countA}`, anchoPagina - margenX - 24, posY + 10);

    posY += 17;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Listado Consolidado de Hallazgos (${filtradosPorRango.length} registros):`, margenX, posY);

    posY += 4;
    doc.setFillColor(30, 41, 59);
    doc.rect(margenX, posY, anchoContenido, 7, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TAG / ÁREA', margenX + 3, posY + 5);
    doc.text('PUNTO / COMPONENTE', margenX + 38, posY + 5);
    doc.text('CRITICIDAD', margenX + 92, posY + 5);
    doc.text('AVISO SAP', margenX + 120, posY + 5);
    doc.text('ESTADO', margenX + 148, posY + 5);
    doc.text('FECHA', margenX + 172, posY + 5);

    posY += 7;

    filtradosPorRango.forEach(([_, h], idx) => {
        const tag = String(h.tag || 'TAG').substring(0, 15);
        const area = String(h.area || 'Planta').substring(0, 15);
        const componente = String(h.componente || 'General').substring(0, 26);
        const severidadStr = String(h.severidadValidada || h.severidadPreliminar || 'Zona C');
        const avisoSap = String(h.avisoSap || 'S/A').substring(0, 12);
        const estado = String(h.estado || 'Pendiente').toUpperCase().substring(0, 12);
        const fecha = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : 'Reciente';

        if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margenX, posY, anchoContenido, 7, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(margenX, posY + 7, margenX + anchoContenido, posY + 7);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${tag}`, margenX + 3, posY + 4.5);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`${area}`, margenX + 3, posY + 6.8);

        doc.setFont('helvetica', 'bold');
        doc.text(`${componente}`, margenX + 38, posY + 5);

        const sLower = severidadStr.toLowerCase();
        if (sLower.includes('rojo') || sLower.includes('zona d')) {
            doc.setTextColor(220, 38, 38);
        } else if (sLower.includes('naranja') || sLower.includes('zona c')) {
            doc.setTextColor(234, 88, 12);
        } else if (sLower.includes('amarillo') || sLower.includes('zona b')) {
            doc.setTextColor(202, 138, 4);
        } else {
            doc.setTextColor(22, 163, 74);
        }

        doc.text(`${severidadStr.substring(0, 18)}`, margenX + 92, posY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(`${avisoSap}`, margenX + 120, posY + 5);
        doc.text(`${estado}`, margenX + 148, posY + 5);
        doc.text(`${fecha}`, margenX + 172, posY + 5);

        posY += 7;

        if (posY > altoPagina - 40) {
            doc.addPage();
            posY = 20;
        }
    });

    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion: new Date().toLocaleDateString('es-CL'),
        textoCentro: `Reporte de Triage Operacional | Planta Mina Los Colorados`,
        margenX
    });

    if (window.abrirVisorPDFDesdeBase64) {
        const pdfBase64 = doc.output('datauristring');
        window.abrirVisorPDFDesdeBase64(pdfBase64, `Reporte_Triage_${rangoFiltro}.pdf`);
    } else {
        doc.save(`Reporte_Triage_${rangoFiltro}.pdf`);
    }
};

export default {
    renderizarModuloTriage,
    iniciarEscuchaBadgeGlobal
};