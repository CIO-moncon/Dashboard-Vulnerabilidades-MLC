// ============================================================================
// MÓDULO UI: JS/UI/EXPEDIENTE.JS
// CIO PREDICTIVO 2.0 — Secuencia Cinemática, Reactividad y Reporte Diario SAP
// Con Visor Interno Interactivo (Iframe Preview + Descarga)
// ============================================================================

import { auth, db } from '../core/firebase-config.js';
import { abrirGraficoTendencia, abrirModalAnalisisExperto } from './analisis.js';
import {
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    resolverPaletaSeveridadISO,
    obtenerSemanaISO,
    formatearFechaNomenclatura,
    abrirVisorPDFInterno
} from '../core/pdf-plantilla.js';

window.abrirGraficoTendencia = abrirGraficoTendencia;
window.abrirModalAnalisisExperto = abrirModalAnalisisExperto;

let equipoActual = null;
let idEquipoActual = null;

// ----------------------------------------------------------------------------
// INYECCIÓN DE ESTILOS DE SEVERIDAD REACTIVOS (!IMPORTANT)
// ----------------------------------------------------------------------------
const inyectarEstilosSeveridad = () => {
    if (document.getElementById('cbm-estilos-dinamicos-severidad')) return;
    const style = document.createElement('style');
    style.id = 'cbm-estilos-dinamicos-severidad';
    style.innerHTML = `
        .cbm-input-optima {
            background-color: rgba(0, 230, 118, 0.28) !important;
            border: 2px solid #00e676 !important;
            color: #00e676 !important;
            box-shadow: 0 0 10px rgba(0, 230, 118, 0.45) !important;
            font-weight: 800 !important;
        }
        .cbm-input-seguimiento {
            background-color: rgba(234, 179, 8, 0.32) !important;
            border: 2px solid #eab308 !important;
            color: #facc15 !important;
            box-shadow: 0 0 10px rgba(234, 179, 8, 0.45) !important;
            font-weight: 800 !important;
        }
        .cbm-input-alerta {
            background-color: rgba(249, 115, 22, 0.35) !important;
            border: 2px solid #f97316 !important;
            color: #fb923c !important;
            box-shadow: 0 0 10px rgba(249, 115, 22, 0.45) !important;
            font-weight: 800 !important;
        }
        .cbm-input-critica {
            background-color: rgba(239, 68, 68, 0.38) !important;
            border: 2px solid #ef4444 !important;
            color: #f87171 !important;
            box-shadow: 0 0 12px rgba(239, 68, 68, 0.55) !important;
            font-weight: 800 !important;
        }
    `;
    document.head.appendChild(style);
};
inyectarEstilosSeveridad();

// ----------------------------------------------------------------------------
// ALGORITMO CINEMÁTICO REAL: M -> A -> G -> E -> PL -> CH -> T
// ----------------------------------------------------------------------------
const clasificarPuntoCinematico = (puntoRaw = '') => {
    const p = String(puntoRaw || '').toUpperCase().trim();
    const match = p.match(/^([A-Z]+)(\d+)?(?:[_\-\s]?([A-Z0-9]+))?$/i);

    const prefijo = match && match[1] ? match[1].toUpperCase() : p;
    const num = match && match[2] ? parseInt(match[2], 10) : 0;
    const sufijo = match && match[3] ? match[3].toUpperCase() : '';

    let peso = 99;
    if (prefijo === 'M' || prefijo === 'MOT') peso = 10;
    else if (prefijo === 'A' || prefijo === 'ACOP') peso = 20;
    else if (prefijo === 'G' || prefijo === 'R' || prefijo === 'RED') peso = 30;
    else if (prefijo === 'E' || prefijo === 'EJE') peso = 40;
    else if (prefijo === 'PL' || prefijo === 'P' || prefijo === 'POL') peso = 50;
    else if (prefijo === 'CH' || prefijo === 'CHUM' || prefijo === 'D' || prefijo === 'C') peso = 60;
    else if (prefijo === 'T' || prefijo === 'TAM' || prefijo === 'B') peso = 70;

    let pesoSufijo = 50;
    if (sufijo.includes('LD') || sufijo.includes('DE') || sufijo.includes('CARGA')) pesoSufijo = 10;
    if (sufijo.includes('LI') || sufijo.includes('NDE') || sufijo.includes('LIBRE')) pesoSufijo = 20;

    return { punto: p, peso, num, pesoSufijo, sufijo };
};

const ordenarPuntosCinematicos = (a, b) => {
    const infoA = clasificarPuntoCinematico(a.punto || a.id);
    const infoB = clasificarPuntoCinematico(b.punto || b.id);
    if (infoA.peso !== infoB.peso) return infoA.peso - infoB.peso;
    if (infoA.num !== infoB.num) return infoA.num - infoB.num;
    if (infoA.pesoSufijo !== infoB.pesoSufijo) return infoA.pesoSufijo - infoB.pesoSufijo;
    return infoA.sufijo.localeCompare(infoB.sufijo);
};

const deducirNombreComponente = (puntoStr, nombreOriginal) => {
    if (nombreOriginal && nombreOriginal !== 'Componente' && nombreOriginal.trim() !== '') {
        return nombreOriginal;
    }
    const p = String(puntoStr || '').toUpperCase();
    if (p === 'M1') return 'Motor NDE (Lado Libre)';
    if (p === 'M2') return 'Motor DE (Lado Acople)';
    if (p.startsWith('G')) {
        const num = p.replace(/\D/g, '');
        return `Reductor Etapa ${num || 'Principal'}`;
    }
    if (p.startsWith('PL')) {
        const lado = p.includes('LD') ? 'Lado Derecho' : (p.includes('LI') ? 'Lado Izquierdo' : '');
        return `Polea de Transmisión ${lado}`;
    }
    if (p.startsWith('CH')) return 'Chumacera / Descanso';
    return nombreOriginal || 'Punto de Medición';
};

const esMismoDia = (fechaStr, fechaRef = new Date()) => {
    if (!fechaStr || typeof fechaStr !== 'string') return false;
    const str = fechaStr.trim();
    if (str === '' || str.toLowerCase().includes('sin fecha')) return false;

    const dRef = fechaRef.getDate();
    const mRef = fechaRef.getMonth() + 1;
    const yRef = fechaRef.getFullYear();

    const matchDMY = str.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    if (matchDMY) {
        return parseInt(matchDMY[1], 10) === dRef &&
               parseInt(matchDMY[2], 10) === mRef &&
               parseInt(matchDMY[3], 10) === yRef;
    }

    const matchYMD = str.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
    if (matchYMD) {
        return parseInt(matchYMD[1], 10) === yRef &&
               parseInt(matchYMD[2], 10) === mRef &&
               parseInt(matchYMD[3], 10) === dRef;
    }

    const dStr = String(dRef).padStart(2, '0');
    const mStr = String(mRef).padStart(2, '0');
    return str.includes(`${dStr}-${mStr}-${yRef}`) || 
           str.includes(`${dStr}/${mStr}/${yRef}`) || 
           str.includes(`${yRef}-${mStr}-${dStr}`);
};

// ----------------------------------------------------------------------------
// EVALUACIÓN NORMATIVA Y ESTILOS DINÁMICOS EN VIVO
// ----------------------------------------------------------------------------
window.evaluarInputEnVivo = (inputEl, tipo) => {
    if (!inputEl) return;
    const v = parseFloat(inputEl.value);

    inputEl.classList.remove('cbm-input-optima', 'cbm-input-seguimiento', 'cbm-input-alerta', 'cbm-input-critica');

    if (isNaN(v) || inputEl.value.trim() === '') {
        inputEl.style.removeProperty('background-color');
        inputEl.style.removeProperty('border-color');
        inputEl.style.removeProperty('color');
        inputEl.style.removeProperty('box-shadow');
        inputEl.style.removeProperty('font-weight');
        return;
    }

    let clase = 'cbm-input-optima';
    let bg = 'rgba(0, 230, 118, 0.28)';
    let border = '#00e676';
    let color = '#00e676';
    let shadow = '0 0 10px rgba(0, 230, 118, 0.45)';

    if (tipo === 'rms') {
        if (v >= 7.1) {
            clase = 'cbm-input-critica';
            bg = 'rgba(239, 68, 68, 0.38)';
            border = '#ef4444';
            color = '#f87171';
            shadow = '0 0 12px rgba(239, 68, 68, 0.55)';
        } else if (v >= 4.5) {
            clase = 'cbm-input-alerta';
            bg = 'rgba(249, 115, 22, 0.35)';
            border = '#f97316';
            color = '#fb923c';
            shadow = '0 0 10px rgba(249, 115, 22, 0.45)';
        } else if (v >= 2.8) {
            clase = 'cbm-input-seguimiento';
            bg = 'rgba(234, 179, 8, 0.32)';
            border = '#eab308';
            color = '#facc15';
            shadow = '0 0 10px rgba(234, 179, 8, 0.45)';
        }
    } else if (tipo === 'temp') {
        if (v >= 80.0) {
            clase = 'cbm-input-critica';
            bg = 'rgba(239, 68, 68, 0.38)';
            border = '#ef4444';
            color = '#f87171';
            shadow = '0 0 12px rgba(239, 68, 68, 0.55)';
        } else if (v >= 65.0) {
            clase = 'cbm-input-alerta';
            bg = 'rgba(249, 115, 22, 0.35)';
            border = '#f97316';
            color = '#fb923c';
            shadow = '0 0 10px rgba(249, 115, 22, 0.45)';
        } else if (v >= 55.0) {
            clase = 'cbm-input-seguimiento';
            bg = 'rgba(234, 179, 8, 0.32)';
            border = '#eab308';
            color = '#facc15';
            shadow = '0 0 10px rgba(234, 179, 8, 0.45)';
        }
    } else if (tipo === 'fc') {
        if (v >= 5.0) {
            clase = 'cbm-input-critica';
            bg = 'rgba(239, 68, 68, 0.38)';
            border = '#ef4444';
            color = '#f87171';
            shadow = '0 0 12px rgba(239, 68, 68, 0.55)';
        } else if (v >= 3.5) {
            clase = 'cbm-input-alerta';
            bg = 'rgba(249, 115, 22, 0.35)';
            border = '#f97316';
            color = '#fb923c';
            shadow = '0 0 10px rgba(249, 115, 22, 0.45)';
        } else if (v >= 2.5) {
            clase = 'cbm-input-seguimiento';
            bg = 'rgba(234, 179, 8, 0.32)';
            border = '#eab308';
            color = '#facc15';
            shadow = '0 0 10px rgba(234, 179, 8, 0.45)';
        }
    }

    inputEl.classList.add(clase);
    inputEl.style.setProperty('background-color', bg, 'important');
    inputEl.style.setProperty('border-color', border, 'important');
    inputEl.style.setProperty('color', color, 'important');
    inputEl.style.setProperty('box-shadow', shadow, 'important');
    inputEl.style.setProperty('font-weight', '800', 'important');
};

const resolverColorTexto = (tipo, valor) => {
    const v = parseFloat(valor);
    if (isNaN(v) || v <= 0) return '#94a3b8';
    if (tipo === 'rms') {
        if (v >= 7.1) return '#f87171';
        if (v >= 4.5) return '#fb923c';
        if (v >= 2.8) return '#facc15';
        return '#00e676';
    }
    if (tipo === 'temp') {
        if (v >= 80) return '#f87171';
        if (v >= 65) return '#fb923c';
        if (v >= 55) return '#facc15';
        return '#00e676';
    }
    if (tipo === 'fc') {
        if (v >= 5.0) return '#f87171';
        if (v >= 3.5) return '#fb923c';
        if (v >= 2.5) return '#facc15';
        return '#00e676';
    }
    return '#94a3b8';
};

// ----------------------------------------------------------------------------
// RENDERIZADO DEL EXPEDIENTE TÉCNICO
// ----------------------------------------------------------------------------
export const renderizarExpediente = async (idFirebase, idContenedor = 'espacio-trabajo-dinamico') => {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    idEquipoActual = idFirebase;

    if (window.datosGlobalesEquipos && window.datosGlobalesEquipos[idFirebase]) {
        equipoActual = window.datosGlobalesEquipos[idFirebase];
    } else {
        const snap = await db.ref(`activos_criticos/${idFirebase}`).once('value');
        equipoActual = snap.val() || {};
    }

    const tag = equipoActual.tag || idFirebase;
    const nombre = equipoActual.nombre || 'Activo Crítico de Planta';
    const area = equipoActual.area || 'General';
    const nivel = equipoActual.nivel || 'Nivel 1';

    let rawSpots = equipoActual.spots || equipoActual.components || [];
    let spotsArray = [];

    if (Array.isArray(rawSpots)) {
        spotsArray = rawSpots.map((s, idx) => ({
            id: s.punto || s.tag || `P${idx + 1}`,
            punto: s.punto || s.tag || `P${idx + 1}`,
            componente: deducirNombreComponente(s.punto || s.tag, s.componente || s.name || s.nombre),
            rms: s.rms || s.vibracion || '',
            temp: s.temp || s.temperatura || '',
            fc: s.fc || s.factor_cresta || '',
            fecha: s.fecha || ''
        }));
    } else if (typeof rawSpots === 'object' && rawSpots !== null) {
        spotsArray = Object.entries(rawSpots).map(([key, val]) => ({
            id: key,
            punto: val.punto || val.tag || key,
            componente: deducirNombreComponente(val.punto || val.tag || key, val.componente || val.name || val.nombre),
            rms: val.rms || val.vibracion || '',
            temp: val.temp || val.temperatura || '',
            fc: val.fc || val.factor_cresta || '',
            fecha: val.fecha || ''
        }));
    }

    const mapaUnico = new Map();
    spotsArray.forEach((s) => {
        const k = String(s.punto || s.id).toUpperCase().trim();
        if (!mapaUnico.has(k)) {
            mapaUnico.set(k, s);
        } else {
            const ext = mapaUnico.get(k);
            if ((parseFloat(s.rms) || 0) >= (parseFloat(ext.rms) || 0)) {
                mapaUnico.set(k, s);
            }
        }
    });

    const spotsLimpios = Array.from(mapaUnico.values());
    spotsLimpios.sort(ordenarPuntosCinematicos);

    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const fechaHoraLocal = new Date(Date.now() - tzOffset).toISOString().slice(0, 16);

    contenedor.innerHTML = `
        <article class="panel-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.25s ease;">
            
            <header style="background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #38bdf8;">
                        <span class="material-symbols-outlined" style="font-size: 1.6rem;" aria-hidden="true">precision_manufacturing</span>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h2 style="margin: 0; color: #ffffff; font-size: 1.25rem; font-weight: 800; font-family: monospace;">
                                Inspección CBM: ${tag}
                            </h2>
                            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">
                                ${nivel}
                            </span>
                        </div>
                        <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: var(--text-muted, #94a3b8);">
                            ${nombre} | <span style="color: #38bdf8; font-weight: 600;">${area}</span>
                        </p>
                    </div>
                </div>

                <nav aria-label="Acciones del activo" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <button type="button" onclick="window.ubicarEnMapaDesdeAlerta('${tag}')" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">my_location</span>
                        <span>Ver en Mapa 3D</span>
                    </button>

                    <button type="button" onclick="window.abrirModalAnalisisExperto('${idFirebase}')" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">psychology</span>
                        <span>Análisis Experto</span>
                    </button>

                    <button type="button" onclick="window.abrirModalConfigurarMaquina('${idFirebase}')" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid var(--border-glass, rgba(255,255,255,0.15)); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">settings</span>
                        <span>Configurar Máquina</span>
                    </button>

                    <button type="button" onclick="window.descargarPDFEquipo('${idFirebase}')" title="Vista Previa y Resumen CBM para SAP PM" style="background: rgba(0, 230, 118, 0.18); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.45); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">visibility</span>
                        <span>PDF Diario</span>
                    </button>

                    <button type="button" id="btn-cerrar-expediente" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid var(--border-glass, rgba(255,255,255,0.15)); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">close</span>
                    </button>
                </nav>
            </header>

            <section style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">speed</span>
                        <h3 style="margin: 0; font-size: 1.05rem; color: #ffffff; font-weight: 800;">
                            Ingreso de Ruta de Terreno (Secuencia Cinemática)
                        </h3>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label for="fecha-ruta-terreno" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Fecha y Hora:</label>
                        <input type="datetime-local" id="fecha-ruta-terreno" value="${fechaHoraLocal}" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; outline: none; font-family: monospace;">
                    </div>
                </div>

                <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.4); color: var(--text-muted, #94a3b8); border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="padding: 12px 10px; min-width: 65px;">Punto</th>
                                <th style="padding: 12px 10px; min-width: 210px;">Componente Cinemático</th>
                                <th style="padding: 12px 10px; text-align: center; min-width: 70px;">Gráfico</th>
                                <th style="padding: 12px 10px; min-width: 160px;">Lectura Anterior</th>
                                <th style="padding: 12px 10px; min-width: 110px;">RMS (mm/s)</th>
                                <th style="padding: 12px 10px; min-width: 110px;">Temp (°C)</th>
                                <th style="padding: 12px 10px; min-width: 110px;">FC+</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-spots-body">
                            ${spotsLimpios.map((s) => {
                                const puntoId = s.punto || s.id;
                                const compName = s.componente || 'Punto';
                                const colorRms = resolverColorTexto('rms', s.rms);
                                const colorTemp = resolverColorTexto('temp', s.temp);
                                const colorFc = resolverColorTexto('fc', s.fc);

                                return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                                        <td style="padding: 10px; font-weight: 800; font-family: monospace; color: #ffffff;">${puntoId}</td>
                                        <td style="padding: 10px; color: #cbd5e1; font-weight: 600;">${compName}</td>
                                        
                                        <td style="padding: 10px; text-align: center;">
                                            <button type="button" 
                                                    onclick="window.abrirGraficoTendencia('${idFirebase}', '${puntoId}', '${compName}')"
                                                    title="Ver tendencia histórica de ${puntoId}"
                                                    style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease;">
                                                <span class="material-symbols-outlined" style="font-size: 1.25rem;" aria-hidden="true">query_stats</span>
                                            </button>
                                        </td>

                                        <td style="padding: 10px;">
                                            <div style="font-weight: 700; color: ${colorRms}; font-family: monospace;">
                                                ${s.rms ? `${parseFloat(s.rms).toFixed(2)} mm/s` : '---'}
                                            </div>
                                            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;">
                                                <span style="color: ${colorTemp}; font-weight: 600;">${s.temp ? `${s.temp} °C` : '--'}</span> | 
                                                <span style="color: ${colorFc}; font-weight: 600;">FC+ ${s.fc || '--'}</span>
                                            </div>
                                            <div style="font-size: 0.68rem; color: #64748b; font-family: monospace;">
                                                ${s.fecha || 'Sin fecha previa'}
                                            </div>
                                        </td>

                                        <td style="padding: 10px;">
                                            <input type="number" 
                                                   step="0.01" 
                                                   class="input-cbm-punto" 
                                                   data-punto="${puntoId}" 
                                                   data-componente="${compName}"
                                                   data-tipo="rms" 
                                                   placeholder="RMS"
                                                   oninput="window.evaluarInputEnVivo(this, 'rms')"
                                                   onchange="window.evaluarInputEnVivo(this, 'rms')"
                                                   style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box; transition: all 0.18s ease;">
                                        </td>

                                        <td style="padding: 10px;">
                                            <input type="number" 
                                                   step="0.1" 
                                                   class="input-cbm-punto" 
                                                   data-punto="${puntoId}" 
                                                   data-componente="${compName}"
                                                   data-tipo="temp" 
                                                   placeholder="°C"
                                                   oninput="window.evaluarInputEnVivo(this, 'temp')"
                                                   onchange="window.evaluarInputEnVivo(this, 'temp')"
                                                   style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box; transition: all 0.18s ease;">
                                        </td>

                                        <td style="padding: 10px;">
                                            <input type="number" 
                                                   step="0.01" 
                                                   class="input-cbm-punto" 
                                                   data-punto="${puntoId}" 
                                                   data-componente="${compName}"
                                                   data-tipo="fc" 
                                                   placeholder="FC+"
                                                   oninput="window.evaluarInputEnVivo(this, 'fc')"
                                                   onchange="window.evaluarInputEnVivo(this, 'fc')"
                                                   style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box; transition: all 0.18s ease;">
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
                    <button type="button" 
                            id="btn-guardar-ruta-cbm"
                            onclick="window.guardarMedicionesRuta('${idFirebase}')" 
                            style="background: #0284c7; color: white; border: none; padding: 11px 20px; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4); transition: transform 0.15s ease;">
                        <span class="material-symbols-outlined" aria-hidden="true">save</span>
                        <span>Guardar Mediciones de Ruta</span>
                    </button>
                </div>
            </section>
        </article>
    `;

    const tbody = document.getElementById('tabla-spots-body');
    if (tbody) {
        tbody.addEventListener('input', (e) => {
            const inp = e.target.closest('.input-cbm-punto');
            if (inp) window.evaluarInputEnVivo(inp, inp.getAttribute('data-tipo'));
        });
    }
};

// ----------------------------------------------------------------------------
// GUARDADO INMUTABLE Y DISPARO DE INFORME ESPECTRAL EN FIREBASE
// ----------------------------------------------------------------------------
window.guardarMedicionesRuta = async (idFirebase) => {
    const btn = document.getElementById('btn-guardar-ruta-cbm');
    const inputFecha = document.getElementById('fecha-ruta-terreno');
    const fechaHora = inputFecha?.value ? new Date(inputFecha.value).toLocaleString() : new Date().toLocaleString();

    const inputs = document.querySelectorAll('.input-cbm-punto');
    const medicionesPorPunto = {};

    inputs.forEach((inp) => {
        const punto = inp.getAttribute('data-punto');
        const componente = inp.getAttribute('data-componente') || punto;
        const tipo = inp.getAttribute('data-tipo');
        const val = inp.value.trim();

        if (val) {
            if (!medicionesPorPunto[punto]) {
                medicionesPorPunto[punto] = { punto, componente };
            }
            medicionesPorPunto[punto][tipo] = val;
        }
    });

    const puntosConDatos = Object.keys(medicionesPorPunto);
    if (puntosConDatos.length === 0) {
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Debe ingresar al menos una medición para registrar la ruta.', 'alerta');
        } else {
            alert('Debe ingresar al menos una medición para registrar la ruta.');
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Guardando...`;
    }

    try {
        const eq = (window.datosGlobalesEquipos && window.datosGlobalesEquipos[idFirebase]) || equipoActual || {};
        const tagLimpio = String(eq.tag || idFirebase || 'MH').trim().toUpperCase();

        let peorSeveridad = 'Verde';
        const updatesActivo = {};
        const idHistorial = db.ref(`activos_criticos/${idFirebase}/historial_mediciones`).push().key;

        for (const [pto, valores] of Object.entries(medicionesPorPunto)) {
            const rms = parseFloat(valores.rms || 0);
            const temp = parseFloat(valores.temp || 0);
            const fc = parseFloat(valores.fc || 0);

            if (rms >= 7.1 || temp >= 80 || fc >= 5.0) {
                peorSeveridad = 'Rojo';
            } else if ((rms >= 4.5 || temp >= 65 || fc >= 3.0) && peorSeveridad !== 'Rojo') {
                peorSeveridad = 'Naranja';
            } else if (rms >= 2.8 && peorSeveridad === 'Verde') {
                peorSeveridad = 'Amarillo';
            }

            if (valores.rms) updatesActivo[`spots/${pto}/rms`] = valores.rms;
            if (valores.temp) updatesActivo[`spots/${pto}/temp`] = valores.temp;
            if (valores.fc) updatesActivo[`spots/${pto}/fc`] = valores.fc;
            updatesActivo[`spots/${pto}/fecha`] = fechaHora;
            updatesActivo[`spots/${pto}/componente`] = valores.componente;
        }

        updatesActivo[`severidad`] = peorSeveridad;
        updatesActivo[`ultimaInspeccion`] = fechaHora;

        updatesActivo[`historial_mediciones/${idHistorial}`] = {
            id: idHistorial,
            timestamp: Date.now(),
            fecha: fechaHora,
            usuario: auth.currentUser?.email || 'Inspector Terreno',
            severidadGlobal: peorSeveridad,
            puntos: medicionesPorPunto
        };

        await db.ref(`activos_criticos/${idFirebase}`).update(updatesActivo);

        // Disparo automático de informe espectral si hay punto crítico en motor o reductor
        try {
            const fechaCorta = fechaHora.split(' ')[0] || new Date().toLocaleDateString();
            const numSemana = String(obtenerSemanaISO(new Date())).padStart(2, '0');
            const semanaKey = `S${numSemana}`;
            const updatesEspectrales = {};
            let hayEspectralCritico = false;

            for (const [pto, valores] of Object.entries(medicionesPorPunto)) {
                const rms = parseFloat(valores.rms || 0);
                const ptoUpper = String(pto).toUpperCase();
                const esMotorOReductor = ptoUpper.startsWith('M') || ptoUpper.startsWith('G') || ptoUpper.startsWith('R');

                if (esMotorOReductor && rms >= 7.1) {
                    const fechaSanitizada = fechaCorta.replace(/[\/\-:\s\.]/g, '_');
                    const idEspectral = `ESP_${tagLimpio}_${ptoUpper}_${fechaSanitizada}`;

                    updatesEspectrales[idEspectral] = {
                        id: idEspectral,
                        tag: tagLimpio,
                        equipoId: idFirebase,
                        nombreEquipo: eq.nombre || tagLimpio,
                        area: eq.area || 'General',
                        punto: ptoUpper,
                        componente: valores.componente || ptoUpper,
                        rms: rms,
                        temp: parseFloat(valores.temp || 0),
                        fc: parseFloat(valores.fc || 0),
                        fechaDeteccion: fechaHora,
                        fechaCorta: fechaCorta,
                        semana: semanaKey,
                        estado: 'Pendiente',
                        avisoSap: '',
                        usuarioDetector: auth.currentUser?.email || 'Inspector Terreno',
                        timestamp: Date.now()
                    };
                    hayEspectralCritico = true;
                }
            }

            if (hayEspectralCritico) {
                await db.ref(`control_informes_espectrales/${semanaKey}`).update(updatesEspectrales);
            }
        } catch (errEspectral) {
            console.warn('[Expediente] Alerta espectral no registrada:', errEspectral);
        }

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast(`✅ Mediciones e historial guardados. Condición: ${peorSeveridad}`, 'exito');
        }

        renderizarExpediente(idFirebase);
    } catch (err) {
        console.error('[Expediente] Error guardando historial:', err);
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Error de conexión al guardar el historial en Firebase.', 'error');
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined">save</span> Guardar Mediciones de Ruta`;
        }
    }
};

// ----------------------------------------------------------------------------
// GENERADOR DE PDF DIARIO CON VISOR INTERNO INTERACTIVO
// Nomenclatura: TAG_Sxx_(dd-mm-aaaa)_resumen.pdf
// ----------------------------------------------------------------------------
window.descargarPDFEquipo = async (idFirebase) => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert('Cargando librería de reportes PDF. Intente nuevamente en unos instantes.');
        return;
    }

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast('Generando vista previa del reporte diario para SAP...', 'info');
    }

    let eq = (window.datosGlobalesEquipos && window.datosGlobalesEquipos[idFirebase]) || {};
    if (!eq.tag) {
        const snap = await db.ref(`activos_criticos/${idFirebase}`).once('value');
        eq = snap.val() || {};
    }

    const tagRaw = eq.tag || idFirebase || 'MHPrueba';
    const tagLimpio = String(tagRaw).trim();
    const nombreEquipo = eq.nombre || 'Activo Crítico de Planta';
    const area = eq.area || 'General';
    const nivel = eq.nivel || 'Nivel 1';

    const fechaActual = new Date();
    const numSemana = String(obtenerSemanaISO(fechaActual)).padStart(2, '0');
    const fechaImpresion = formatearFechaNomenclatura(fechaActual);

    let rawSpots = eq.spots || eq.components || {};
    let spotsArray = [];

    if (Array.isArray(rawSpots)) {
        spotsArray = rawSpots.map((s, idx) => ({
            punto: s.punto || s.tag || `P${idx + 1}`,
            componente: deducirNombreComponente(s.punto || s.tag, s.componente || s.name || s.nombre),
            rms: s.rms || '',
            temp: s.temp || '',
            fc: s.fc || '',
            fecha: s.fecha || ''
        }));
    } else if (typeof rawSpots === 'object' && rawSpots !== null) {
        spotsArray = Object.entries(rawSpots).map(([key, val]) => ({
            punto: val.punto || val.tag || key,
            componente: deducirNombreComponente(val.punto || val.tag || key, val.componente || val.name || val.nombre),
            rms: val.rms || '',
            temp: val.temp || '',
            fc: val.fc || '',
            fecha: val.fecha || ''
        }));
    }

    // Filtrar estrictamente solo las mediciones del día de la impresión
    const mapaPuntosDelDia = new Map();

    spotsArray.forEach((s) => {
        const k = String(s.punto).toUpperCase().trim();
        const vRms = parseFloat(s.rms);
        const vTemp = parseFloat(s.temp);
        const vFc = parseFloat(s.fc);
        const tieneDatos = (!isNaN(vRms) && vRms > 0) || (!isNaN(vTemp) && vTemp > 0) || (!isNaN(vFc) && vFc > 0);

        if (tieneDatos && esMismoDia(s.fecha, fechaActual)) {
            mapaPuntosDelDia.set(k, s);
        }
    });

    const tbody = document.getElementById('tabla-spots-body');
    if (tbody) {
        const filas = tbody.querySelectorAll('tr');
        filas.forEach((fila) => {
            const inpRms = fila.querySelector('input[data-tipo="rms"]');
            const inpTemp = fila.querySelector('input[data-tipo="temp"]');
            const inpFc = fila.querySelector('input[data-tipo="fc"]');
            const punto = inpRms?.getAttribute('data-punto');
            const componente = inpRms?.getAttribute('data-componente');

            const valRms = inpRms ? inpRms.value.trim() : '';
            const valTemp = inpTemp ? inpTemp.value.trim() : '';
            const valFc = inpFc ? inpFc.value.trim() : '';

            const vRms = parseFloat(valRms);
            const vTemp = parseFloat(valTemp);
            const vFc = parseFloat(valFc);
            const tieneDatosLive = (!isNaN(vRms) && vRms > 0) || (!isNaN(vTemp) && vTemp > 0) || (!isNaN(vFc) && vFc > 0);

            if (tieneDatosLive && punto) {
                const k = punto.toUpperCase().trim();
                mapaPuntosDelDia.set(k, {
                    punto: k,
                    componente: componente || k,
                    rms: valRms,
                    temp: valTemp,
                    fc: valFc,
                    fecha: fechaImpresion
                });
            }
        });
    }

    const spotsValidos = Array.from(mapaPuntosDelDia.values());
    spotsValidos.sort(ordenarPuntosCinematicos);

    // Calcular severidad global de la jornada
    let sevGlobal = 'VERDE';
    if (spotsValidos.length === 0) {
        sevGlobal = 'SIN_DATOS';
    } else {
        spotsValidos.forEach((s) => {
            const r = parseFloat(s.rms) || 0;
            const t = parseFloat(s.temp) || 0;
            const fc = parseFloat(s.fc) || 0;
            if (r >= 7.1 || t >= 80 || fc >= 5.0) {
                sevGlobal = 'ROJO';
            } else if ((r >= 4.5 || t >= 65 || fc >= 3.5) && sevGlobal !== 'ROJO') {
                sevGlobal = 'NARANJA';
            } else if ((r >= 2.8 || t >= 55) && sevGlobal === 'VERDE') {
                sevGlobal = 'AMARILLO';
            }
        });
    }

    const tagArchivo = tagLimpio.replace(/\s+/g, '_');
    const nombreArchivoPDF = `${tagArchivo}_S${numSemana}_(${fechaImpresion})_resumen.pdf`;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margenX = 14;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);

    // 1. CABECERA CORPORATIVA CON SELLO EN LA ESQUINA SUPERIOR DERECHA
    await dibujarCabeceraCorporativa(doc, {
        titulo: 'REPORTE DIARIO DE CONDICIÓN MECÁNICA — CBM',
        subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
        referencia: `Documento Oficial de Respaldo SAP PM | Mediciones de la Jornada: ${fechaImpresion}`,
        severidad: sevGlobal,
        textoCondicion: 'CONDICIÓN DEL DÍA',
        margenX
    });

    // 2. FICHA TÉCNICA DEL ACTIVO (100% DESPEJADA)
    let posY = 34;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(margenX, posY, anchoContenido, 26, 2, 2, 'FD');

    // Columna 1 (Izquierda)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`TAG: ${tagLimpio.toUpperCase()}`, margenX + 5, posY + 7);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Denominación: ${nombreEquipo}`, margenX + 5, posY + 13);
    doc.text(`Área: ${area}   |   Cota/Nivel: ${nivel}`, margenX + 5, posY + 18);
    doc.text(`Fecha Inspección: ${fechaImpresion}`, margenX + 5, posY + 23);

    // Columna 2 (Derecha)
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`SEMANA SAP: S${numSemana} (PMS)`, margenX + 98, posY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha Emisión: ${fechaActual.toLocaleDateString('es-CL')} ${fechaActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margenX + 98, posY + 13);
    doc.text(`Puntos Evaluados Hoy: ${spotsValidos.length}`, margenX + 98, posY + 18);
    doc.text(`Responsable: ${auth.currentUser?.email || 'Inspector CBM'}`, margenX + 98, posY + 23);

    // 3. TABLA CINEMÁTICA CON COLORES
    posY += 33;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Lecturas Cinemáticas del Día (${fechaImpresion}) — Norma ISO 20816-3:`, margenX, posY);

    posY += 4;
    doc.setFillColor(30, 41, 59);
    doc.rect(margenX, posY, anchoContenido, 7, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('PTO', margenX + 3, posY + 5);
    doc.text('COMPONENTE CINEMÁTICO', margenX + 18, posY + 5);
    doc.text('RMS (mm/s)', margenX + 80, posY + 5);
    doc.text('TEMP (°C)', margenX + 108, posY + 5);
    doc.text('FC+', margenX + 132, posY + 5);
    doc.text('EVALUACIÓN ISO', margenX + 152, posY + 5);

    posY += 7;

    if (spotsValidos.length === 0) {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margenX, posY, anchoContenido, 12, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`No se registran mediciones ejecutadas en la fecha de hoy (${fechaImpresion}).`, margenX + 42, posY + 7.5);
        posY += 16;
    } else {
        spotsValidos.forEach((s, idx) => {
            const vRms = parseFloat(s.rms) || 0;
            const vTemp = parseFloat(s.temp) || 0;
            const vFc = parseFloat(s.fc) || 0;

            let sevPto = 'VERDE';
            if (vRms >= 7.1 || vTemp >= 80 || vFc >= 5.0) sevPto = 'ROJO';
            else if (vRms >= 4.5 || vTemp >= 65 || vFc >= 3.5) sevPto = 'NARANJA';
            else if (vRms >= 2.8 || vTemp >= 55 || vFc >= 2.5) sevPto = 'AMARILLO';

            const paletaPto = resolverPaletaSeveridadISO(sevPto);

            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margenX, posY, anchoContenido, 6.5, 'F');
            }

            doc.setDrawColor(241, 245, 249);
            doc.line(margenX, posY + 6.5, margenX + anchoContenido, posY + 6.5);

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(String(s.punto), margenX + 3, posY + 4.5);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text(String(s.componente).substring(0, 36), margenX + 18, posY + 4.5);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(vRms > 0 ? `${vRms.toFixed(2)}` : '--', margenX + 83, posY + 4.5);
            doc.text(vTemp > 0 ? `${vTemp.toFixed(1)}` : '--', margenX + 111, posY + 4.5);
            doc.text(vFc > 0 ? `${vFc.toFixed(2)}` : '--', margenX + 134, posY + 4.5);

            doc.setFillColor(...paletaPto.bg);
            doc.roundedRect(margenX + 150, posY + 1.2, 30, 4.3, 1, 1, 'F');
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...paletaPto.text);
            doc.text(paletaPto.estadoCorto, margenX + 152, posY + 4.2);

            posY += 6.5;

            if (posY > altoPagina - 55) {
                doc.addPage();
                posY = 25;
            }
        });
    }

    // 4. DIAGNÓSTICO OPERACIONAL DE LA JORNADA
    posY += 6;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Diagnóstico Operacional de la Jornada (SAP PM):', margenX, posY);

    posY += 3;

    const grupos = {
        'MOTOR ELÉCTRICO': [],
        'REDUCTOR DE VELOCIDAD': [],
        'POLEAS Y TRANSMISIÓN': [],
        'CHUMACERAS Y DESCANSOS': []
    };

    spotsValidos.forEach((s) => {
        const p = String(s.punto).toUpperCase();
        if (p.startsWith('M')) grupos['MOTOR ELÉCTRICO'].push(s);
        else if (p.startsWith('G') || p.startsWith('R')) grupos['REDUCTOR DE VELOCIDAD'].push(s);
        else if (p.startsWith('PL') || p.startsWith('P')) grupos['POLEAS Y TRANSMISIÓN'].push(s);
        else if (p.startsWith('CH') || p.startsWith('D')) grupos['CHUMACERAS Y DESCANSOS'].push(s);
    });

    const diagnosticos = [];
    let hayCriticoOAlerta = false;

    if (spotsValidos.length === 0) {
        diagnosticos.push({
            titulo: 'SIN MEDICIONES EN LA JORNADA',
            detalle: `No se ingresaron lecturas en la fecha de hoy (${fechaImpresion}). Este reporte refleja únicamente las actividades ejecutadas en la fecha de emisión del documento.`,
            color: [100, 116, 139]
        });
    } else {
        for (const [nombreGrupo, lista] of Object.entries(grupos)) {
            if (lista.length === 0) continue;

            let maxRms = 0;
            let maxTemp = 0;
            let ptoMaxRms = '';
            let estadoGrupo = 'Zona A';

            lista.forEach((s) => {
                const r = parseFloat(s.rms) || 0;
                const t = parseFloat(s.temp) || 0;
                const fc = parseFloat(s.fc) || 0;

                if (r > maxRms) {
                    maxRms = r;
                    ptoMaxRms = s.punto;
                }
                if (t > maxTemp) maxTemp = t;

                if (r >= 7.1 || t >= 80 || fc >= 5.0) {
                    estadoGrupo = 'Zona D';
                } else if ((r >= 4.5 || t >= 65 || fc >= 3.5) && estadoGrupo !== 'Zona D') {
                    estadoGrupo = 'Zona C';
                } else if ((r >= 2.8 || t >= 55) && estadoGrupo === 'Zona A') {
                    estadoGrupo = 'Zona B';
                }
            });

            if (nombreGrupo === 'MOTOR ELÉCTRICO') {
                if (estadoGrupo === 'Zona D') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN CRÍTICA (ZONA D)`,
                        detalle: `Presenta amplitudes de vibración severas de hasta ${maxRms.toFixed(2)} mm/s en ${ptoMaxRms} y temperatura de ${maxTemp.toFixed(1)} °C. Los detalles técnicos, espectros FFT y frecuencias de falla se profundizarán en el informe espectral correspondiente. Se generará el aviso correspondiente para intervención técnica e inspección de rodamientos/aislación.`,
                        color: [185, 28, 28]
                    });
                } else if (estadoGrupo === 'Zona C') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN DE ALERTA (ZONA C)`,
                        detalle: `Incremento térmico/vibratorio en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s, ${maxTemp.toFixed(1)} °C). Se solicitará lubricación manual y se mantendrá en seguimiento predictivo en la próxima ruta de terreno.`,
                        color: [194, 65, 12]
                    });
                } else if (estadoGrupo === 'Zona B') {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — EN SEGUIMIENTO (ZONA B)`,
                        detalle: `Operación admisible con ligera variación en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s). Se solicitará lubricación manual y se mantendrá en seguimiento preventivo.`,
                        color: [161, 98, 7]
                    });
                } else {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN ÓPTIMA (ZONA A)`,
                        detalle: `Motor operando en condición mecánica y térmica normal bajo norma ISO 20816-3 (${maxRms.toFixed(2)} mm/s). Sin requerimiento de intervención inmediata.`,
                        color: [21, 128, 61]
                    });
                }
            } else if (nombreGrupo === 'REDUCTOR DE VELOCIDAD') {
                if (estadoGrupo === 'Zona D') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN CRÍTICA (ZONA D)`,
                        detalle: `Valores vibratorios en nivel crítico alcanzando ${maxRms.toFixed(2)} mm/s en ${ptoMaxRms} (Temp: ${maxTemp.toFixed(1)} °C). La evaluación detallada de engranajes y modulación se indicará en el informe espectral. Se generará el aviso correspondiente para inspección interna y verificación de partículas en lubricante.`,
                        color: [185, 28, 28]
                    });
                } else if (estadoGrupo === 'Zona C') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN DE ALERTA (ZONA C)`,
                        detalle: `Condición de alerta en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s, ${maxTemp.toFixed(1)} °C). Se solicitará lubricación manual / chequeo de nivel de aceite y se mantendrá en seguimiento continuo.`,
                        color: [194, 65, 12]
                    });
                } else if (estadoGrupo === 'Zona B') {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — EN SEGUIMIENTO (ZONA B)`,
                        detalle: `Operación en Zona B con leve vibración en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s). Se solicitará lubricación manual y se mantendrá en seguimiento de ruta.`,
                        color: [161, 98, 7]
                    });
                } else {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN ÓPTIMA (ZONA A)`,
                        detalle: `Tren reductor operando de manera estable en todas sus etapas (${maxRms.toFixed(2)} mm/s). Parámetros normales bajo norma ISO.`,
                        color: [21, 128, 61]
                    });
                }
            } else if (nombreGrupo === 'POLEAS Y TRANSMISIÓN' || nombreGrupo === 'CHUMACERAS Y DESCANSOS') {
                if (estadoGrupo === 'Zona D') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN CRÍTICA (ZONA D)`,
                        detalle: `Vibración severa registrada en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s). Se generará el aviso correspondiente para realizar ajuste y/o preventiva en ambos descansos de la polea.`,
                        color: [185, 28, 28]
                    });
                } else if (estadoGrupo === 'Zona C') {
                    hayCriticoOAlerta = true;
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN DE ALERTA (ZONA C)`,
                        detalle: `Condición de alerta con aumento vibratorio en ${ptoMaxRms} (${maxRms.toFixed(2)} mm/s, ${maxTemp.toFixed(1)} °C). Se solicitará lubricación manual en ambos descansos y se mantendrá en seguimiento en las próximas mediciones.`,
                        color: [194, 65, 12]
                    });
                } else if (estadoGrupo === 'Zona B') {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — EN SEGUIMIENTO (ZONA B)`,
                        detalle: `Valores en seguimiento operacional (${maxRms.toFixed(2)} mm/s). Se solicitará lubricación manual y se mantendrá en seguimiento preventivo.`,
                        color: [161, 98, 7]
                    });
                } else {
                    diagnosticos.push({
                        titulo: `${nombreGrupo} — CONDICIÓN ÓPTIMA (ZONA A)`,
                        detalle: `Conjunto de descansos y poleas operando dentro de rangos normales de velocidad RMS. No se requieren acciones correctivas.`,
                        color: [21, 128, 61]
                    });
                }
            }
        }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    const bloquesRender = diagnosticos.map((d) => {
        const lineas = doc.splitTextToSize(d.detalle, anchoContenido - 12);
        return {
            titulo: `• ${d.titulo}:`,
            lineas,
            color: d.color,
            altoBloque: 4.5 + (lineas.length * 3.6) + 2.5
        };
    });

    let altoCajaTotal = 6;
    bloquesRender.forEach((b) => (altoCajaTotal += b.altoBloque));

    let lineasNota = [];
    if (hayCriticoOAlerta) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        lineasNota = doc.splitTextToSize(
            '* NOTA TÉCNICA SAP: Los análisis de espectros FFT, cascadas y tendencias temporales complementarias se detallan en el Informe Espectral CBM emitido para esta orden.',
            anchoContenido - 10
        );
        altoCajaTotal += (lineasNota.length * 3.6) + 5;
    }

    if (posY + altoCajaTotal > altoPagina - 20) {
        doc.addPage();
        posY = 20;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.roundedRect(margenX, posY, anchoContenido, altoCajaTotal, 2, 2, 'FD');

    let subY = posY + 5;
    bloquesRender.forEach((b) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...b.color);
        doc.text(b.titulo, margenX + 5, subY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(b.lineas, margenX + 7, subY + 3.8);

        subY += (b.lineas.length * 3.6) + 5.2;
    });

    if (hayCriticoOAlerta && lineasNota.length > 0) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
        doc.text(lineasNota, margenX + 5, subY);
    }

    // 5. PIE DE PÁGINA CENTRALIZADO
    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion,
        textoCentro: `Respaldo CBM para SAP PM | Fecha de Impresión: ${fechaImpresion}`,
        margenX
    });

    // 6. APERTURA EN VISOR INTERNO INTERACTIVO
    abrirVisorPDFInterno(doc, nombreArchivoPDF);
};

// ----------------------------------------------------------------------------
// MODAL: CONFIGURAR MÁQUINA
// ----------------------------------------------------------------------------
window.abrirModalConfigurarMaquina = async (idFirebase) => {
    const modalId = 'modal-configurar-maquina-cbm';
    document.getElementById(modalId)?.remove();

    const eq = (window.datosGlobalesEquipos && window.datosGlobalesEquipos[idFirebase]) || {};

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="modal-box glass-panel" style="max-width: 520px; width: 92%; padding: 0;">
            <header class="modal-header">
                <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">settings</span>
                    Configurar Máquina: ${eq.tag || idFirebase}
                </h3>
                <button type="button" class="btn-cerrar-modal" onclick="document.getElementById('${modalId}').remove()">&times;</button>
            </header>

            <form id="form-config-maquina" onsubmit="event.preventDefault();" style="padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;">
                <div class="campo-formulario">
                    <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Denominación / Nombre:</label>
                    <input type="text" id="cfg-nombre" value="${eq.nombre || ''}" placeholder="Ej: Correa Transportadora CV-01" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="campo-formulario">
                        <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Área Operacional:</label>
                        <input type="text" id="cfg-area" value="${eq.area || 'AR66'}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white;">
                    </div>
                    <div class="campo-formulario">
                        <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Nivel / Cota:</label>
                        <select id="cfg-nivel" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white;">
                            <option value="Nivel 1" ${eq.nivel === 'Nivel 1' ? 'selected' : ''}>Nivel 1</option>
                            <option value="Nivel 2" ${eq.nivel === 'Nivel 2' ? 'selected' : ''}>Nivel 2</option>
                            <option value="Nivel 3" ${eq.nivel === 'Nivel 3' ? 'selected' : ''}>Nivel 3</option>
                            <option value="Nivel -1" ${eq.nivel === 'Nivel -1' ? 'selected' : ''}>Nivel -1</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="campo-formulario">
                        <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Potencia (kW):</label>
                        <input type="number" id="cfg-potencia" value="${eq.potencia || ''}" placeholder="Ej: 150" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white;">
                    </div>
                    <div class="campo-formulario">
                        <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">RPM Nominal:</label>
                        <input type="number" id="cfg-rpm" value="${eq.rpm || ''}" placeholder="Ej: 1485" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-glass); background: #0f172a; color: white;">
                    </div>
                </div>

                <footer class="modal-footer" style="padding: 12px 0 0 0; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-secundario" onclick="document.getElementById('${modalId}').remove()">Cancelar</button>
                    <button type="button" id="btn-guardar-cfg-maquina" class="btn-primario" style="background: #0284c7; color: white; font-weight: 700;">Guardar Ficha</button>
                </footer>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-guardar-cfg-maquina')?.addEventListener('click', async () => {
        const nombreVal = document.getElementById('cfg-nombre')?.value.trim();
        const areaVal = document.getElementById('cfg-area')?.value.trim();
        const nivelVal = document.getElementById('cfg-nivel')?.value;
        const potenciaVal = document.getElementById('cfg-potencia')?.value;
        const rpmVal = document.getElementById('cfg-rpm')?.value;

        try {
            await db.ref(`activos_criticos/${idFirebase}`).update({
                nombre: nombreVal,
                area: areaVal,
                nivel: nivelVal,
                potencia: potenciaVal,
                rpm: rpmVal
            });

            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast('Ficha técnica actualizada en Firebase.', 'exito');
            }
            modal.remove();
            renderizarExpediente(idFirebase);
        } catch (err) {
            console.error('Error guardando configuración:', err);
        }
    });
};

export default {
    renderizarExpediente
};