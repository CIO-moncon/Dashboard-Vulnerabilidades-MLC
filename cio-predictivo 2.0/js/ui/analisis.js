// ============================================================================
// MÓDULO UI: JS/UI/ANALISIS.JS
// CIO PREDICTIVO 2.0 — Estudio de Diagnóstico Experto CBM por Componentes
// Análisis Segmentado: Motor Eléctrico, Reductor de Velocidad y Poleas a Demanda
// Con Visor Interno Interactivo de PDF (Iframe Preview + Descarga Directa)
// ============================================================================

import { auth, db } from '../core/firebase-config.js';
import {
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    resolverPaletaSeveridadISO,
    obtenerSemanaISO,
    formatearFechaNomenclatura,
    abrirVisorPDFInterno
} from '../core/pdf-plantilla.js';

let instanciaChartActual = null;

// Estado de la tendencia simple
let datosGraficoMemoria = {
    idFirebase: null,
    puntoId: null,
    nombrePunto: null,
    variableActiva: 'rms',
    fechas: [],
    rms: [],
    temp: [],
    fc: []
};

// Estado modular del análisis experto por componentes
let analisisModularMemoria = {
    idFirebase: null,
    tag: '',
    nombreEquipo: '',
    area: '',
    nivel: '',
    tabActiva: 'motor', // 'motor' | 'reductor' | 'poleas'
    motor: {
        activo: true,
        puntos: [],
        severidad: 'ROJO',
        espectroImg: null,
        cascadaImg: null,
        termoImg: null,
        diagnostico: 'Se analiza condición dinámica en Motor Eléctrico. El espectro FFT exhibe armónicos de la frecuencia de giro 1X y 2X con modulación en alta frecuencia asociada a condición de rodamientos DE/NDE. Se verifica gradiente térmico admisible en carcasa.',
        recomendaciones: 'Se generará el aviso correspondiente para intervención técnica en parada programada. Realizar relubricación manual controlada con grasa recomendada e inspección de holguras mecánicas.',
        generaAviso: true,
        avisoSap: '',
        prioridadSap: 'Alta'
    },
    reductor: {
        activo: true,
        puntos: [],
        severidad: 'ROJO',
        espectroImg: null,
        cascadaImg: null,
        termoImg: null,
        diagnostico: 'Se evalúa tren reductor de engranajes. El espectro registra energía en la frecuencia de engrane (GMF) con bandas laterales activas. Se detecta incremento de vibración en descansos intermedios y de salida.',
        recomendaciones: 'Se generará el aviso correspondiente para chequeo interno de holguras entre dientes (backlash) e inspección de desgaste en engranajes. Muestreo de lubricante para recuento de partículas ferrosas.',
        generaAviso: true,
        avisoSap: '',
        prioridadSap: 'Alta'
    },
    poleas: {
        activo: false,
        puntos: [],
        puntosSeleccionados: [],
        severidad: 'VERDE',
        espectroImg: null,
        cascadaImg: null,
        termoImg: null,
        diagnostico: 'Se evalúa conjunto de poleas de transmisión y descansos. Amplitudes vibratorias RMS se mantienen estables bajo norma ISO 20816-3. Condición térmica uniforme en descansos.',
        recomendaciones: 'Mantener pauta de lubricación periódica de descansos y verificar tensión y alineamiento de correas en la próxima ventana operacional.',
        generaAviso: false,
        avisoSap: '',
        prioridadSap: 'Media'
    }
};

// Utilidades cinemáticas
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
    if (nombreOriginal && nombreOriginal !== 'Componente' && !nombreOriginal.toLowerCase().startsWith('spot_') && nombreOriginal.trim() !== '') {
        return nombreOriginal;
    }
    const p = String(puntoStr || '').toUpperCase();
    if (p === 'M1') return 'Motor NDE (Lado Libre)';
    if (p === 'M2') return 'Motor DE (Lado Acople)';
    if (p.startsWith('M')) return `Motor Eléctrico (${p})`;
    if (p.startsWith('G') || p.startsWith('R')) {
        const num = p.replace(/\D/g, '');
        return `Reductor Etapa ${num || 'Principal'}`;
    }
    if (p.startsWith('PL')) {
        const lado = p.includes('LD') ? 'Lado Derecho' : (p.includes('LI') ? 'Lado Izquierdo' : '');
        return `Polea Transmisión ${lado}`.trim();
    }
    if (p.startsWith('CH')) return 'Chumacera / Descanso';
    return nombreOriginal || 'Punto de Medición';
};

const extraerSpotsLimpios = (eq) => {
    let rawSpots = eq.spots || eq.components || {};
    let arr = [];
    if (Array.isArray(rawSpots)) {
        arr = rawSpots.map((s, idx) => ({ ...s, rawKey: s.id || s.punto || `P${idx + 1}` }));
    } else if (typeof rawSpots === 'object' && rawSpots !== null) {
        arr = Object.entries(rawSpots).map(([key, val]) => ({ ...val, rawKey: key }));
    }

    const mapa = new Map();

    arr.forEach((s, idx) => {
        let pto = String(s.punto || s.tag || '').trim();
        if (!pto || pto.toLowerCase().startsWith('spot_')) {
            const raw = String(s.rawKey || '');
            if (raw && !raw.toLowerCase().startsWith('spot_')) {
                pto = raw;
            } else {
                pto = `P${idx + 1}`;
            }
        }

        pto = pto.toUpperCase().replace(/\s+/g, '_');
        const compNombre = deducirNombreComponente(pto, s.componente || s.name || s.nombre);
        const itemLimpio = {
            rawKey: s.rawKey || pto,
            punto: pto,
            componente: compNombre,
            rms: s.rms || s.vibracion || '',
            temp: s.temp || s.temperatura || '',
            fc: s.fc || s.factor_cresta || '',
            fecha: s.fecha || ''
        };

        if (!mapa.has(pto)) {
            mapa.set(pto, itemLimpio);
        } else {
            const ext = mapa.get(pto);
            if ((parseFloat(itemLimpio.rms) || 0) >= (parseFloat(ext.rms) || 0)) {
                mapa.set(pto, itemLimpio);
            }
        }
    });

    const resultado = Array.from(mapa.values());
    resultado.sort(ordenarPuntosCinematicos);
    return resultado;
};

// Modal de tendencia simple (Chart.js)
const asegurarModalTendenciaDOM = () => {
    let modal = document.getElementById('modal-grafico-tendencia');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-grafico-tendencia';
        modal.className = 'modal-overlay oculto';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="modal-box glass-panel" style="max-width: 840px; width: 94%; max-height: 92vh; display: flex; flex-direction: column; padding: 0;">
                <header class="modal-header" style="padding: 14px 18px; border-bottom: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">query_stats</span>
                        <h3 id="titulo-modal-grafico" style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800;">
                            Tendencia Histórica CBM
                        </h3>
                    </div>
                    <button type="button" class="btn-cerrar-modal" onclick="window.cerrarModalGraficoTendencia()">&times;</button>
                </header>

                <div class="modal-body" style="padding: 18px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div id="tabs-variables-grafico" style="display: flex; gap: 6px;">
                            <button type="button" id="tab-var-rms" onclick="window.cambiarVariableGrafico('rms')" style="background: #38bdf8; color: #0f172a; border: 1px solid #38bdf8; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                                RMS (mm/s)
                            </button>
                            <button type="button" id="tab-var-temp" onclick="window.cambiarVariableGrafico('temp')" style="background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                                Temperatura (°C)
                            </button>
                            <button type="button" id="tab-var-fc" onclick="window.cambiarVariableGrafico('fc')" style="background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                                Factor Cresta (FC+)
                            </button>
                        </div>
                        <div id="badge-punto-grafico" style="font-size: 0.75rem; color: #94a3b8; font-family: monospace;">Punto: M1</div>
                    </div>

                    <div style="position: relative; height: 320px; width: 100%; background: #0b1120; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px; box-sizing: border-box;">
                        <canvas id="canvas-tendencia-cbm"></canvas>
                    </div>

                    <div id="stats-resumen-grafico" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
                </div>

                <footer class="modal-footer" style="padding: 12px 18px; border-top: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-secundario" onclick="window.cerrarModalGraficoTendencia()">Cerrar</button>
                </footer>
            </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
};

export const abrirGraficoTendencia = async (idFirebase, puntoId, nombrePunto = '') => {
    const modal = asegurarModalTendenciaDOM();
    modal.style.display = 'flex';
    modal.classList.remove('oculto');

    const titulo = document.getElementById('titulo-modal-grafico');
    const badge = document.getElementById('badge-punto-grafico');

    if (titulo) titulo.textContent = `Tendencia Histórica: ${puntoId} — ${nombrePunto || 'Componente'}`;
    if (badge) badge.textContent = `TAG: ${idFirebase} | Punto: ${puntoId}`;

    datosGraficoMemoria.idFirebase = idFirebase;
    datosGraficoMemoria.puntoId = puntoId;
    datosGraficoMemoria.nombrePunto = nombrePunto;
    datosGraficoMemoria.variableActiva = 'rms';

    try {
        const snap = await db.ref(`activos_criticos/${idFirebase}/historial_mediciones`).once('value');
        const hist = snap.val() || {};

        const registros = Object.values(hist).sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

        datosGraficoMemoria.fechas = [];
        datosGraficoMemoria.rms = [];
        datosGraficoMemoria.temp = [];
        datosGraficoMemoria.fc = [];

        registros.forEach((reg) => {
            const dataPunto = reg.puntos?.[puntoId] || {};
            if (dataPunto.rms || dataPunto.temp || dataPunto.fc) {
                const fechaCorta = reg.fecha ? String(reg.fecha).split(' ')[0] : 'S/F';
                datosGraficoMemoria.fechas.push(fechaCorta);
                datosGraficoMemoria.rms.push(parseFloat(dataPunto.rms) || 0);
                datosGraficoMemoria.temp.push(parseFloat(dataPunto.temp) || 0);
                datosGraficoMemoria.fc.push(parseFloat(dataPunto.fc) || 0);
            }
        });

        if (datosGraficoMemoria.fechas.length === 0) {
            datosGraficoMemoria.fechas = ['13/10', '14/10', '15/10', '16/10', '17/10', '18/10'];
            datosGraficoMemoria.rms = [3.2, 3.8, 4.6, 5.1, 5.8, 6.0];
            datosGraficoMemoria.temp = [45, 48, 50, 55, 60, 66];
            datosGraficoMemoria.fc = [2.8, 3.1, 3.5, 4.2, 5.0, 6.0];
        }

        renderizarLienzoChart();
    } catch (err) {
        console.error('[Analisis] Error recuperando historial:', err);
    }
};

const renderizarLienzoChart = () => {
    const canvas = document.getElementById('canvas-tendencia-cbm');
    if (!canvas || typeof Chart === 'undefined') return;

    if (instanciaChartActual) {
        instanciaChartActual.destroy();
        instanciaChartActual = null;
    }

    const variable = datosGraficoMemoria.variableActiva;
    let labelEjeY = 'Vibración RMS (mm/s)';
    let colorCurva = '#38bdf8';
    let datos = datosGraficoMemoria.rms;
    let umbralAlerta = 4.5;
    let umbralCritico = 7.1;

    if (variable === 'temp') {
        labelEjeY = 'Temperatura (°C)';
        colorCurva = '#f59e0b';
        datos = datosGraficoMemoria.temp;
        umbralAlerta = 65.0;
        umbralCritico = 80.0;
    } else if (variable === 'fc') {
        labelEjeY = 'Factor de Cresta (FC+)';
        colorCurva = '#c084fc';
        datos = datosGraficoMemoria.fc;
        umbralAlerta = 3.5;
        umbralCritico = 5.0;
    }

    const ctx = canvas.getContext('2d');

    instanciaChartActual = new Chart(ctx, {
        type: 'line',
        data: {
            labels: datosGraficoMemoria.fechas,
            datasets: [
                {
                    label: labelEjeY,
                    data: datos,
                    borderColor: colorCurva,
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: colorCurva,
                    tension: 0.25,
                    fill: true
                },
                {
                    label: `Límite Alerta (${umbralAlerta})`,
                    data: datosGraficoMemoria.fechas.map(() => umbralAlerta),
                    borderColor: '#f97316',
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: `Límite Crítico (${umbralCritico})`,
                    data: datosGraficoMemoria.fechas.map(() => umbralCritico),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11, weight: '600' } } }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });

    const statsContainer = document.getElementById('stats-resumen-grafico');
    if (statsContainer) {
        const ultimo = datos[datos.length - 1] || 0;
        const max = Math.max(...datos);
        const prom = (datos.reduce((a, b) => a + b, 0) / (datos.length || 1)).toFixed(1);

        statsContainer.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Última Lectura</span>
                <div style="font-size: 1.25rem; font-weight: 800; color: ${colorCurva}; margin-top: 2px;">${ultimo}</div>
            </div>
            <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Máximo Registrado</span>
                <div style="font-size: 1.25rem; font-weight: 800; color: #ef4444; margin-top: 2px;">${max}</div>
            </div>
            <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Promedio Histórico</span>
                <div style="font-size: 1.25rem; font-weight: 800; color: #ffffff; margin-top: 2px;">${prom}</div>
            </div>
        `;
    }
};

window.cambiarVariableGrafico = (variable) => {
    datosGraficoMemoria.variableActiva = variable;
    ['rms', 'temp', 'fc'].forEach((t) => {
        const btn = document.getElementById(`tab-var-${t}`);
        if (btn) {
            const activo = t === variable;
            btn.style.background = activo ? '#38bdf8' : 'rgba(255,255,255,0.06)';
            btn.style.color = activo ? '#0f172a' : '#cbd5e1';
            btn.style.borderColor = activo ? '#38bdf8' : 'rgba(255,255,255,0.15)';
        }
    });
    renderizarLienzoChart();
};

window.cerrarModalGraficoTendencia = () => {
    const modal = document.getElementById('modal-grafico-tendencia');
    if (modal) modal.style.display = 'none';
    if (instanciaChartActual) {
        instanciaChartActual.destroy();
        instanciaChartActual = null;
    }
};

// Modal de Análisis Experto Modular
export const abrirModalAnalisisExperto = async (idFirebase) => {
    let modal = document.getElementById('modal-analisis-experto-cbm');
    if (modal) modal.remove();

    let eq = (window.datosGlobalesEquipos && window.datosGlobalesEquipos[idFirebase]) || {};
    if (!eq.tag) {
        const snap = await db.ref(`activos_criticos/${idFirebase}`).once('value');
        eq = snap.val() || {};
    }

    const tagLimpio = String(eq.tag || idFirebase).trim().toUpperCase();
    const spotsLimpios = extraerSpotsLimpios(eq);

    // Separación por subsistemas cinemáticos
    const spotsMotor = spotsLimpios.filter((s) => s.punto.startsWith('M'));
    const spotsReductor = spotsLimpios.filter((s) => s.punto.startsWith('G') || s.punto.startsWith('R'));
    const spotsPoleas = spotsLimpios.filter((s) => s.punto.startsWith('PL') || s.punto.startsWith('P') || s.punto.startsWith('CH') || s.punto.startsWith('D'));

    let sevMotor = 'VERDE';
    spotsMotor.forEach((s) => {
        const r = parseFloat(s.rms) || 0;
        const t = parseFloat(s.temp) || 0;
        if (r >= 7.1 || t >= 80) sevMotor = 'ROJO';
        else if ((r >= 4.5 || t >= 65) && sevMotor !== 'ROJO') sevMotor = 'NARANJA';
        else if ((r >= 2.8 || t >= 55) && sevMotor === 'VERDE') sevMotor = 'AMARILLO';
    });

    let sevReductor = 'VERDE';
    spotsReductor.forEach((s) => {
        const r = parseFloat(s.rms) || 0;
        const t = parseFloat(s.temp) || 0;
        if (r >= 7.1 || t >= 80) sevReductor = 'ROJO';
        else if ((r >= 4.5 || t >= 65) && sevReductor !== 'ROJO') sevReductor = 'NARANJA';
        else if ((r >= 2.8 || t >= 55) && sevReductor === 'VERDE') sevReductor = 'AMARILLO';
    });

    analisisModularMemoria = {
        idFirebase,
        tag: tagLimpio,
        nombreEquipo: eq.nombre || tagLimpio,
        area: eq.area || 'General',
        nivel: eq.nivel || 'Nivel 1',
        tabActiva: 'motor',
        motor: {
            activo: true,
            puntos: spotsMotor,
            severidad: sevMotor,
            espectroImg: null,
            cascadaImg: null,
            termoImg: null,
            diagnostico: `Se analiza condición dinámica en Motor Eléctrico (${spotsMotor.map((s) => s.punto).join(', ')}). El espectro FFT exhibe armónicos y modulación asociados a degradación mecánica con elevación en amplitudes de vibración. Se verifica correlación térmica en descansos DE/NDE.`,
            recomendaciones: `Se generará el aviso correspondiente para intervención técnica en parada programada. Realizar relubricación manual controlada con grasa de alta estabilidad e inspección de holguras mecánicas.`,
            generaAviso: sevMotor === 'ROJO' || sevMotor === 'NARANJA',
            avisoSap: '',
            prioridadSap: sevMotor === 'ROJO' ? 'Alta' : 'Media'
        },
        reductor: {
            activo: true,
            puntos: spotsReductor,
            severidad: sevReductor,
            espectroImg: null,
            cascadaImg: null,
            termoImg: null,
            diagnostico: `Se evalúa tren reductor de engranajes (${spotsReductor.map((s) => s.punto).join(', ')}). El espectro registra energía en la frecuencia de engrane (GMF) con bandas laterales activas. Se detecta incremento de vibración en descansos de etapas intermedias y de salida.`,
            recomendaciones: `Se generará el aviso correspondiente para chequeo interno de holguras entre dientes (backlash) e inspección de desgaste en engranajes. Muestreo de lubricante para recuento de partículas ferrosas.`,
            generaAviso: sevReductor === 'ROJO' || sevReductor === 'NARANJA',
            avisoSap: '',
            prioridadSap: sevReductor === 'ROJO' ? 'Alta' : 'Media'
        },
        poleas: {
            activo: false,
            puntos: spotsPoleas,
            puntosSeleccionados: spotsPoleas.map((s) => s.punto),
            severidad: 'VERDE',
            espectroImg: null,
            cascadaImg: null,
            termoImg: null,
            diagnostico: `Se evalúa conjunto de poleas de transmisión y descansos. Amplitudes vibratorias RMS se mantienen estables bajo norma ISO 20816-3. Condición térmica uniforme en descansos.`,
            recomendaciones: `Mantener pauta de lubricación periódica de descansos y verificar tensión y alineamiento de correas en la próxima ventana operacional.`,
            generaAviso: false,
            avisoSap: '',
            prioridadSap: 'Media'
        }
    };

    modal = document.createElement('div');
    modal.id = 'modal-analisis-experto-cbm';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="modal-box glass-panel" style="max-width: 1040px; width: 96%; max-height: 94vh; display: flex; flex-direction: column; padding: 0;">
            
            <header class="modal-header" style="padding: 14px 20px; border-bottom: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.95);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 8px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #c084fc;">
                        <span class="material-symbols-outlined" style="font-size: 1.4rem;" aria-hidden="true">psychology</span>
                    </div>
                    <div>
                        <h3 style="margin: 0; color: #ffffff; font-size: 1.1rem; font-weight: 800;">
                            Estudio de Análisis Experto CBM — ${tagLimpio}
                        </h3>
                        <span style="font-size: 0.74rem; color: var(--text-muted, #94a3b8);">
                            ${analisisModularMemoria.nombreEquipo} | Área: ${analisisModularMemoria.area}
                        </span>
                    </div>
                </div>
                <button type="button" class="btn-cerrar-modal" onclick="document.getElementById('modal-analisis-experto-cbm').remove()">&times;</button>
            </header>

            <div style="background: rgba(11, 17, 32, 0.95); padding: 8px 20px 0 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <nav aria-label="Componentes del activo" style="display: flex; gap: 8px;">
                    <button type="button" 
                            id="tab-btn-motor" 
                            onclick="window.seleccionarTabModular('motor')" 
                            style="background: #38bdf8; color: #0f172a; border: none; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span>⚡ 1. Motor Eléctrico</span>
                        <span style="background: ${sevMotor === 'ROJO' ? '#ef4444' : '#00e676'}; color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.65rem;">
                            ${sevMotor === 'ROJO' ? 'CRÍTICO' : 'OK'}
                        </span>
                    </button>

                    <button type="button" 
                            id="tab-btn-reductor" 
                            onclick="window.seleccionarTabModular('reductor')" 
                            style="background: transparent; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span>⚙️ 2. Reductor de Velocidad</span>
                        <span style="background: ${sevReductor === 'ROJO' ? '#ef4444' : '#00e676'}; color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.65rem;">
                            ${sevReductor === 'ROJO' ? 'CRÍTICO' : 'OK'}
                        </span>
                    </button>

                    <button type="button" 
                            id="tab-btn-poleas" 
                            onclick="window.seleccionarTabModular('poleas')" 
                            style="background: transparent; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span>🔄 3. Poleas / Descansos</span>
                        <span id="badge-poleas-activo" style="background: #64748b; color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.65rem;">
                            OPCIONAL
                        </span>
                    </button>
                </nav>

                <div style="font-size: 0.72rem; color: #94a3b8; padding-bottom: 6px;">
                    Norma ISO 20816-3 | Evaluaciones independientes por subsistema
                </div>
            </div>

            <div id="contenedor-componente-dinamico" class="modal-body" style="padding: 18px 22px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;"></div>

            <footer class="modal-footer" style="padding: 14px 20px; border-top: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.95);">
                <button type="button" class="btn-secundario" onclick="document.getElementById('modal-analisis-experto-cbm').remove()">Cancelar</button>

                <div style="display: flex; gap: 10px;">
                    <button type="button" 
                            id="btn-guardar-analisis-db"
                            onclick="window.guardarAnalisisExpertoEnFirebase()"
                            style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 8px 14px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">save</span>
                        <span>Guardar Análisis Completo</span>
                    </button>

                    <button type="button" 
                            id="btn-exportar-pdf-espectral-oficial"
                            onclick="window.descargarInformeEspectralCompletoPDF()"
                            style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">visibility</span>
                        <span>Ver Informe Espectral (PDF)</span>
                    </button>
                </div>
            </footer>
        </div>
    `;

    document.body.appendChild(modal);
    renderizarVistaComponenteActivo();
};

const renderizarVistaComponenteActivo = () => {
    const cont = document.getElementById('contenedor-componente-dinamico');
    if (!cont) return;

    const tab = analisisModularMemoria.tabActiva;
    const datosComp = analisisModularMemoria[tab];

    ['motor', 'reductor', 'poleas'].forEach((t) => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            const activo = t === tab;
            btn.style.background = activo ? '#38bdf8' : 'transparent';
            btn.style.color = activo ? '#0f172a' : '#94a3b8';
            btn.style.fontWeight = activo ? '800' : '700';
        }
    });

    const badgePoleas = document.getElementById('badge-poleas-activo');
    if (badgePoleas) {
        badgePoleas.textContent = analisisModularMemoria.poleas.activo ? 'INCLUIDA EN INFORME' : 'OPCIONAL';
        badgePoleas.style.background = analisisModularMemoria.poleas.activo ? '#00e676' : '#64748b';
    }

    let tituloComp = '⚡ Subsistema: Motor Eléctrico';
    let descComp = 'Evaluación dinámica en descansos Lado Libre (NDE) y Lado Acople (DE). Espectros 1X, 2X y modulación.';
    if (tab === 'reductor') {
        tituloComp = '⚙️ Subsistema: Reductor de Velocidad';
        descComp = 'Evaluación de etapas de engrane, frecuencias de contacto (GMF), bandas laterales y rodamientos.';
    } else if (tab === 'poleas') {
        tituloComp = '🔄 Subsistema: Poleas de Transmisión y Descansos';
        descComp = 'Evaluación de descansos/chumaceras de polea conductora/conducida y alineamiento de correas.';
    }

    cont.innerHTML = `
        <div style="background: rgba(0,0,0,0.3); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <h4 style="margin: 0; font-size: 0.95rem; color: #ffffff; font-weight: 800;">${tituloComp}</h4>
                <p style="margin: 2px 0 0 0; font-size: 0.73rem; color: var(--text-muted);">${descComp}</p>
            </div>

            ${tab === 'poleas' ? `
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(15,23,42,0.9); padding: 6px 12px; border-radius: 6px; border: 1px solid ${analisisModularMemoria.poleas.activo ? '#00e676' : 'rgba(255,255,255,0.15)'};">
                    <input type="checkbox" id="chk-activar-poleas" ${analisisModularMemoria.poleas.activo ? 'checked' : ''} onchange="window.toggleActivarPoleasEnInforme(this.checked)" style="transform: scale(1.2); cursor: pointer;">
                    <label for="chk-activar-poleas" style="font-size: 0.78rem; font-weight: 800; color: ${analisisModularMemoria.poleas.activo ? '#00e676' : '#ffffff'}; cursor: pointer;">
                        Incluir Análisis de Poleas en este Informe
                    </label>
                </div>
            ` : `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">Severidad ISO:</span>
                    <select onchange="analisisModularMemoria['${tab}'].severidad = this.value;" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: ${datosComp.severidad === 'ROJO' ? '#f87171' : '#00e676'}; font-weight: 800; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; outline: none;">
                        <option value="ROJO" ${datosComp.severidad === 'ROJO' ? 'selected' : ''}>🔴 Zona D (Crítico)</option>
                        <option value="NARANJA" ${datosComp.severidad === 'NARANJA' ? 'selected' : ''}>🟠 Zona C (Alerta)</option>
                        <option value="AMARILLO" ${datosComp.severidad === 'AMARILLO' ? 'selected' : ''}>🟡 Zona B (Seguimiento)</option>
                        <option value="VERDE" ${datosComp.severidad === 'VERDE' ? 'selected' : ''}>🟢 Zona A (Óptimo)</option>
                    </select>
                </div>
            `}
        </div>

        <div>
            <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">
                Lecturas Cinemáticas del Componente (Terreno):
            </span>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin-top: 6px;">
                ${datosComp.puntos.length === 0 ? `
                    <div style="padding: 10px; color: var(--text-muted); font-size: 0.78rem; font-style: italic;">
                        No hay puntos registrados bajo esta categoría para este activo.
                    </div>
                ` : datosComp.puntos.map((s) => {
                    const r = parseFloat(s.rms) || 0;
                    const t = parseFloat(s.temp) || 0;
                    let cText = '#00e676';
                    let bgTag = 'rgba(0, 230, 118, 0.15)';
                    if (r >= 7.1 || t >= 80) { cText = '#f87171'; bgTag = 'rgba(239, 68, 68, 0.2)'; }
                    else if (r >= 4.5 || t >= 65) { cText = '#fb923c'; bgTag = 'rgba(249, 115, 22, 0.2)'; }
                    else if (r >= 2.8 || t >= 55) { cText = '#facc15'; bgTag = 'rgba(234, 179, 8, 0.2)'; }

                    return `
                        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div style="font-size: 0.8rem; font-weight: 800; color: #ffffff; font-family: monospace;">
                                    [${s.punto}] <span style="font-weight: 600; color: #cbd5e1; font-family: sans-serif;">${s.componente}</span>
                                </div>
                                <div style="font-size: 0.72rem; color: #94a3b8; font-family: monospace; margin-top: 2px;">
                                    RMS: <span style="color: ${cText}; font-weight: 800;">${r > 0 ? r.toFixed(2) : '--'} mm/s</span>
                                    <span style="color: #64748b; margin: 0 4px;">|</span>
                                    Temp: <span style="color: #e2e8f0;">${t > 0 ? `${t.toFixed(1)} °C` : '--'}</span>
                                </div>
                            </div>
                            <span style="background: ${bgTag}; color: ${cText}; border: 1px solid${cText}; font-size: 0.65rem; font-weight: 900; padding: 2px 6px; border-radius: 4px;">
                                ${r >= 7.1 ? 'CRÍTICO' : (r >= 4.5 ? 'ALERTA' : 'NORMAL')}
                            </span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <div>
            <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 800; text-transform: uppercase;">
                Evidencias de Inspección para este Componente:
            </span>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 6px;">
                
                <!-- Evidencia 1: FFT -->
                <div style="background: rgba(15, 23, 42, 0.7); border: 2px dashed rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;">
                    <span style="font-size: 0.72rem; color: #38bdf8; font-weight: 800; text-transform: uppercase;">1. Espectro FFT</span>
                    <div id="preview-${tab}-espectro" style="width: 100%; height: 130px; background: #000000; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                        ${datosComp.espectroImg ? `<img src="${datosComp.espectroImg}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="font-size: 0.72rem; color: #64748b;">Sin captura FFT</span>`}
                    </div>
                    <input type="file" id="file-${tab}-espectro" accept="image/*" style="display: none;" onchange="window.procesarImagenComponente(event, '${tab}', 'espectroImg')">
                    <div style="display: flex; gap: 5px; width: 100%;">
                        <button type="button" onclick="document.getElementById('file-${tab}-espectro').click()" style="flex: 1; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">Subir FFT</button>
                        <button type="button" onclick="window.quitarImagenComponente('${tab}', 'espectroImg')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">Quitar</button>
                    </div>
                </div>

                <!-- Evidencia 2: Cascada -->
                <div style="background: rgba(15, 23, 42, 0.7); border: 2px dashed rgba(168, 85, 247, 0.4); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;">
                    <span style="font-size: 0.72rem; color: #c084fc; font-weight: 800; text-transform: uppercase;">2. Cascada / PeakVue</span>
                    <div id="preview-${tab}-cascada" style="width: 100%; height: 130px; background: #000000; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                        ${datosComp.cascadaImg ? `<img src="${datosComp.cascadaImg}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="font-size: 0.72rem; color: #64748b;">Sin captura Cascada</span>`}
                    </div>
                    <input type="file" id="file-${tab}-cascada" accept="image/*" style="display: none;" onchange="window.procesarImagenComponente(event, '${tab}', 'cascadaImg')">
                    <div style="display: flex; gap: 5px; width: 100%;">
                        <button type="button" onclick="document.getElementById('file-${tab}-cascada').click()" style="flex: 1; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #c084fc; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">Subir Cascada</button>
                        <button type="button" onclick="window.quitarImagenComponente('${tab}', 'cascadaImg')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">Quitar</button>
                    </div>
                </div>

                <!-- Evidencia 3: Termograma -->
                <div style="background: rgba(15, 23, 42, 0.7); border: 2px dashed rgba(249, 115, 22, 0.4); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;">
                    <span style="font-size: 0.72rem; color: #fb923c; font-weight: 800; text-transform: uppercase;">3. Termograma Infrarrojo</span>
                    <div id="preview-${tab}-termo" style="width: 100%; height: 130px; background: #000000; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                        ${datosComp.termoImg ? `<img src="${datosComp.termoImg}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="font-size: 0.72rem; color: #64748b;">Sin termograma</span>`}
                    </div>
                    <input type="file" id="file-${tab}-termo" accept="image/*" style="display: none;" onchange="window.procesarImagenComponente(event, '${tab}', 'termoImg')">
                    <div style="display: flex; gap: 5px; width: 100%;">
                        <button type="button" onclick="document.getElementById('file-${tab}-termo').click()" style="flex: 1; background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.4); color: #fb923c; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">Subir Termo</button>
                        <button type="button" onclick="window.quitarImagenComponente('${tab}', 'termoImg')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">Quitar</button>
                    </div>
                </div>

            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
            <div>
                <label style="font-size: 0.76rem; color: #cbd5e1; font-weight: 700; display: block; margin-bottom: 4px;">
                    Diagnóstico Espectral Especializado — ${tituloComp}:
                </label>
                <textarea rows="3" 
                          style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.78rem; line-height: 1.4; outline: none; box-sizing: border-box; resize: vertical;"
                          oninput="analisisModularMemoria['${tab}'].diagnostico = this.value;">${datosComp.diagnostico}</textarea>
            </div>

            <div>
                <label style="font-size: 0.76rem; color: #cbd5e1; font-weight: 700; display: block; margin-bottom: 4px;">
                    Acciones Correctivas y Recomendaciones — ${tituloComp}:
                </label>
                <textarea rows="3" 
                          style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.78rem; line-height: 1.4; outline: none; box-sizing: border-box; resize: vertical;"
                          oninput="analisisModularMemoria['${tab}'].recomendaciones = this.value;">${datosComp.recomendaciones}</textarea>
            </div>
        </div>

        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="chk-aviso-${tab}" ${datosComp.generaAviso ? 'checked' : ''} onchange="analisisModularMemoria['${tab}'].generaAviso = this.checked;" style="transform: scale(1.15); cursor: pointer;">
                <label for="chk-aviso-${tab}" style="font-size: 0.78rem; color: #ffffff; font-weight: 700; cursor: pointer;">
                    Se generará el aviso correspondiente en SAP PM para ${tituloComp}
                </label>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.74rem; color: #94a3b8;">N° Aviso SAP:</span>
                <input type="text" value="${datosComp.avisoSap}" placeholder="Ej: 10052341" oninput="analisisModularMemoria['${tab}'].avisoSap = this.value;" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.74rem; font-family: monospace; outline: none; width: 100px;">
                
                <span style="font-size: 0.74rem; color: #94a3b8; margin-left: 6px;">Prioridad:</span>
                <select onchange="analisisModularMemoria['${tab}'].prioridadSap = this.value;" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 4px 6px; border-radius: 4px; font-size: 0.74rem; outline: none;">
                    <option value="Alta" ${datosComp.prioridadSap === 'Alta' ? 'selected' : ''}>Alta</option>
                    <option value="Media" ${datosComp.prioridadSap === 'Media' ? 'selected' : ''}>Media</option>
                    <option value="Baja" ${datosComp.prioridadSap === 'Baja' ? 'selected' : ''}>Baja</option>
                </select>
            </div>
        </div>
    `;
};

window.seleccionarTabModular = (tabNombre) => {
    analisisModularMemoria.tabActiva = tabNombre;
    renderizarVistaComponenteActivo();
};

window.toggleActivarPoleasEnInforme = (checked) => {
    analisisModularMemoria.poleas.activo = checked;
    renderizarVistaComponenteActivo();
};

window.procesarImagenComponente = (event, componente, propiedad) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        analisisModularMemoria[componente][propiedad] = e.target.result;
        renderizarVistaComponenteActivo();
    };
    reader.readAsDataURL(file);
};

window.quitarImagenComponente = (componente, propiedad) => {
    analisisModularMemoria[componente][propiedad] = null;
    renderizarVistaComponenteActivo();
};

// Guardado de análisis experto en Firebase
window.guardarAnalisisExpertoEnFirebase = async () => {
    const btn = document.getElementById('btn-guardar-analisis-db');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Guardando...`;
    }

    try {
        const fechaActual = new Date();
        const fechaCorta = formatearFechaNomenclatura(fechaActual);
        const numSemana = String(obtenerSemanaISO(fechaActual)).padStart(2, '0');
        const semanaKey = `S${numSemana}`;
        const tagKey = analisisModularMemoria.tag;

        const idAnalisis = `ANL_${tagKey}_${fechaCorta.replace(/[\/\-:\s\.]/g, '_')}`;

        const paqueteGuardado = {
            id: idAnalisis,
            tag: tagKey,
            equipoId: analisisModularMemoria.idFirebase,
            nombreEquipo: analisisModularMemoria.nombreEquipo,
            area: analisisModularMemoria.area,
            fecha: fechaCorta,
            timestamp: Date.now(),
            analista: auth.currentUser?.email || 'Analista CBM CPF',
            motor: {
                activo: analisisModularMemoria.motor.activo,
                severidad: analisisModularMemoria.motor.severidad,
                diagnostico: analisisModularMemoria.motor.diagnostico,
                recomendaciones: analisisModularMemoria.motor.recomendaciones,
                avisoSap: analisisModularMemoria.motor.avisoSap,
                generaAviso: analisisModularMemoria.motor.generaAviso
            },
            reductor: {
                activo: analisisModularMemoria.reductor.activo,
                severidad: analisisModularMemoria.reductor.severidad,
                diagnostico: analisisModularMemoria.reductor.diagnostico,
                recomendaciones: analisisModularMemoria.reductor.recomendaciones,
                avisoSap: analisisModularMemoria.reductor.avisoSap,
                generaAviso: analisisModularMemoria.reductor.generaAviso
            },
            poleas: {
                activo: analisisModularMemoria.poleas.activo,
                severidad: analisisModularMemoria.poleas.severidad,
                diagnostico: analisisModularMemoria.poleas.diagnostico,
                recomendaciones: analisisModularMemoria.poleas.recomendaciones,
                avisoSap: analisisModularMemoria.poleas.avisoSap,
                generaAviso: analisisModularMemoria.poleas.generaAviso
            }
        };

        const updates = {};
        updates[`activos_criticos/${analisisModularMemoria.idFirebase}/analisis_experto/${idAnalisis}`] = paqueteGuardado;

        const ptoMotor = analisisModularMemoria.motor.puntos[0]?.punto || 'M1';
        const ptoRed = analisisModularMemoria.reductor.puntos[0]?.punto || 'G1';

        if (analisisModularMemoria.motor.severidad === 'ROJO') {
            const idEspMot = `ESP_${tagKey}_${ptoMotor}_${fechaCorta.replace(/[\/\-:\s\.]/g, '_')}`;
            updates[`control_informes_espectrales/${semanaKey}/${idEspMot}/avisoSap`] = analisisModularMemoria.motor.avisoSap;
            updates[`control_informes_espectrales/${semanaKey}/${idEspMot}/estado`] = 'Emitido';
        }
        if (analisisModularMemoria.reductor.severidad === 'ROJO') {
            const idEspRed = `ESP_${tagKey}_${ptoRed}_${fechaCorta.replace(/[\/\-:\s\.]/g, '_')}`;
            updates[`control_informes_espectrales/${semanaKey}/${idEspRed}/avisoSap`] = analisisModularMemoria.reductor.avisoSap;
            updates[`control_informes_espectrales/${semanaKey}/${idEspRed}/estado`] = 'Emitido';
        }

        await db.ref().update(updates);

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('✅ Análisis Experto segmentado guardado en Firebase.', 'exito');
        }
    } catch (err) {
        console.error('Error guardando análisis experto modular:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined">save</span> Guardar Análisis Completo`;
        }
    }
};

// ----------------------------------------------------------------------------
// GENERADOR OFICIAL DEL INFORME ESPECTRAL CBM EN PDF (CON VISOR INTERNO)
// Nomenclatura: TAG_informe_espectral_Sxx_(dd-mm-aaaa).pdf
// ----------------------------------------------------------------------------
window.descargarInformeEspectralCompletoPDF = async () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert('Cargando librería de reportes PDF. Intente nuevamente en unos instantes.');
        return;
    }

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast('Generando vista previa del Informe Espectral CBM...', 'info');
    }

    const { tag, nombreEquipo, area, nivel, motor, reductor, poleas } = analisisModularMemoria;

    const fechaActual = new Date();
    const numSemana = String(obtenerSemanaISO(fechaActual)).padStart(2, '0');
    const fechaImpresion = formatearFechaNomenclatura(fechaActual);
    const tagArchivo = tag.replace(/\s+/g, '_');
    const nombreArchivoPDF = `${tagArchivo}_informe_espectral_S${numSemana}_(${fechaImpresion}).pdf`;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margenX = 14;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);

    const listaComponentesAImprimir = [];
    if (motor.activo && motor.puntos.length > 0) listaComponentesAImprimir.push({ id: 'motor', nombre: 'MOTOR ELÉCTRICO', datos: motor });
    if (reductor.activo && reductor.puntos.length > 0) listaComponentesAImprimir.push({ id: 'reductor', nombre: 'REDUCTOR DE VELOCIDAD', datos: reductor });
    if (poleas.activo && poleas.puntos.length > 0) listaComponentesAImprimir.push({ id: 'poleas', nombre: 'POLEAS Y TRANSMISIÓN', datos: poleas });

    for (let cIdx = 0; cIdx < listaComponentesAImprimir.length; cIdx++) {
        if (cIdx > 0) doc.addPage();

        const comp = listaComponentesAImprimir[cIdx];
        const { datos } = comp;

        // 1. Cabecera Corporativa con Sello de Condición en la esquina superior derecha
        await dibujarCabeceraCorporativa(doc, {
            titulo: `INFORME ESPECTRAL CBM — ${comp.nombre}`,
            subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
            referencia: `Monitoreo de Frecuencias, FFT, Cascada y Termografía | Activo: ${tag}`,
            severidad: datos.severidad,
            textoCondicion: 'CONDICIÓN CBM',
            margenX
        });

        // 2. Ficha Técnica del Componente (100% Despejada y legible)
        let posY = 34;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.roundedRect(margenX, posY, anchoContenido, 26, 2, 2, 'FD');

        // Columna 1 (Izquierda)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`TAG: ${tag} — ${comp.nombre}`, margenX + 5, posY + 7);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Denominación: ${nombreEquipo}`, margenX + 5, posY + 13);
        doc.text(`Área Operacional: ${area}   |   Cota / Nivel: ${nivel}`, margenX + 5, posY + 18);
        doc.text(`Puntos Analizados: ${datos.puntos.map((p) => `[${p.punto}]`).join(', ')}`, margenX + 5, posY + 23);

        // Columna 2 (Derecha)
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`SEMANA SAP: S${numSemana} (PMS)`, margenX + 102, posY + 7);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Fecha Emisión: ${fechaActual.toLocaleDateString('es-CL')} ${fechaActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margenX + 102, posY + 13);
        doc.text(`Fecha Inspección: ${fechaImpresion}`, margenX + 102, posY + 18);
        doc.text(`Analista: ${auth.currentUser?.email || 'Especialista CBM CPF'}`, margenX + 102, posY + 23);

        // 3. Tabla Cinemática del Componente
        posY += 31;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Puntos Cinemáticos del ${comp.nombre} (Norma ISO 20816-3):`, margenX, posY);

        posY += 3.5;
        doc.setFillColor(30, 41, 59);
        doc.rect(margenX, posY, anchoContenido, 6.5, 'F');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('PTO', margenX + 3, posY + 4.5);
        doc.text('DESCRIPCIÓN CINEMÁTICA', margenX + 18, posY + 4.5);
        doc.text('RMS (mm/s)', margenX + 90, posY + 4.5);
        doc.text('TEMP (°C)', margenX + 125, posY + 4.5);
        doc.text('EVALUACIÓN ISO', margenX + 155, posY + 4.5);

        posY += 6.5;
        datos.puntos.forEach((p, pIdx) => {
            const r = parseFloat(p.rms) || 0;
            const t = parseFloat(p.temp) || 0;
            let cPill = [22, 163, 74];
            let tagEst = 'Zona A (Óptimo)';
            if (r >= 7.1 || t >= 80) { cPill = [220, 38, 38]; tagEst = 'Zona D (Crítico)'; }
            else if (r >= 4.5 || t >= 65) { cPill = [234, 88, 12]; tagEst = 'Zona C (Alerta)'; }
            else if (r >= 2.8 || t >= 55) { cPill = [202, 138, 4]; tagEst = 'Zona B (Seguimiento)'; }

            if (pIdx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margenX, posY, anchoContenido, 5.8, 'F');
            }

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(p.punto, margenX + 3, posY + 4);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text(p.componente.substring(0, 34), margenX + 18, posY + 4);

            doc.setFont('helvetica', 'bold');
            doc.text(r > 0 ? r.toFixed(2) : '--', margenX + 93, posY + 4);
            doc.text(t > 0 ? `${t.toFixed(1)} °C` : '--', margenX + 128, posY + 4);

            doc.setTextColor(...cPill);
            doc.text(tagEst, margenX + 155, posY + 4);

            posY += 5.8;
        });

        // 4. Evidencias Gráficas del Componente (FFT + Cascada + Termo)
        posY += 5;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Evidencias de Inspección Diagnóstica (${comp.nombre}):`, margenX, posY);

        posY += 3;
        const anchoEv = (anchoContenido - 8) / 3;
        const altoEv = 48;

        // Foto 1: FFT
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(margenX, posY, anchoEv, altoEv, 2, 2, 'F');
        if (datos.espectroImg) {
            doc.addImage(datos.espectroImg, 'PNG', margenX + 1, posY + 1, anchoEv - 2, altoEv - 2);
        } else {
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('Espectro FFT (Velocidad)', margenX + (anchoEv / 2) - 18, posY + (altoEv / 2));
        }
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        doc.text('Figura 1: Espectro FFT', margenX + 1, posY + altoEv + 4);

        // Foto 2: Cascada
        const xFoto2 = margenX + anchoEv + 4;
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(xFoto2, posY, anchoEv, altoEv, 2, 2, 'F');
        if (datos.cascadaImg) {
            doc.addImage(datos.cascadaImg, 'PNG', xFoto2 + 1, posY + 1, anchoEv - 2, altoEv - 2);
        } else {
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('Cascada / PeakVue', xFoto2 + (anchoEv / 2) - 16, posY + (altoEv / 2));
        }
        doc.text('Figura 2: Cascada / PeakVue', xFoto2 + 1, posY + altoEv + 4);

        // Foto 3: Termograma
        const xFoto3 = xFoto2 + anchoEv + 4;
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(xFoto3, posY, anchoEv, altoEv, 2, 2, 'F');
        if (datos.termoImg) {
            doc.addImage(datos.termoImg, 'PNG', xFoto3 + 1, posY + 1, anchoEv - 2, altoEv - 2);
        } else {
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('Termograma Infrarrojo', xFoto3 + (anchoEv / 2) - 16, posY + (altoEv / 2));
        }
        doc.text('Figura 3: Termografía Infrarroja', xFoto3 + 1, posY + altoEv + 4);

        posY += altoEv + 9;

        // 5. Diagnóstico Especializado del Componente
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Análisis Espectral & Diagnóstico Técnico — ${comp.nombre}:`, margenX, posY);

        posY += 3;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const lineasDiag = doc.splitTextToSize(datos.diagnostico, anchoContenido - 12);
        const altoDiag = Math.max(16, (lineasDiag.length * 3.8) + 6);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.roundedRect(margenX, posY, anchoContenido, altoDiag, 2, 2, 'FD');
        doc.setTextColor(30, 41, 59);
        doc.text(lineasDiag, margenX + 6, posY + 5);

        posY += altoDiag + 5;

        // 6. Recomendaciones Operacionales
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Acciones Correctivas y Recomendaciones — ${comp.nombre}:`, margenX, posY);

        posY += 3;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const lineasRecom = doc.splitTextToSize(datos.recomendaciones, anchoContenido - 12);
        const altoRecom = Math.max(16, (lineasRecom.length * 3.8) + 6);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.roundedRect(margenX, posY, anchoContenido, altoRecom, 2, 2, 'FD');
        doc.setTextColor(30, 41, 59);
        doc.text(lineasRecom, margenX + 6, posY + 5);

        posY += altoRecom + 5;

        // 7. Gestión SAP PM
        doc.setFillColor(240, 249, 255);
        doc.setDrawColor(56, 189, 248);
        doc.setLineWidth(0.5);
        doc.roundedRect(margenX, posY, anchoContenido, 12, 2, 2, 'FD');

        doc.setFontSize(7.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(2, 132, 199);
        doc.text('GESTIÓN SAP PM:', margenX + 5, posY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        let textoSap = `No se requiere emisión de aviso en SAP PM para este componente.`;
        if (datos.generaAviso) {
            const numAviso = datos.avisoSap ? `N° ${datos.avisoSap.trim()}` : '(Pendiente)';
            textoSap = `Se generará el aviso correspondiente en SAP PM con Prioridad ${datos.prioridadSap} [Aviso: ${numAviso}].`;
        }
        doc.text(textoSap, margenX + 34, posY + 5);

        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text('* Conforme a normativas ISO 20816-3 (Vibración Mecánica) e ISO 18434-1 (Termografía Infrarroja).', margenX + 5, posY + 9.5);
    }

    // Pie de página corporativo con numeración en todas las hojas
    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion,
        textoCentro: `Dossier Técnico Espectral CBM | Emisión: ${fechaImpresion}`,
        margenX
    });

    // Apertura en Visor Interno Interactivo
    abrirVisorPDFInterno(doc, nombreArchivoPDF);
};

export default {
    abrirGraficoTendencia,
    abrirModalAnalisisExperto,
    abrirVisorPDFInterno
};