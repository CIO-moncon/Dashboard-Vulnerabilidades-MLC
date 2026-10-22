// ============================================================================
// MÓDULO UI: JS/UI/ANALISIS.JS (v2.9.0 - Renderizado HD Sin Distorsión en PDF)
// CIO PREDICTIVO 2.0 — Tendencias Triples, Regresión Lineal y Dossier CBM
// Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.
// ============================================================================

import { auth, db } from '../core/firebase-config.js';
import { evaluarISO20816 } from '../domain/evaluador-iso.js';
import {
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    resolverPaletaSeveridadISO,
    obtenerSemanaISO,
    formatearFechaNomenclatura,
    abrirVisorPDFInterno
} from '../core/pdf-plantilla.js';

let chartsInstancias = {
    rms: null,
    temp: null,
    fc: null
};

let datosGraficoMemoria = {
    idFirebase: null,
    puntoId: null,
    nombrePunto: null,
    seleccionGraficos: {
        rms: true,
        temp: true,
        fc: true
    },
    fechas: [],
    rms: [],
    temp: [],
    fc: [],
    proyecciones: {
        rms: null,
        temp: null,
        fc: null
    }
};

let analisisModularMemoria = {
    idFirebase: null,
    tag: '',
    nombreEquipo: '',
    area: '',
    nivel: '',
    tabActiva: 'motor',
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

// ============================================================================
// MATEMÁTICA PREDICTIVA: REGRESIÓN LINEAL
// ============================================================================
const calcularRegresionLinealYProyeccion = (valores, umbralAlarma, umbralCritico) => {
    const n = valores.length;
    if (n < 2) {
        return { pendiente: 0, r2: 0, diasHastaAlarma: null, diasHastaFalla: null, fechaEstimadaFalla: 'Insuficientes datos' };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
        const x = i;
        const y = valores[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }

    const divisor = (n * sumX2 - sumX * sumX);
    if (divisor === 0) return { pendiente: 0, r2: 0, diasHastaAlarma: null, diasHastaFalla: null, fechaEstimadaFalla: 'Tendencia plana' };

    const m = (n * sumXY - sumX * sumY) / divisor;
    const numR = (n * sumXY - sumX * sumY);
    const denR = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r2 = denR !== 0 ? Math.pow(numR / denR, 2) : 0;

    let diasHastaAlarma = null;
    let diasHastaFalla = null;
    let fechaEstimadaFalla = 'Condición Estable';
    const ultimoValor = valores[n - 1];

    if (ultimoValor >= umbralCritico) {
        fechaEstimadaFalla = '¡CONDICIÓN CRÍTICA ALCANZADA!';
        diasHastaFalla = 0;
        diasHastaAlarma = 0;
    } else if (m > 0.01) {
        const pasosAlarma = Math.max(0, (umbralAlarma - ultimoValor) / m);
        const pasosCritico = Math.max(0, (umbralCritico - ultimoValor) / m);

        diasHastaAlarma = Math.round(pasosAlarma * 3.5);
        diasHastaFalla = Math.round(pasosCritico * 3.5);

        const fechaFutura = new Date();
        fechaFutura.setDate(fechaFutura.getDate() + diasHastaFalla);
        fechaEstimadaFalla = `~ ${fechaFutura.toLocaleDateString('es-CL')} (${diasHastaFalla} días)`;
    }

    return {
        pendiente: Number(m.toFixed(3)),
        r2: Number(r2.toFixed(2)),
        diasHastaAlarma,
        diasHastaFalla,
        fechaEstimadaFalla
    };
};

// ============================================================================
// UTILIDADES CINEMÁTICAS
// ============================================================================
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

// ============================================================================
// MODAL DE TENDENCIAS EN PANTALLA
// ============================================================================
const destruirGraficosActivos = () => {
    ['rms', 'temp', 'fc'].forEach((key) => {
        if (chartsInstancias[key]) {
            chartsInstancias[key].destroy();
            chartsInstancias[key] = null;
        }
    });
};

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
            <div class="modal-box glass-panel" style="max-width: 1080px; width: 96%; max-height: 94vh; display: flex; flex-direction: column; padding: 0; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
                
                <header class="modal-header" style="padding: 14px 20px; border-bottom: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.98);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.5rem;" aria-hidden="true">query_stats</span>
                        <div>
                            <h3 id="titulo-modal-grafico" style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800;">
                                Tendencia & Diagnóstico Predictivo CBM
                            </h3>
                            <span id="badge-punto-grafico" style="font-size: 0.72rem; color: #38bdf8; font-family: monospace;">TAG: --- | Punto: ---</span>
                        </div>
                    </div>
                    <button type="button" class="btn-cerrar-modal" onclick="window.cerrarModalGraficoTendencia()">&times;</button>
                </header>

                <div style="background: rgba(11, 17, 32, 0.95); padding: 10px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                            Gráficos Activos en Pantalla & Exportación:
                        </span>
                        
                        <button type="button" id="chk-toggle-rms" onclick="window.toggleGraficoSeleccion('rms')" style="background: #0284c7; color: white; border: 1px solid #38bdf8; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">check_box</span>
                            <span>1. Velocidad RMS</span>
                        </button>

                        <button type="button" id="chk-toggle-temp" onclick="window.toggleGraficoSeleccion('temp')" style="background: #f59e0b; color: #0f172a; border: 1px solid #facc15; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">check_box</span>
                            <span>2. Temperatura</span>
                        </button>

                        <button type="button" id="chk-toggle-fc" onclick="window.toggleGraficoSeleccion('fc')" style="background: #9333ea; color: white; border: 1px solid #c084fc; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">check_box</span>
                            <span>3. Factor Cresta</span>
                        </button>
                    </div>

                    <span style="font-size: 0.7rem; color: #38bdf8; font-family: monospace;">* La selección aplica en vivo y a la exportación PDF</span>
                </div>

                <div class="modal-body" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;">
                    
                    <div id="grid-graficos-dinamico" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                        
                        <div id="box-chart-rms" style="background: #0b1120; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="font-size: 0.76rem; color: #38bdf8;">1. Velocidad RMS (mm/s)</strong>
                                <span id="lbl-val-rms" style="font-size: 0.76rem; color: #ffffff; font-family: monospace; font-weight: 800;">--</span>
                            </div>
                            <div style="position: relative; height: 210px; width: 100%;">
                                <canvas id="canvas-tendencia-rms"></canvas>
                            </div>
                        </div>

                        <div id="box-chart-temp" style="background: #0b1120; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="font-size: 0.76rem; color: #f59e0b;">2. Temperatura (°C)</strong>
                                <span id="lbl-val-temp" style="font-size: 0.76rem; color: #ffffff; font-family: monospace; font-weight: 800;">--</span>
                            </div>
                            <div style="position: relative; height: 210px; width: 100%;">
                                <canvas id="canvas-tendencia-temp"></canvas>
                            </div>
                        </div>

                        <div id="box-chart-fc" style="background: #0b1120; border: 1px solid rgba(192, 132, 252, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="font-size: 0.76rem; color: #c084fc;">3. Factor Cresta (FC+)</strong>
                                <span id="lbl-val-fc" style="font-size: 0.76rem; color: #ffffff; font-family: monospace; font-weight: 800;">--</span>
                            </div>
                            <div style="position: relative; height: 210px; width: 100%;">
                                <canvas id="canvas-tendencia-fc"></canvas>
                            </div>
                        </div>

                    </div>

                    <div id="panel-proyeccion-falla" style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 16px;"></div>

                    <div style="background: rgba(11, 17, 32, 0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 14px;">
                        <span style="font-size: 0.74rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                            Historial Cronológico de Inspecciones en Faena:
                        </span>
                        <div id="contenedor-tabla-historial-rapido" style="overflow-x: auto; margin-top: 6px;"></div>
                    </div>

                </div>

                <footer class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border-glass, rgba(255,255,255,0.1)); display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.98);">
                    <button type="button" 
                            id="btn-exportar-pdf-tendencias"
                            onclick="window.exportarPDFTendenciaPunto()" 
                            style="background: #0284c7; color: white; border: none; padding: 9px 18px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);">
                        <span class="material-symbols-outlined" style="font-size: 1.15rem;">picture_as_pdf</span>
                        <span>Imprimir / Exportar Gráficos Seleccionados (PDF)</span>
                    </button>

                    <button type="button" class="btn-secundario" onclick="window.cerrarModalGraficoTendencia()">Cerrar</button>
                </footer>
            </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
};

window.toggleGraficoSeleccion = (tipo) => {
    datosGraficoMemoria.seleccionGraficos[tipo] = !datosGraficoMemoria.seleccionGraficos[tipo];
    
    const activos = Object.values(datosGraficoMemoria.seleccionGraficos).filter(Boolean).length;
    if (activos === 0) {
        datosGraficoMemoria.seleccionGraficos[tipo] = true;
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Debe mantener al menos un gráfico visible.', 'alerta');
        }
        return;
    }

    actualizarBotonesToggleYGrid();
    renderizarTresGraficosSimultaneos();
};

const actualizarBotonesToggleYGrid = () => {
    const { rms, temp, fc } = datosGraficoMemoria.seleccionGraficos;

    const actualizarBtn = (id, activo, colorHex) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const icon = btn.querySelector('.material-symbols-outlined');
        if (activo) {
            btn.style.background = colorHex;
            btn.style.color = id === 'chk-toggle-temp' ? '#0f172a' : '#ffffff';
            btn.style.opacity = '1';
            if (icon) icon.textContent = 'check_box';
        } else {
            btn.style.background = 'rgba(255,255,255,0.06)';
            btn.style.color = '#94a3b8';
            btn.style.opacity = '0.6';
            if (icon) icon.textContent = 'check_box_outline_blank';
        }
    };

    actualizarBtn('chk-toggle-rms', rms, '#0284c7');
    actualizarBtn('chk-toggle-temp', temp, '#f59e0b');
    actualizarBtn('chk-toggle-fc', fc, '#9333ea');

    const boxRMS = document.getElementById('box-chart-rms');
    const boxTemp = document.getElementById('box-chart-temp');
    const boxFC = document.getElementById('box-chart-fc');

    if (boxRMS) boxRMS.style.display = rms ? 'flex' : 'none';
    if (boxTemp) boxTemp.style.display = temp ? 'flex' : 'none';
    if (boxFC) boxFC.style.display = fc ? 'flex' : 'none';

    const grid = document.getElementById('grid-graficos-dinamico');
    if (grid) {
        const cantidad = [rms, temp, fc].filter(Boolean).length;
        grid.style.gridTemplateColumns = `repeat(${cantidad || 1}, 1fr)`;
    }
};

export const abrirGraficoTendencia = async (idFirebase, puntoId, nombrePunto = '') => {
    const modal = asegurarModalTendenciaDOM();
    modal.style.display = 'flex';
    modal.classList.remove('oculto');

    const titulo = document.getElementById('titulo-modal-grafico');
    const badge = document.getElementById('badge-punto-grafico');

    if (titulo) titulo.textContent = `Tendencia de Condición Mecánica: [${puntoId}] — ${nombrePunto || 'Componente'}`;
    if (badge) badge.textContent = `TAG: ${idFirebase} | Punto Cinemático: ${puntoId}`;

    datosGraficoMemoria.idFirebase = idFirebase;
    datosGraficoMemoria.puntoId = puntoId;
    datosGraficoMemoria.nombrePunto = nombrePunto;

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
            datosGraficoMemoria.fechas = ['01/10', '05/10', '09/10', '13/10', '17/10', '21/10'];
            datosGraficoMemoria.rms = [3.2, 3.8, 4.4, 5.1, 5.8, 6.4];
            datosGraficoMemoria.temp = [45, 48, 52, 57, 62, 68];
            datosGraficoMemoria.fc = [2.6, 2.9, 3.4, 4.1, 4.9, 5.6];
        }

        actualizarBotonesToggleYGrid();
        renderizarTresGraficosSimultaneos();
    } catch (err) {
        console.error('[Analisis] Error recuperando historial:', err);
    }
};

const renderizarTresGraficosSimultaneos = () => {
    if (typeof Chart === 'undefined') return;
    destruirGraficosActivos();

    const { fechas, rms, temp, fc, seleccionGraficos } = datosGraficoMemoria;

    const evalNormativa = evaluarISO20816(rms[rms.length - 1] || 0, 'grupo1', 'rigido');
    const umbralAlarmaRMS = evalNormativa.limitesAplicados?.c ?? 4.5;
    const umbralCriticoRMS = evalNormativa.limitesAplicados?.d ?? 7.1;
    const proyRMS = calcularRegresionLinealYProyeccion(rms, umbralAlarmaRMS, umbralCriticoRMS);
    datosGraficoMemoria.proyecciones.rms = proyRMS;

    const proyTemp = calcularRegresionLinealYProyeccion(temp, 65.0, 80.0);
    datosGraficoMemoria.proyecciones.temp = proyTemp;

    const proyFC = calcularRegresionLinealYProyeccion(fc, 3.5, 5.0);
    datosGraficoMemoria.proyecciones.fc = proyFC;

    const labelsExtrapolados = [...fechas];
    if (proyRMS.pendiente > 0 && (rms[rms.length - 1] || 0) < umbralCriticoRMS) {
        labelsExtrapolados.push('+4d', '+8d');
    }

    const rmsExtrapolado = new Array(rms.length).fill(null);
    rmsExtrapolado[rms.length - 1] = rms[rms.length - 1];
    if (proyRMS.pendiente > 0 && (rms[rms.length - 1] || 0) < umbralCriticoRMS) {
        rmsExtrapolado.push(Number((rms[rms.length - 1] + proyRMS.pendiente).toFixed(2)));
        rmsExtrapolado.push(Number((rms[rms.length - 1] + (proyRMS.pendiente * 2)).toFixed(2)));
    }

    const lblRMS = document.getElementById('lbl-val-rms');
    const lblTemp = document.getElementById('lbl-val-temp');
    const lblFC = document.getElementById('lbl-val-fc');
    if (lblRMS) lblRMS.textContent = `${rms[rms.length - 1] || 0} mm/s`;
    if (lblTemp) lblTemp.textContent = `${temp[temp.length - 1] || 0} °C`;
    if (lblFC) lblFC.textContent = `${fc[fc.length - 1] || 0}`;

    const configBase = (ctx, label, datos, color, datosExt, umbralAlerta, umbralCritico, unidad) => {
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsExtrapolados,
                datasets: [
                    {
                        label: `${label} (${unidad})`,
                        data: datos,
                        borderColor: color,
                        backgroundColor: `${color}20`,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.2,
                        fill: true
                    },
                    {
                        label: 'Proyección',
                        data: datosExt,
                        borderColor: '#a855f7',
                        borderWidth: 2,
                        borderDash: [4, 4],
                        pointRadius: 3,
                        pointBackgroundColor: '#a855f7',
                        fill: false
                    },
                    {
                        label: `Alarma (${umbralAlerta})`,
                        data: labelsExtrapolados.map(() => umbralAlerta),
                        borderColor: '#f97316',
                        borderWidth: 1.2,
                        borderDash: [5, 4],
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: `Crítico (${umbralCritico})`,
                        data: labelsExtrapolados.map(() => umbralCritico),
                        borderColor: '#ef4444',
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#cbd5e1', font: { size: 9, weight: '700' } } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } }
                }
            }
        });
    };

    if (seleccionGraficos.rms) {
        const ctxRMS = document.getElementById('canvas-tendencia-rms')?.getContext('2d');
        if (ctxRMS) chartsInstancias.rms = configBase(ctxRMS, 'RMS', rms, '#38bdf8', rmsExtrapolado, umbralAlarmaRMS, umbralCriticoRMS, 'mm/s');
    }

    if (seleccionGraficos.temp) {
        const ctxTemp = document.getElementById('canvas-tendencia-temp')?.getContext('2d');
        if (ctxTemp) chartsInstancias.temp = configBase(ctxTemp, 'Temperatura', temp, '#f59e0b', [], 65.0, 80.0, '°C');
    }

    if (seleccionGraficos.fc) {
        const ctxFC = document.getElementById('canvas-tendencia-fc')?.getContext('2d');
        if (ctxFC) chartsInstancias.fc = configBase(ctxFC, 'Factor Cresta', fc, '#c084fc', [], 3.5, 5.0, 'FC+');
    }

    const panelProyeccion = document.getElementById('panel-proyeccion-falla');
    if (panelProyeccion) {
        const estadoProy = (rms[rms.length - 1] || 0) >= umbralCriticoRMS || (proyRMS.diasHastaFalla !== null && proyRMS.diasHastaFalla <= 15) ? '#ef4444' : '#00e676';

        panelProyeccion.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="color: ${estadoProy}; font-size: 1.3rem;">insights</span>
                    <strong style="color: #ffffff; font-size: 0.88rem;">Diagnóstico Predictivo de Vida Residual (Velocidad RMS):</strong>
                </div>
                <span style="font-size: 0.72rem; color: #94a3b8; font-family: monospace;">Ajuste R²: <strong>${proyRMS.r2}</strong> | Tasa: <strong>+${proyRMS.pendiente} mm/s/ciclo</strong></span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
                <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px;">
                    <span style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase;">Estimación hasta Alarma (Zona C):</span>
                    <div style="font-size: 1.05rem; font-weight: 800; color: #facc15; margin-top: 2px;">
                        ${proyRMS.diasHastaAlarma !== null ? `~ ${proyRMS.diasHastaAlarma} días` : 'No proyectado (Estable)'}
                    </div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px;">
                    <span style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase;">Proyección a Falla Crítica (Zona D):</span>
                    <div style="font-size: 1.05rem; font-weight: 800; color: ${estadoProy}; margin-top: 2px;">
                        ${proyRMS.fechaEstimadaFalla}
                    </div>
                </div>
            </div>
        `;
    }

    const tablaContainer = document.getElementById('contenedor-tabla-historial-rapido');
    if (tablaContainer) {
        tablaContainer.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.78rem; font-family: monospace;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
                        <th style="padding: 6px;">Fecha</th>
                        ${seleccionGraficos.rms ? '<th style="padding: 6px;">RMS (mm/s)</th>' : ''}
                        ${seleccionGraficos.temp ? '<th style="padding: 6px;">Temp (°C)</th>' : ''}
                        ${seleccionGraficos.fc ? '<th style="padding: 6px;">FC+</th>' : ''}
                        <th style="padding: 6px;">Evaluación ISO</th>
                    </tr>
                </thead>
                <tbody>
                    ${fechas.slice(-6).map((f, i) => {
                        const r = rms[i] || 0;
                        const t = temp[i] || 0;
                        const c = fc[i] || 0;
                        let col = '#00e676';
                        let tag = 'Zona A (Óptimo)';
                        if (r >= umbralCriticoRMS || t >= 80) { col = '#ef4444'; tag = 'Zona D (Crítico)'; }
                        else if (r >= umbralAlarmaRMS || t >= 65) { col = '#f97316'; tag = 'Zona C (Alerta)'; }
                        else if (r >= 2.8 || t >= 55) { col = '#eab308'; tag = 'Zona B (Seguimiento)'; }

                        return `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                <td style="padding: 6px; color: #ffffff;">${f}</td>${seleccionGraficos.rms ? `<td style="padding: 6px; font-weight: bold; color: ${col};">${r.toFixed(2)}</td>` : ''}
                                ${seleccionGraficos.temp ? `<td style="padding: 6px; color: #e2e8f0;">${t.toFixed(1)}</td>` : ''}
                                ${seleccionGraficos.fc ? `<td style="padding: 6px; color: #c084fc;">${c.toFixed(2)}</td>` : ''}
                                <td style="padding: 6px; color: ${col}; font-weight: bold;">${tag}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }
};

window.cerrarModalGraficoTendencia = () => {
    const modal = document.getElementById('modal-grafico-tendencia');
    if (modal) modal.style.display = 'none';
    destruirGraficosActivos();
};

// ============================================================================
// MOTOR DE RENDERIZADO HD OFFSCREEN PARA PDF (FONDO BLANCO, SIN DISTORSIÓN)
// ============================================================================
const generarGraficoHDOffscreen = (titulo, labels, datos, colorLínea, datosProy, umbralAlerta, umbralCritico, unidad, anchoPx = 1100, altoPx = 420) => {
    return new Promise((resolve) => {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = anchoPx;
        offCanvas.height = altoPx;
        const ctx = offCanvas.getContext('2d');

        // Fondo blanco puro institucional
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, anchoPx, altoPx);

        const chartOff = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `${titulo} (${unidad})`,
                        data: datos,
                        borderColor: colorLínea,
                        backgroundColor: 'rgba(2, 132, 199, 0.08)',
                        borderWidth: 3.5,
                        pointRadius: 5.5,
                        pointBackgroundColor: colorLínea,
                        tension: 0.2,
                        fill: true
                    },
                    {
                        label: 'Proyección Estimada',
                        data: datosProy,
                        borderColor: '#9333ea',
                        borderWidth: 2.8,
                        borderDash: [6, 5],
                        pointRadius: 4.5,
                        pointBackgroundColor: '#9333ea',
                        fill: false
                    },
                    {
                        label: `Límite Alerta (${umbralAlerta})`,
                        data: labels.map(() => umbralAlerta),
                        borderColor: '#ea580c',
                        borderWidth: 2,
                        borderDash: [8, 5],
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: `Límite Crítico (${umbralCritico})`,
                        data: labels.map(() => umbralCritico),
                        borderColor: '#dc2626',
                        borderWidth: 2.5,
                        borderDash: [5, 4],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                devicePixelRatio: 2, // Calidad Retina HD
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#0f172a',
                            font: { size: 14, weight: 'bold', family: 'helvetica' },
                            padding: 16,
                            boxWidth: 24
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(0, 0, 0, 0.08)' },
                        ticks: { color: '#334155', font: { size: 13, weight: 'bold', family: 'helvetica' } }
                    },
                    y: {
                        grid: { color: 'rgba(0, 0, 0, 0.08)' },
                        ticks: { color: '#334155', font: { size: 13, weight: 'bold', family: 'helvetica' } }
                    }
                }
            }
        });

        setTimeout(() => {
            const dataUrl = offCanvas.toDataURL('image/png', 1.0);
            chartOff.destroy();
            offCanvas.remove();
            resolve(dataUrl);
        }, 120);
    });
};

// ============================================================================
// EXPORTACIÓN A PDF: GRÁFICOS APILADOS EN ALTA RESOLUCIÓN Y PANEL LIMPIO
// ============================================================================
window.exportarPDFTendenciaPunto = async () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert('Librería jsPDF no disponible.');
        return;
    }

    const { idFirebase, puntoId, nombrePunto, fechas, rms, temp, fc, proyecciones, seleccionGraficos } = datosGraficoMemoria;

    const listaGraficosAImprimir = [];
    if (seleccionGraficos.rms) listaGraficosAImprimir.push('rms');
    if (seleccionGraficos.temp) listaGraficosAImprimir.push('temp');
    if (seleccionGraficos.fc) listaGraficosAImprimir.push('fc');

    if (listaGraficosAImprimir.length === 0) {
        alert('Debe tener al menos un gráfico seleccionado para imprimir.');
        return;
    }

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast(`Generando reporte HD con ${listaGraficosAImprimir.length} gráfico(s) apilado(s)...`, 'info');
    }

    const fechaActual = new Date();
    const numSemana = String(obtenerSemanaISO(fechaActual)).padStart(2, '0');
    const fechaImpresion = formatearFechaNomenclatura(fechaActual);
    const tagLimpio = String(idFirebase || 'ACTIVO').trim().toUpperCase();
    const nombreArchivo = `${tagLimpio}_${puntoId}_tendencias_S${numSemana}_(${fechaImpresion}).pdf`;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margenX = 14;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);

    const ultimoRMS = rms[rms.length - 1] || 0;
    let severidadGlobal = 'VERDE';
    if (ultimoRMS >= 7.1) severidadGlobal = 'ROJO';
    else if (ultimoRMS >= 4.5) severidadGlobal = 'NARANJA';
    else if (ultimoRMS >= 2.8) severidadGlobal = 'AMARILLO';

    // 1. Cabecera Corporativa
    await dibujarCabeceraCorporativa(doc, {
        titulo: `REPORTE DE TENDENCIA DE CONDICIÓN — PUNTO ${puntoId}`,
        subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
        referencia: `Análisis Predictivo de Vida Residual | Gráficas HD: ${listaGraficosAImprimir.join(', ').toUpperCase()}`,
        severidad: severidadGlobal,
        textoCondicion: 'ESTADO TENDENCIA',
        margenX
    });

    // 2. Ficha Técnica del Punto
    let posY = 34;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(margenX, posY, anchoContenido, 20, 2, 2, 'FD');

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`TAG: ${tagLimpio}  |  PUNTO: [${puntoId}] — ${nombrePunto || 'Componente Cinemático'}`, margenX + 5, posY + 6.5);

    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Últimos Registros: RMS: ${ultimoRMS.toFixed(2)} mm/s  |  Temp: ${(temp[temp.length - 1] || 0).toFixed(1)} °C  |  FC+: ${(fc[fc.length - 1] || 0).toFixed(2)}`, margenX + 5, posY + 12);
    doc.text(`Fecha Inspección: ${fechas[fechas.length - 1] || fechaImpresion}   |   Semana SAP: S${numSemana}`, margenX + 5, posY + 16.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Responsable CBM: ${auth.currentUser?.email || 'Especialista CBM CPF'}`, margenX + 115, posY + 16.5);

    posY += 24;

    // 3. GENERACIÓN HD OFFSCREEN Y RENDERIZADO APILADO EN PDF
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Gráficas de Tendencia Histórica & Extrapolación (${listaGraficosAImprimir.length}):`, margenX, posY);

    posY += 3;

    // Extrapolación de RMS
    const pRMS = proyecciones.rms || {};
    const labelsExtrap = [...fechas];
    if (pRMS.pendiente > 0 && ultimoRMS < 7.1) labelsExtrap.push('+4d', '+8d');
    const rmsExt = new Array(rms.length).fill(null);
    rmsExt[rms.length - 1] = rms[rms.length - 1];
    if (pRMS.pendiente > 0 && ultimoRMS < 7.1) {
        rmsExt.push(Number((ultimoRMS + pRMS.pendiente).toFixed(2)));
        rmsExt.push(Number((ultimoRMS + (pRMS.pendiente * 2)).toFixed(2)));
    }

    // Renderizar según la cantidad con altura y aspecto proporcional
    if (listaGraficosAImprimir.length === 1) {
        const tipo = listaGraficosAImprimir[0];
        let imgHD = null;
        if (tipo === 'rms') imgHD = await generarGraficoHDOffscreen('Velocidad RMS', labelsExtrap, rms, '#0284c7', rmsExt, 4.5, 7.1, 'mm/s', 1200, 480);
        else if (tipo === 'temp') imgHD = await generarGraficoHDOffscreen('Temperatura Operativa', fechas, temp, '#d97706', [], 65.0, 80.0, '°C', 1200, 480);
        else imgHD = await generarGraficoHDOffscreen('Factor de Cresta', fechas, fc, '#7c3aed', [], 3.5, 5.0, 'FC+', 1200, 480);

        const alto = 75;
        doc.addImage(imgHD, 'PNG', margenX, posY, anchoContenido, alto);
        posY += alto + 6;

    } else if (listaGraficosAImprimir.length === 2) {
        const alto = 48;
        for (const tipo of listaGraficosAImprimir) {
            let imgHD = null;
            if (tipo === 'rms') imgHD = await generarGraficoHDOffscreen('Velocidad RMS', labelsExtrap, rms, '#0284c7', rmsExt, 4.5, 7.1, 'mm/s', 1200, 420);
            else if (tipo === 'temp') imgHD = await generarGraficoHDOffscreen('Temperatura Operativa', fechas, temp, '#d97706', [], 65.0, 80.0, '°C', 1200, 420);
            else imgHD = await generarGraficoHDOffscreen('Factor de Cresta', fechas, fc, '#7c3aed', [], 3.5, 5.0, 'FC+', 1200, 420);

            doc.addImage(imgHD, 'PNG', margenX, posY, anchoContenido, alto);
            posY += alto + 4;
        }

    } else if (listaGraficosAImprimir.length === 3) {
        // Gráfico 1 (RMS principal): Ancho completo arriba con proporción amplia
        const imgRMS = await generarGraficoHDOffscreen('Velocidad RMS', labelsExtrap, rms, '#0284c7', rmsExt, 4.5, 7.1, 'mm/s', 1200, 400);
        const altoPrincipal = 52;
        doc.addImage(imgRMS, 'PNG', margenX, posY, anchoContenido, altoPrincipal);
        posY += altoPrincipal + 4;

        // Gráficos 2 y 3 (Temp y FC+): En 2 columnas con proporción 1.5:1 nítida
        const imgTemp = await generarGraficoHDOffscreen('Temperatura', fechas, temp, '#d97706', [], 65.0, 80.0, '°C', 700, 440);
        const imgFC = await generarGraficoHDOffscreen('Factor Cresta', fechas, fc, '#7c3aed', [], 3.5, 5.0, 'FC+', 700, 440);

        const anchoMedio = (anchoContenido - 4) / 2;
        const altoSecundario = 44;
        doc.addImage(imgTemp, 'PNG', margenX, posY, anchoMedio, altoSecundario);
        doc.addImage(imgFC, 'PNG', margenX + anchoMedio + 4, posY, anchoMedio, altoSecundario);
        posY += altoSecundario + 6;
    }

    // 4. PANEL DE PROYECCIÓN DE VIDA RESIDUAL CORREGIDO (SIN DESBORDE)
    const esCritico = ultimoRMS >= 7.1 || (pRMS.diasHastaFalla !== null && pRMS.diasHastaFalla <= 0);

    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(56, 189, 248);
    doc.setLineWidth(0.5);
    doc.roundedRect(margenX, posY, anchoContenido, 28, 2, 2, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(2, 132, 199);
    doc.text('CÁLCULO PREDICTIVO DE VIDA RESIDUAL (REGRESIÓN LINEAL ISO 20816-3):', margenX + 5, posY + 5.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`• Tasa de Degradación Dinámica (Pendiente m): +${pRMS.pendiente || 0} mm/s por ciclo`, margenX + 6, posY + 11);
    doc.text(`• Coeficiente de Determinación (Ajuste R²): ${pRMS.r2 || 0} (Confiabilidad del modelo)`, margenX + 6, posY + 15.5);
    doc.text(`• Tiempo Estimado hasta Alarma (Zona C): ${pRMS.diasHastaAlarma !== null ? `~ ${pRMS.diasHastaAlarma} días` : 'Estable / Sin tendencia crítica'}`, margenX + 6, posY + 20);

    // Caja destacada de advertencia crítica protegida dentro del ancho
    const anchoCajaAlerta = 82;
    const altoCajaAlerta = 15;
    const xCajaAlerta = margenX + anchoContenido - anchoCajaAlerta - 4;
    const yCajaAlerta = posY + 8.5;

    doc.setFillColor(esCritico ? 254 : 240, esCritico ? 226 : 253, esCritico ? 226 : 244);
    doc.setDrawColor(esCritico ? 239 : 34, esCritico ? 68 : 197, esCritico ? 68 : 94);
    doc.setLineWidth(0.5);
    doc.roundedRect(xCajaAlerta, yCajaAlerta, anchoCajaAlerta, altoCajaAlerta, 2, 2, 'FD');

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(esCritico ? 185 : 21, esCritico ? 28 : 128, esCritico ? 28 : 61);
    doc.text('PROYECCIÓN A CONDICIÓN CRÍTICA (ZONA D):', xCajaAlerta + (anchoCajaAlerta / 2), yCajaAlerta + 5, { align: 'center' });

    doc.setFontSize(7.8);
    doc.text(String(pRMS.fechaEstimadaFalla || 'Condición Estable'), xCajaAlerta + (anchoCajaAlerta / 2), yCajaAlerta + 11, { align: 'center' });

    posY += 33;

    // Salto de página seguro
    if (posY > altoPagina - 45) {
        doc.addPage();
        posY = 20;
    }

    // 5. Tabla de Registro Cronológico
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Registro Cronológico de Mediciones en Terreno:', margenX, posY);

    posY += 3.5;
    doc.setFillColor(30, 41, 59);
    doc.rect(margenX, posY, anchoContenido, 6.5, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('FECHA', margenX + 6, posY + 4.5);
    if (seleccionGraficos.rms) doc.text('RMS (mm/s)', margenX + 45, posY + 4.5);
    if (seleccionGraficos.temp) doc.text('TEMP (°C)', margenX + 85, posY + 4.5);
    if (seleccionGraficos.fc) doc.text('FC+', margenX + 125, posY + 4.5);
    doc.text('ZONA ISO 20816-3', margenX + 155, posY + 4.5);

    posY += 6.5;
    const ultimosRegistros = fechas.slice(-8);

    ultimosRegistros.forEach((f, idx) => {
        const rVal = rms[fechas.indexOf(f)] || 0;
        const tVal = temp[fechas.indexOf(f)] || 0;
        const fcVal = fc[fechas.indexOf(f)] || 0;

        let tagZona = 'Zona A (Óptimo)';
        let colorZona = [22, 163, 74];
        if (rVal >= 7.1 || tVal >= 80) { tagZona = 'Zona D (Crítico)'; colorZona = [220, 38, 38]; }
        else if (rVal >= 4.5 || tVal >= 65) { tagZona = 'Zona C (Alerta)'; colorZona = [234, 88, 12]; }
        else if (rVal >= 2.8 || tVal >= 55) { tagZona = 'Zona B (Seguimiento)'; colorZona = [202, 138, 4]; }

        if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margenX, posY, anchoContenido, 5.5, 'F');
        }

        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(f, margenX + 6, posY + 3.8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        if (seleccionGraficos.rms) doc.text(rVal > 0 ? rVal.toFixed(2) : '--', margenX + 48, posY + 3.8);
        if (seleccionGraficos.temp) doc.text(tVal > 0 ? `${tVal.toFixed(1)}` : '--', margenX + 88, posY + 3.8);
        if (seleccionGraficos.fc) doc.text(fcVal > 0 ? `${fcVal.toFixed(2)}` : '--', margenX + 126, posY + 3.8);

        doc.setTextColor(...colorZona);
        doc.text(tagZona, margenX + 155, posY + 3.8);

        posY += 5.5;
    });

    // 6. Pie de Página Corporativo
    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion,
        textoCentro: `Reporte de Tendencia & Diagnóstico Predictivo | Activo: ${tagLimpio}`,
        margenX
    });

    abrirVisorPDFInterno(doc, nombreArchivo);
};

// ============================================================================
// MODAL DE ANÁLISIS EXPERTO MODULAR (MOTOR, REDUCTOR Y POLEAS)
// ============================================================================
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
                            <span style="background: ${bgTag}; color: ${cText}; border: 1px solid ${cText}; font-size: 0.65rem; font-weight: 900; padding: 2px 6px; border-radius: 4px;">
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

        await dibujarCabeceraCorporativa(doc, {
            titulo: `INFORME ESPECTRAL CBM — ${comp.nombre}`,
            subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
            referencia: `Monitoreo de Frecuencias, FFT, Cascada y Termografía | Activo: ${tag}`,
            severidad: datos.severidad,
            textoCondicion: 'CONDICIÓN CBM',
            margenX
        });

        let posY = 34;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.roundedRect(margenX, posY, anchoContenido, 26, 2, 2, 'FD');

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

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`SEMANA SAP: S${numSemana} (PMS)`, margenX + 102, posY + 7);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Fecha Emisión: ${fechaActual.toLocaleDateString('es-CL')} ${fechaActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margenX + 102, posY + 13);
        doc.text(`Fecha Inspección: ${fechaImpresion}`, margenX + 102, posY + 18);
        doc.text(`Analista: ${auth.currentUser?.email || 'Especialista CBM CPF'}`, margenX + 102, posY + 23);

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

        posY += 5;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Evidencias de Inspección Diagnóstica (${comp.nombre}):`, margenX, posY);

        posY += 3;
        const anchoEv = (anchoContenido - 8) / 3;
        const altoEv = 48;

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

    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion,
        textoCentro: `Dossier Técnico Espectral CBM | Emisión: ${fechaImpresion}`,
        margenX
    });

    abrirVisorPDFInterno(doc, nombreArchivoPDF);
};

export default {
    abrirGraficoTendencia,
    abrirModalAnalisisExperto,
    abrirVisorPDFInterno
};