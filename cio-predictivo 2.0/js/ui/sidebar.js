// ============================================================================
// MÓDULO UI: JS/UI/SIDEBAR.JS
// CIO PREDICTIVO 2.0 — Catastro Industrial, Filtro de Áreas y Búsqueda CBM
// ============================================================================

import { renderizarModuloTriage } from './triage.js';

// ----------------------------------------------------------------------------
// ESTADO INTERNO DEL SIDEBAR
// ----------------------------------------------------------------------------
let equiposMemoria = {};
let areaSeleccionada = null;
let textoBusqueda = '';
let timerDebounce = null;

// ----------------------------------------------------------------------------
// UTILIDADES PURAS Y RESOLUCIÓN NORMATIVA
// ----------------------------------------------------------------------------
const escaparHTML = (texto = '') =>
    String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const obtenerSeveridadInfo = (sevRaw = '') => {
    const sev = String(sevRaw || '').trim().toLowerCase();

    if (sev === 'rojo' || sev === 'critico' || sev === 'd') {
        return { color: '#ef4444', texto: 'Alarma Crítica', peso: 4 };
    }
    if (sev === 'naranja' || sev === 'salmon' || sev === 'c') {
        return { color: '#f97316', texto: 'Alerta Preventiva', peso: 3 };
    }
    if (sev === 'amarillo' || sev === 'b') {
        return { color: '#eab308', texto: 'Seguimiento', peso: 2 };
    }
    return { color: '#00e676', texto: 'Operación Normal', peso: 1 };
};

// ----------------------------------------------------------------------------
// NÚCLEO DE RENDERIZADO
// ----------------------------------------------------------------------------
const renderizarSidebar = () => {
    const contenedor = document.getElementById('contenedor-areas-sidebar');
    if (!contenedor) return;

    const idsEquipos = Object.keys(equiposMemoria);

    // Estado 1: Sin datos en memoria
    if (idsEquipos.length === 0) {
        contenedor.innerHTML = `
            <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted, #94a3b8);">
                <span class="material-symbols-outlined" style="font-size: 2rem; color: #38bdf8; animation: spin 1.2s linear infinite;" aria-hidden="true">autorenew</span>
                <p style="margin: 8px 0 0 0; font-size: 0.8rem;">Cargando activos de planta...</p>
            </div>
        `;
        return;
    }

    // Estado 2: Vista de resultados de búsqueda
    if (textoBusqueda.trim().length > 0) {
        renderizarResultadosBusqueda(contenedor);
        return;
    }

    // Estado 3: Vista de equipos de un área específica seleccionada
    if (areaSeleccionada) {
        renderizarEquiposDeArea(contenedor, areaSeleccionada);
        return;
    }

    // Estado 4: Vista principal de Áreas Operacionales
    renderizarListaAreas(contenedor);
};

// ----------------------------------------------------------------------------
// VISTA: LISTA DE ÁREAS OPERACIONALES
// ----------------------------------------------------------------------------
const renderizarListaAreas = (contenedor) => {
    // Agrupar equipos por área operacional
    const agrupado = {};

    for (const [idKey, eq] of Object.entries(equiposMemoria)) {
        if (!eq) continue;
        const nombreArea = String(eq.area || 'Área General').trim();
        if (!agrupado[nombreArea]) {
            agrupado[nombreArea] = {
                nombre: nombreArea,
                equipos: [],
                maxSeveridad: { color: '#00e676', texto: 'Operación Normal', peso: 1 }
            };
        }
        agrupado[nombreArea].equipos.push({ idKey, eq });

        const sevInfo = obtenerSeveridadInfo(eq.severidad || eq.estado);
        if (sevInfo.peso > agrupado[nombreArea].maxSeveridad.peso) {
            agrupado[nombreArea].maxSeveridad = sevInfo;
        }
    }

    const areasOrdenadas = Object.values(agrupado).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const htmlAreas = areasOrdenadas.map((item) => {
        const cantEquipos = item.equipos.length;
        const nombreLimpio = escaparHTML(item.nombre);

        return `
            <div class="tarjeta-area-sidebar"
                 role="button"
                 tabindex="0"
                 onclick="window.seleccionarAreaSidebar('${nombreLimpio}')"
                 onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); window.seleccionarAreaSidebar('${nombreLimpio}'); }"
                 style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1)); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center;"
                 onmouseover="this.style.background='rgba(56, 189, 248, 0.08)'; this.style.borderColor='rgba(56, 189, 248, 0.4)';"
                 onmouseout="this.style.background='rgba(255, 255, 255, 0.03)'; this.style.borderColor='var(--border-glass, rgba(255, 255, 255, 0.1))';">
                
                <div style="min-width: 0;">
                    <h3 style="margin: 0 0 3px 0; font-size: 0.88rem; color: #ffffff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${nombreLimpio}
                    </h3>
                    <span style="font-size: 0.72rem; color: var(--text-muted, #94a3b8);">
                        ${cantEquipos} ${cantEquipos === 1 ? 'equipo' : 'equipos'}
                    </span>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${item.maxSeveridad.color}; display: inline-block; box-shadow: 0 0 8px ${item.maxSeveridad.color};" 
                          title="Condición: ${item.maxSeveridad.texto}"></span>
                    <span class="material-symbols-outlined" style="font-size: 1.1rem; color: var(--text-muted, #94a3b8);" aria-hidden="true">chevron_right</span>
                </div>
            </div>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div style="padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 0.74rem; color: var(--text-muted, #94a3b8); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    Áreas Operacionales (${areasOrdenadas.length})
                </span>
            </div>
            ${htmlAreas}
        </div>
    `;
};

// ----------------------------------------------------------------------------
// VISTA: EQUIPOS DE UN ÁREA OPERACIONAL
// ----------------------------------------------------------------------------
const renderizarEquiposDeArea = (contenedor, nombreArea) => {
    const equiposArea = Object.entries(equiposMemoria)
        .filter(([, eq]) => eq && String(eq.area || 'Área General').trim().toLowerCase() === nombreArea.toLowerCase())
        .map(([idKey, eq]) => ({ idKey, eq }))
        .sort((a, b) => String(a.eq.tag || a.idKey).localeCompare(String(b.eq.tag || b.idKey)));

    const htmlEquipos = equiposArea.map(({ idKey, eq }) => {
        const tag = escaparHTML(eq.tag || idKey);
        const sevInfo = obtenerSeveridadInfo(eq.severidad || eq.estado);
        const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;

        return `
            <div class="item-navegable"
                 data-target="${escaparHTML(targetId)}"
                 role="button"
                 tabindex="0"
                 style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1)); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.18s ease; display: flex; align-items: center; gap: 10px;"
                 onmouseover="this.style.background='rgba(56, 189, 248, 0.06)'; this.style.borderColor='rgba(56, 189, 248, 0.35)';"
                 onmouseout="if(this.style.border.indexOf('#38bdf8') === -1) { this.style.background='rgba(255, 255, 255, 0.03)'; this.style.borderColor='var(--border-glass, rgba(255, 255, 255, 0.1))'; }">
                
                <span class="material-symbols-outlined" style="font-size: 1.3rem; color: #38bdf8; flex-shrink: 0;" aria-hidden="true">precision_manufacturing</span>
                
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.88rem; font-weight: 700; color: #ffffff; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${tag}
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px; margin-top: 2px;">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background-color: ${sevInfo.color}; display: inline-block; flex-shrink: 0;"></span>
                        <span style="font-size: 0.72rem; color: ${sevInfo.color}; font-weight: 600;">${sevInfo.texto}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div style="padding: 10px 14px;">
            <button type="button" 
                    onclick="window.volverAListaAreas()"
                    style="background: transparent; border: none; color: #38bdf8; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 0 10px 0;">
                <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">arrow_back</span>
                <span>Volver a Áreas</span>
            </button>

            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0; font-size: 0.95rem; color: #ffffff; font-weight: 800;">
                    ${escaparHTML(nombreArea)}
                </h4>
                <span style="font-size: 0.72rem; color: var(--text-muted, #94a3b8);">
                    ${equiposArea.length} ${equiposArea.length === 1 ? 'equipo registrado' : 'equipos registrados'}
                </span>
            </div>

            ${htmlEquipos}
        </div>
    `;
};

// ----------------------------------------------------------------------------
// VISTA: RESULTADOS DE BÚSQUEDA UNIVERSAL
// ----------------------------------------------------------------------------
const renderizarResultadosBusqueda = (contenedor) => {
    const termino = textoBusqueda.trim().toLowerCase();

    const resultados = Object.entries(equiposMemoria)
        .filter(([, eq]) => {
            if (!eq) return false;
            const tag = String(eq.tag || '').toLowerCase();
            const nombre = String(eq.nombre || '').toLowerCase();
            const area = String(eq.area || '').toLowerCase();
            return tag.includes(termino) || nombre.includes(termino) || area.includes(termino);
        })
        .map(([idKey, eq]) => ({ idKey, eq }));

    if (resultados.length === 0) {
        contenedor.innerHTML = `
            <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted, #94a3b8);">
                <span class="material-symbols-outlined" style="font-size: 2rem; color: #94a3b8; margin-bottom: 6px;" aria-hidden="true">search_off</span>
                <p style="margin: 0; font-size: 0.85rem;">No se encontraron activos para "${escaparHTML(textoBusqueda)}".</p>
                <button type="button" onclick="window.limpiarBusquedaSidebar()" style="margin-top: 10px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">
                    Limpiar búsqueda
                </button>
            </div>
        `;
        return;
    }

    const htmlResultados = resultados.map(({ idKey, eq }) => {
        const tag = escaparHTML(eq.tag || idKey);
        const area = escaparHTML(eq.area || 'Área General');
        const sevInfo = obtenerSeveridadInfo(eq.severidad || eq.estado);
        const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;

        return `
            <div class="item-navegable"
                 data-target="${escaparHTML(targetId)}"
                 role="button"
                 tabindex="0"
                 style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1)); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.18s ease; display: flex; align-items: center; gap: 10px;">
                
                <span class="material-symbols-outlined" style="font-size: 1.3rem; color: #38bdf8; flex-shrink: 0;" aria-hidden="true">precision_manufacturing</span>
                
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.88rem; font-weight: 700; color: #ffffff; font-family: monospace;">
                        ${tag}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted, #94a3b8); margin-top: 1px;">
                        ${area}
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px; margin-top: 2px;">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background-color: ${sevInfo.color}; display: inline-block;"></span>
                        <span style="font-size: 0.7rem; color: ${sevInfo.color}; font-weight: 600;">${sevInfo.texto}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div style="padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 0.74rem; color: var(--text-muted, #94a3b8); font-weight: 700; text-transform: uppercase;">
                    Resultados (${resultados.length})
                </span>
                <button type="button" onclick="window.limpiarBusquedaSidebar()" style="background: transparent; border: none; color: #38bdf8; font-size: 0.72rem; cursor: pointer; text-decoration: underline;">
                    Limpiar
                </button>
            </div>
            ${htmlResultados}
        </div>
    `;
};

// ----------------------------------------------------------------------------
// INTERACCIÓN Y NAVEGACIÓN GLOBAL
// ----------------------------------------------------------------------------
window.seleccionarAreaSidebar = (nombreArea) => {
    areaSeleccionada = nombreArea;
    if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
        window.filtrarMapaPorAreaOSearch('AREA', nombreArea);
    }
    renderizarSidebar();
};

window.volverAListaAreas = () => {
    areaSeleccionada = null;
    if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
        window.filtrarMapaPorAreaOSearch('TODOS', '');
    }
    renderizarSidebar();
};

window.limpiarBusquedaSidebar = () => {
    textoBusqueda = '';
    const input = document.getElementById('input-busqueda-sidebar');
    if (input) input.value = '';
    if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
        window.filtrarMapaPorAreaOSearch(areaSeleccionada ? 'AREA' : 'TODOS', areaSeleccionada || '');
    }
    renderizarSidebar();
};

window.cambiarPestanaSidebar = (pestana) => {
    const tabCatastro = document.getElementById('tab-catastro');
    const tabTriage = document.getElementById('tab-triage'); // Pestaña actualizada

    if (pestana === 'catastro') {
        tabCatastro?.classList.add('active');
        tabCatastro?.setAttribute('aria-selected', 'true');
        tabTriage?.classList.remove('active');
        tabTriage?.setAttribute('aria-selected', 'false');
        areaSeleccionada = null;
        window.limpiarBusquedaSidebar();
    } else if (pestana === 'triage') {
        tabTriage?.classList.add('active');
        tabTriage?.setAttribute('aria-selected', 'true');
        tabCatastro?.classList.remove('active');
        tabCatastro?.setAttribute('aria-selected', 'false');
        
        // Renderizar el módulo Triage en el espacio de trabajo dinámico principal
        renderizarModuloTriage('espacio-trabajo-dinamico');
    }
};

// ----------------------------------------------------------------------------
// INICIALIZACIÓN
// ----------------------------------------------------------------------------
export const inicializarBarraLateral = () => {
    // 1. Conexión del buscador con Debounce
    const inputBusqueda = document.getElementById('input-busqueda-sidebar');
    if (inputBusqueda && !inputBusqueda.dataset.conectado) {
        inputBusqueda.dataset.conectado = 'true';
        inputBusqueda.addEventListener('input', (e) => {
            clearTimeout(timerDebounce);
            timerDebounce = setTimeout(() => {
                textoBusqueda = e.target.value.trim();
                if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
                    if (textoBusqueda.length > 0) {
                        window.filtrarMapaPorAreaOSearch('SEARCH', textoBusqueda);
                    } else {
                        window.filtrarMapaPorAreaOSearch(areaSeleccionada ? 'AREA' : 'TODOS', areaSeleccionada || '');
                    }
                }
                renderizarSidebar();
            }, 180);
        });
    }

    // 2. Escucha del evento custom emitido por app.js
    document.addEventListener('datosEquiposActualizados', (e) => {
        if (e.detail) {
            equiposMemoria = e.detail;
            renderizarSidebar();
        }
    });

    // 3. Fallback inmediato: Si los datos ya fueron recibidos por Firebase antes de llamar a inicializarBarraLateral
    if (window.datosGlobalesEquipos && Object.keys(window.datosGlobalesEquipos).length > 0) {
        equiposMemoria = window.datosGlobalesEquipos;
        renderizarSidebar();
    }
};

export default {
    inicializarBarraLateral
};