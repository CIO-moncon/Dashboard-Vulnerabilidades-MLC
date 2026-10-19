// ============================================================================
// MÓDULO UI: APP DE TERRENO (RUTA SECUENCIAL + FUSE.JS + ASISTENTE TÁCTIL)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Delegación de Eventos y WAI-ARIA
// ============================================================================

import { db } from '../core/firebase-config.js';
import { renderizarExpediente } from './expediente.js';

// ----------------------------------------------------------------------------
// UTILIDADES PURAS Y HELPERS
// ----------------------------------------------------------------------------
const escaparHTML = (texto = '') =>
    String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const mostrarToastSeguro = (mensaje, tipo = 'info') => {
    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast(mensaje, tipo);
    } else if (window.mostrarNotificacion) {
        window.mostrarNotificacion(mensaje);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
};

export const obtenerSemanaPMSActual = () => {
    const fecha = new Date();
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `PMS${weekNo}`;
};

// ----------------------------------------------------------------------------
// CONTROLADOR PRINCIPAL: RENDERIZAR MÓDULO TERRENO
// ----------------------------------------------------------------------------
export async function renderizarModuloTerreno(contenedorId = 'espacio-trabajo-dinamico', semanaSeleccionada = null) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const semanaActiva = semanaSeleccionada || obtenerSemanaPMSActual();

    contenedor.innerHTML = `
        <div role="status" aria-live="polite" style="padding: 4rem 1rem; text-align: center; color: var(--primary-blue, #38bdf8); display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 2.5rem;" aria-hidden="true">autorenew</span>
            <p style="margin-top: 0.75rem; color: var(--text-muted, #94a3b8); font-size: 0.9rem;">Cargando Ruta de Terreno y Asistente Táctil (${escaparHTML(semanaActiva)})...</p>
        </div>
    `;

    try {
        const [snapActivos, snapPMS] = await Promise.all([
            db.ref('activos_criticos').once('value'),
            db.ref(`historial_informes/pms_semanal/${semanaActiva}`).once('value')
        ]);

        const activosMap = snapActivos.exists() ? snapActivos.val() : {};
        const pmsData = snapPMS.exists() ? snapPMS.val() : null;
        let ordenes = pmsData && pmsData.ordenes ? Object.values(pmsData.ordenes) : [];

        // Ordenamiento secuencial por Área y luego por TAG
        ordenes.sort((a, b) => {
            const areaA = (a.area || '').localeCompare(b.area || '');
            if (areaA !== 0) return areaA;
            return (a.tag || '').localeCompare(b.tag || '', undefined, { numeric: true });
        });

        contenedor.innerHTML = `
            <article class="panel-industrial" style="animation: fadeIn 0.3s ease; padding: 1rem; display: flex; flex-direction: column; gap: 14px; height: calc(100vh - 90px); box-sizing: border-box; max-width: 920px; margin: 0 auto;">
                
                <!-- CABECERA TÁCTIL DE TERRENO -->
                <header style="background: rgba(15, 23, 42, 0.9); padding: 14px 18px; border-radius: 12px; border: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; flex-shrink: 0;">
                    <div>
                        <h2 style="color: white; font-size: 1.2rem; margin: 0 0 2px 0; display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="color: #f59e0b; font-size: 1.5rem;" aria-hidden="true">smartphone</span>
                            Modo Terreno — Ruta Secuencial
                        </h2>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.78rem;">
                            Período: <strong style="color: #38bdf8;">${escaparHTML(semanaActiva)}</strong> | Total OMs en Ruta: <strong>${ordenes.length}</strong>
                        </p>
                    </div>

                    <button type="button" 
                            id="btn-volver-dashboard-terreno" 
                            class="btn-topbar" 
                            style="background: rgba(255, 255, 255, 0.06); color: var(--text-main); border: 1px solid var(--border-glass); padding: 6px 12px; font-size: 0.8rem;"
                            aria-label="Salir al mapa general del dashboard">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">arrow_back</span>
                        <span>Salir a Dashboard</span>
                    </button>
                </header>

                <!-- BUSCADOR CON FUSE.JS -->
                <section style="background: rgba(15, 23, 42, 0.7); padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border-glass); display: flex; align-items: center; gap: 10px; flex-shrink: 0;" role="search">
                    <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.35rem;" aria-hidden="true">search</span>
                    <input type="search" 
                           id="buscador-fuse-terreno" 
                           placeholder="Búsqueda rápida por TAG, Equipo, OM o Actividad..." 
                           aria-label="Buscar en ruta de terreno"
                           style="background: var(--bg-input); border: 1px solid var(--border-glass); color: white; padding: 10px 14px; border-radius: 8px; font-size: 0.88rem; width: 100%; outline: none; font-family: inherit; box-sizing: border-box;">
                </section>

                <!-- LISTA TÁCTICA SECUENCIAL DE TERRENO -->
                <section id="contenedor-cards-terreno" 
                         role="region" 
                         aria-label="Listado de órdenes de trabajo en ruta"
                         aria-live="polite"
                         style="overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;">
                    ${renderizarCardsSecuenciales(ordenes, activosMap)}
                </section>
            </article>
        `;

        // Configuración de Fuse.js
        const fuse = window.Fuse ? new window.Fuse(ordenes, {
            keys: ['tag', 'orden', 'descripcion', 'area'],
            threshold: 0.35,
            distance: 100
        }) : null;

        const inputBuscador = document.getElementById('buscador-fuse-terreno');
        const contenedorCards = document.getElementById('contenedor-cards-terreno');
        let timerDebounce = null;

        if (inputBuscador && contenedorCards) {
            inputBuscador.addEventListener('input', (e) => {
                clearTimeout(timerDebounce);
                const query = e.target.value.trim();

                timerDebounce = setTimeout(() => {
                    if (!query) {
                        contenedorCards.innerHTML = renderizarCardsSecuenciales(ordenes, activosMap);
                    } else if (fuse) {
                        const resultados = fuse.search(query).map(res => res.item);
                        contenedorCards.innerHTML = renderizarCardsSecuenciales(resultados, activosMap);
                    } else {
                        const qLower = query.toLowerCase();
                        const filtradas = ordenes.filter(o => 
                            (o.tag || '').toLowerCase().includes(qLower) || 
                            (o.orden || '').toLowerCase().includes(qLower) || 
                            (o.descripcion || '').toLowerCase().includes(qLower)
                        );
                        contenedorCards.innerHTML = renderizarCardsSecuenciales(filtradas, activosMap);
                    }
                }, 180);
            });
        }

        // Delegación de eventos única
        configurarDelegacionTerreno(contenedor, semanaActiva, contenedorId);

        // Volver al mapa principal
        document.getElementById('btn-volver-dashboard-terreno')?.addEventListener('click', () => {
            window.renderizarMapaPlanta?.();
        });

    } catch (error) {
        console.error("Error en App de Terreno:", error);
        contenedor.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: #ef4444;">Error al cargar la ruta de terreno: ${escaparHTML(error.message)}</div>`;
    }
}

// ----------------------------------------------------------------------------
// RENDERIZADO DE TARJETAS TÁCTILES + ASISTENTE VISUAL
// ----------------------------------------------------------------------------
function renderizarCardsSecuenciales(ordenes, activosMap) {
    if (!ordenes || ordenes.length === 0) {
        return `
            <div style="padding: 50px 20px; text-align: center; color: var(--text-muted); background: rgba(15, 23, 42, 0.4); border-radius: 10px; border: 1px dashed var(--border-glass);">
                <span class="material-symbols-outlined" style="font-size: 42px; color: #f59e0b; margin-bottom: 8px;" aria-hidden="true">search_off</span>
                <p style="margin: 0; font-size: 0.9rem;">No se encontraron órdenes coincidentes en la ruta actual.</p>
            </div>
        `;
    }

    return ordenes.map((item, idx) => {
        const tagKey = (item.tag || '').trim().toUpperCase().replace(/\s+/g, '_');
        const activoFirebase = activosMap[tagKey] || null;
        const existeEnCatastro = Boolean(activoFirebase);

        const sev = existeEnCatastro ? (activoFirebase.severidad || activoFirebase.estado || 'verde').toLowerCase() : 'verde';
        let colorBorde = '#10b981';
        let textoSev = 'Zona A/B (Normal)';
        if (sev === 'rojo' || sev === 'critico') { colorBorde = '#ef4444'; textoSev = 'Crítico (Zona D)'; }
        else if (sev === 'naranja' || sev === 'amarillo') { colorBorde = '#f97316'; textoSev = 'Alerta (Zona C)'; }

        const est = item.estadoEjecucion || 'PENDIENTE';
        const tagSeguro = escaparHTML(item.tag);
        const descSegura = escaparHTML(item.descripcion);
        const ordenSegura = escaparHTML(item.orden);
        const areaSegura = escaparHTML(item.area || 'Planta');
        const fechaSegura = escaparHTML(item.fechaProg || 'Programa');
        const obsSegura = escaparHTML(item.observacionAuditor || '');
        const idKeySegura = escaparHTML(item.idKey);

        return `
            <article class="card-orden-terreno" 
                     data-key="${idKeySegura}" 
                     role="article"
                     aria-label="Orden ${ordenSegura} de ${tagSeguro}"
                     style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass); border-left: 5px solid ${colorBorde}; border-radius: 10px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; contain: content;">
                
                <header style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px;">#${idx + 1} Área: ${areaSegura}</span>
                            <time style="font-size: 0.72rem; color: var(--text-muted);">${fechaSegura}</time>
                        </div>
                        <h3 style="margin: 0; color: white; font-size: 1.1rem; font-family: monospace;">${tagSeguro}</h3>
                        <p style="margin: 3px 0 0 0; font-size: 0.82rem; color: #cbd5e1; line-height: 1.3;">${descSegura}</p>
                    </div>

                    <div style="text-align: right; flex-shrink: 0;">
                        <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">OM SAP</span>
                        <strong style="color: #38bdf8; font-family: monospace; font-size: 0.95rem;">${ordenSegura}</strong>
                    </div>
                </header>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${colorBorde}; display: inline-block;" aria-hidden="true"></span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${textoSev}</span>
                        ${existeEnCatastro ? `
                            <button type="button" class="btn-ver-expediente-terreno" data-target="${escaparHTML(tagKey)}" aria-label="Abrir expediente de ${tagSeguro}" style="background: transparent; border: none; color: #38bdf8; cursor: pointer; font-size: 0.75rem; font-weight: 700; text-decoration: underline; margin-left: 6px;">Ver Expediente ↗</button>
                        ` : ''}
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <select class="select-estado-terreno" data-key="${idKeySegura}" aria-label="Estado de ejecución de ${ordenSegura}" style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; outline: none; cursor: pointer; font-weight: 600;">
                            <option value="PENDIENTE" ${est === 'PENDIENTE' ? 'selected' : ''}>⏳ Pendiente</option>
                            <option value="EJECUTADO" ${est === 'EJECUTADO' ? 'selected' : ''}>✅ Ejecutado</option>
                            <option value="DETENIDO_OPS" ${est === 'DETENIDO_OPS' ? 'selected' : ''}>🛑 Detenido Ops</option>
                            <option value="SIN_ACCESO" ${est === 'SIN_ACCESO' ? 'selected' : ''}>🚧 Sin Acceso</option>
                            <option value="REPROGRAMADO" ${est === 'REPROGRAMADO' ? 'selected' : ''}>📅 Reprogramado</option>
                        </select>
                    </div>
                </div>

                <!-- ASISTENTE VISUAL TÁCTIL DE SÍNTOMAS -->
                <div style="background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 6px; font-weight: 700;">Asistente Táctil de Síntomas:</span>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px;">
                        <button type="button" class="btn-sintoma-tactil" data-key="${idKeySegura}" data-texto="Fuga de aceite visible en sellos o descansos." style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700; text-align: center;">
                            🛢️ Fuga de Aceite
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${idKeySegura}" data-texto="Vibración anómala o armónicos elevados detectados." style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700; text-align: center;">
                            🔊 Vibración Alta
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${idKeySegura}" data-texto="Elevación de temperatura anormal por fricción o falta de lubricación." style="background: rgba(249, 115, 22, 0.12); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700; text-align: center;">
                            🌡️ Temp. Elevada
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${idKeySegura}" data-texto="Holgura mecánica o desgaste avanzado en componentes." style="background: rgba(168, 85, 247, 0.12); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700; text-align: center;">
                            ⚙️ Holgura / Desgaste
                        </button>
                    </div>
                </div>

                <div>
                    <input type="text" 
                           class="input-obs-terreno" 
                           data-key="${idKeySegura}" 
                           value="${obsSegura}" 
                           placeholder="Escribir motivo o nota de terreno..." 
                           aria-label="Observaciones de terreno para ${tagSeguro}"
                           style="background: rgba(0,0,0,0.25); color: white; border: 1px solid var(--border-glass); padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; width: 100%; outline: none; box-sizing: border-box;">
                </div>
            </article>
        `;
    }).join('');
}

// ----------------------------------------------------------------------------
// DELEGACIÓN CENTRAL DE EVENTOS (SIN DUPLICACIÓN DE LISTENERS)
// ----------------------------------------------------------------------------
function configurarDelegacionTerreno(contenedor, semanaActiva, contenedorId) {
    const contenedorCards = contenedor.querySelector('#contenedor-cards-terreno');
    if (!contenedorCards || contenedorCards.dataset.delegacionIniciada) return;

    // 1. Delegación de cambio de estado
    contenedorCards.addEventListener('change', async (e) => {
        const select = e.target.closest('.select-estado-terreno');
        if (!select) return;

        const card = select.closest('.card-orden-terreno');
        if (!card) return;

        const ordenKey = card.getAttribute('data-key');
        const nuevoEstado = select.value;
        const nuevaObs = card.querySelector('.input-obs-terreno')?.value.trim() || '';

        try {
            await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                estadoEjecucion: nuevoEstado,
                observacionAuditor: nuevaObs,
                ultimaActualizacion: new Date().toISOString()
            });
            mostrarToastSeguro("💾 Lectura de terreno guardada.", "exito");
        } catch (err) {
            console.error("Error guardando en terreno:", err);
            mostrarToastSeguro("Error al sincronizar con Firebase.", "error");
        }
    });

    // 2. Delegación de pérdida de foco en observaciones
    contenedorCards.addEventListener('focusout', async (e) => {
        const input = e.target.closest('.input-obs-terreno');
        if (!input) return;

        const card = input.closest('.card-orden-terreno');
        if (!card) return;

        const ordenKey = card.getAttribute('data-key');
        const nuevaObs = input.value.trim();

        try {
            await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                observacionAuditor: nuevaObs,
                ultimaActualizacion: new Date().toISOString()
            });
        } catch (err) {
            console.error("Error guardando observación:", err);
        }
    });

    // 3. Delegación de botones táctiles y expedientes
    contenedorCards.addEventListener('click', async (e) => {
        // Clic en síntoma táctil
        const btnSintoma = e.target.closest('.btn-sintoma-tactil');
        if (btnSintoma) {
            const card = btnSintoma.closest('.card-orden-terreno');
            if (!card) return;

            const ordenKey = card.getAttribute('data-key');
            const textoSintoma = btnSintoma.getAttribute('data-texto') || '';
            const inputObs = card.querySelector('.input-obs-terreno');
            const selectEstado = card.querySelector('.select-estado-terreno');

            if (inputObs) inputObs.value = textoSintoma;
            if (selectEstado) selectEstado.value = 'EJECUTADO';

            try {
                await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                    estadoEjecucion: 'EJECUTADO',
                    observacionAuditor: textoSintoma,
                    ultimaActualizacion: new Date().toISOString()
                });
                mostrarToastSeguro("⚡ Síntoma registrado y marcado como ejecutado.", "exito");
            } catch (err) {
                console.error("Error en síntoma táctil:", err);
            }
            return;
        }

        // Clic en ver expediente
        const btnExpediente = e.target.closest('.btn-ver-expediente-terreno');
        if (btnExpediente) {
            const idFirebase = btnExpediente.getAttribute('data-target');
            if (idFirebase) {
                renderizarExpediente(idFirebase, contenedorId);
            }
        }
    });

    contenedorCards.dataset.delegacionIniciada = 'true';
}