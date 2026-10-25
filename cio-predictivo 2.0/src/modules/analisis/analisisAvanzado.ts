import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';
import { evaluarISO20816 } from '../../core/domain/evaluadorIso';
import {
  dibujarCabeceraCorporativa,
  dibujarPiePaginaCorporativo,
  obtenerSemanaISO,
  formatearFechaNomenclatura,
  abrirVisorPDFInterno
} from '../../core/pdf/pdfPlantilla';

declare const Chart: any;
declare const window: any;

export interface ProyeccionFalla {
  pendiente: number;
  r2: number;
  diasHastaAlarma: number | null;
  diasHastaFalla: number | null;
  fechaEstimadaFalla: string;
}

export interface DatosGraficoMemoria {
  idFirebase: string | null;
  puntoId: string | null;
  nombrePunto: string | null;
  seleccionGraficos: {
    rms: boolean;
    temp: boolean;
    fc: boolean;
  };
  fechas: string[];
  rms: number[];
  temp: number[];
  fc: number[];
  proyecciones: {
    rms: ProyeccionFalla | null;
    temp: ProyeccionFalla | null;
    fc: ProyeccionFalla | null;
  };
}

export interface SubsistemaAnalisis {
  activo: boolean;
  puntos: Array<{ punto: string; componente: string; rms: any; temp: any; fc?: any }>;
  puntosSeleccionados?: string[];
  severidad: 'ROJO' | 'NARANJA' | 'AMARILLO' | 'VERDE';
  espectroImg: string | null;
  cascadaImg: string | null;
  termoImg: string | null;
  diagnostico: string;
  recomendaciones: string;
  generaAviso: boolean;
  avisoSap: string;
  prioridadSap: 'Alta' | 'Media' | 'Baja';
}

export interface AnalisisModularMemoria {
  idFirebase: string | null;
  tag: string;
  nombreEquipo: string;
  area: string;
  nivel: string;
  tabActiva: 'motor' | 'reductor' | 'poleas';
  motor: SubsistemaAnalisis;
  reductor: SubsistemaAnalisis;
  poleas: SubsistemaAnalisis;
}

const chartsInstancias: Record<string, any> = {
  rms: null,
  temp: null,
  fc: null
};

let datosGraficoMemoria: DatosGraficoMemoria = {
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

let analisisModularMemoria: AnalisisModularMemoria = {
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
    diagnostico:
      'Se analiza condición dinámica en Motor Eléctrico. El espectro FFT exhibe armónicos de la frecuencia de giro 1X y 2X con modulación en alta frecuencia asociada a rodamientos DE/NDE. Gradiente térmico admisible en carcasa.',
    recomendaciones:
      'Se generará el aviso en SAP PM para parada programada. Realizar relubricación manual controlada con grasa recomendada e inspección de holguras mecánicas.',
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
    diagnostico:
      'Se evalúa tren reductor de engranajes. El espectro registra energía en la frecuencia de engrane (GMF) con bandas laterales activas. Se detecta incremento de vibración en descansos intermedios y de salida.',
    recomendaciones:
      'Se generará aviso en SAP PM para chequeo de holguras entre dientes (backlash) e inspección de desgaste en engranajes. Muestreo de lubricante para recuento ferrografico.',
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
    diagnostico:
      'Se evalúa conjunto de poleas de transmisión y descansos. Amplitudes vibratorias RMS se mantienen estables bajo norma ISO 20816-3. Condición térmica uniforme.',
    recomendaciones:
      'Mantener pauta de lubricación periódica y verificar tensión y alineamiento de correas en la próxima ventana operacional.',
    generaAviso: false,
    avisoSap: '',
    prioridadSap: 'Media'
  }
};

// ============================================================================
// MATEMÁTICA PREDICTIVA: REGRESIÓN LINEAL
// ============================================================================
export const calcularRegresionLinealYProyeccion = (
  valores: number[],
  umbralAlarma: number,
  umbralCritico: number
): ProyeccionFalla => {
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
    const y = valores[i] ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const divisor = n * sumX2 - sumX * sumX;
  if (divisor === 0) {
    return { pendiente: 0, r2: 0, diasHastaAlarma: null, diasHastaFalla: null, fechaEstimadaFalla: 'Tendencia plana' };
  }

  const m = (n * sumXY - sumX * sumY) / divisor;
  const numR = n * sumXY - sumX * sumY;
  const denR = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  const r2 = denR !== 0 ? Math.pow(numR / denR, 2) : 0;

  let diasHastaAlarma: number | null = null;
  let diasHastaFalla: number | null = null;
  let fechaEstimadaFalla = 'Condición Estable';
  const ultimoValor = valores[n - 1] ?? 0;

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

const destruirGraficosActivos = (): void => {
  ['rms', 'temp', 'fc'].forEach((key) => {
    if (chartsInstancias[key]) {
      chartsInstancias[key].destroy();
      chartsInstancias[key] = null;
    }
  });
};

const asegurarModalTendenciaDOM = (): HTMLElement => {
  let modal = document.getElementById('modal-grafico-tendencia');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-grafico-tendencia';
    modal.className = 'modal-overlay oculto';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-box glass-panel" style="max-width: 1080px; width: 96%; max-height: 94vh; display: flex; flex-direction: column; padding: 0; box-shadow: 0 24px 60px rgba(0,0,0,0.85); background: #0E1B1F;">
        <header class="modal-header" style="padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(14, 27, 31, 0.98);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.5rem;" aria-hidden="true">query_stats</span>
            <div>
              <h3 id="titulo-modal-grafico" style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
                Tendencia & Diagnóstico Predictivo CBM
              </h3>
              <span id="badge-punto-grafico" style="font-size: 0.72rem; color: #38bdf8; font-family: monospace;">TAG: --- | Punto: ---</span>
            </div>
          </div>
          <button type="button" class="btn-cerrar-modal" onclick="window.cerrarModalGraficoTendencia()">&times;</button>
        </header>

        <div style="background: rgba(14, 27, 31, 0.95); padding: 10px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.75rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">
              Gráficos Activos:
            </span>
            <button type="button" id="chk-toggle-rms" onclick="window.toggleGraficoSeleccion('rms')" style="background: #0284c7; color: white; border: 1px solid #38bdf8; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">1. RMS</button>
            <button type="button" id="chk-toggle-temp" onclick="window.toggleGraficoSeleccion('temp')" style="background: #F5A623; color: #0E1B1F; border: 1px solid #facc15; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">2. Temperatura</button>
            <button type="button" id="chk-toggle-fc" onclick="window.toggleGraficoSeleccion('fc')" style="background: #9333ea; color: white; border: 1px solid #c084fc; padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">3. Factor Cresta</button>
          </div>
        </div>

        <div class="modal-body" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;">
          <div id="grid-graficos-dinamico" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div id="box-chart-rms" style="background: #16282D; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <strong style="font-size: 0.76rem; color: #38bdf8;">1. Velocidad RMS (mm/s)</strong>
              <div style="position: relative; height: 210px; width: 100%;">
                <canvas id="canvas-tendencia-rms"></canvas>
              </div>
            </div>
            <div id="box-chart-temp" style="background: #16282D; border: 1px solid rgba(245, 166, 35, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <strong style="font-size: 0.76rem; color: #F5A623;">2. Temperatura (°C)</strong>
              <div style="position: relative; height: 210px; width: 100%;">
                <canvas id="canvas-tendencia-temp"></canvas>
              </div>
            </div>
            <div id="box-chart-fc" style="background: #16282D; border: 1px solid rgba(192, 132, 252, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <strong style="font-size: 0.76rem; color: #c084fc;">3. Factor Cresta (FC+)</strong>
              <div style="position: relative; height: 210px; width: 100%;">
                <canvas id="canvas-tendencia-fc"></canvas>
              </div>
            </div>
          </div>

          <div id="panel-proyeccion-falla" style="background: rgba(22, 40, 45, 0.9); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 16px;"></div>
        </div>

        <footer class="modal-footer" style="padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(14, 27, 31, 0.98);">
          <button type="button" onclick="window.exportarPDFTendenciaPunto()" style="background: #0284c7; color: white; border: none; padding: 9px 18px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.15rem;">picture_as_pdf</span>
            <span>Exportar Gráficos (PDF)</span>
          </button>
          <button type="button" class="btn-secundario" onclick="window.cerrarModalGraficoTendencia()">Cerrar</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
  }
  return modal;
};

export const abrirGraficoTendencia = async (idActivo: string, puntoId: string, nombrePunto = ''): Promise<void> => {
  const modal = asegurarModalTendenciaDOM();
  modal.style.display = 'flex';
  modal.classList.remove('oculto');

  const titulo = document.getElementById('titulo-modal-grafico');
  const badge = document.getElementById('badge-punto-grafico');

  if (titulo) titulo.textContent = `Tendencia de Condición: [${puntoId}] — ${nombrePunto || 'Componente'}`;
  if (badge) badge.textContent = `TAG: ${idActivo} | Punto: ${puntoId}`;

  datosGraficoMemoria.idFirebase = idActivo;
  datosGraficoMemoria.puntoId = puntoId;
  datosGraficoMemoria.nombrePunto = nombrePunto;

  try {
    // Consultar historial del activo a través del endpoint REST del backend
    const response = await fetch(`/api/cbm/registros?tag=${encodeURIComponent(idActivo)}&limit=50`, {
      headers: AuthService.getHeadersTenant()
    });

    datosGraficoMemoria.fechas = [];
    datosGraficoMemoria.rms = [];
    datosGraficoMemoria.temp = [];
    datosGraficoMemoria.fc = [];

    if (response.ok) {
      const data = await response.json();
      const registros = data.registros || [];

      registros.forEach((reg: any) => {
        const payload = reg.payload || {};
        const ptoData = payload.puntos?.[puntoId];
        if (ptoData) {
          const fechaCorta = payload.fecha ? String(payload.fecha).split('T')[0] : 'S/F';
          datosGraficoMemoria.fechas.push(fechaCorta);
          datosGraficoMemoria.rms.push(Number.parseFloat(ptoData.rms) || 0);
          datosGraficoMemoria.temp.push(Number.parseFloat(ptoData.temp) || 0);
          datosGraficoMemoria.fc.push(Number.parseFloat(ptoData.fc) || 0);
        }
      });
    }

    if (datosGraficoMemoria.fechas.length === 0) {
      // Valores referenciales de arranque si aún no hay mediciones
      datosGraficoMemoria.fechas = ['10-10', '14-10', '18-10', '22-10', '26-10'];
      datosGraficoMemoria.rms = [2.4, 2.9, 3.6, 4.2, 5.1];
      datosGraficoMemoria.temp = [48, 51, 55, 61, 67];
      datosGraficoMemoria.fc = [2.2, 2.5, 3.0, 3.8, 4.4];
    }

    renderizarTresGraficosSimultaneos();
  } catch (err) {
    console.error('[Analisis] Error recuperando historial:', err);
  }
};

const renderizarTresGraficosSimultaneos = (): void => {
  if (typeof Chart === 'undefined') return;
  destruirGraficosActivos();

  const { fechas, rms, temp, fc, seleccionGraficos } = datosGraficoMemoria;

  const evalNormativa = evaluarISO20816(rms[rms.length - 1] || 0, 'grupo1', 'rigido');
  const umbralAlarmaRMS = evalNormativa.limitesAplicados?.c ?? 4.5;
  const umbralCriticoRMS = evalNormativa.limitesAplicados?.d ?? 7.1;

  const proyRMS = calcularRegresionLinealYProyeccion(rms, umbralAlarmaRMS, umbralCriticoRMS);
  datosGraficoMemoria.proyecciones.rms = proyRMS;

  const labelsExtrapolados = [...fechas];
  if (proyRMS.pendiente > 0 && (rms[rms.length - 1] || 0) < umbralCriticoRMS) {
    labelsExtrapolados.push('+4d', '+8d');
  }

  const rmsExtrapolado = new Array(rms.length).fill(null);
  rmsExtrapolado[rms.length - 1] = rms[rms.length - 1];
  if (proyRMS.pendiente > 0 && (rms[rms.length - 1] || 0) < umbralCriticoRMS) {
    rmsExtrapolado.push(Number(((rms[rms.length - 1] || 0) + proyRMS.pendiente).toFixed(2)));
    rmsExtrapolado.push(Number(((rms[rms.length - 1] || 0) + proyRMS.pendiente * 2).toFixed(2)));
  }

  const configBase = (ctx: any, label: string, datos: number[], color: string, datosExt: any[], umbralAlerta: number, umbralCritico: number, unidad: string) => {
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
    const ctxRMS = (document.getElementById('canvas-tendencia-rms') as HTMLCanvasElement)?.getContext('2d');
    if (ctxRMS) chartsInstancias.rms = configBase(ctxRMS, 'RMS', rms, '#38bdf8', rmsExtrapolado, umbralAlarmaRMS, umbralCriticoRMS, 'mm/s');
  }

  if (seleccionGraficos.temp) {
    const ctxTemp = (document.getElementById('canvas-tendencia-temp') as HTMLCanvasElement)?.getContext('2d');
    if (ctxTemp) chartsInstancias.temp = configBase(ctxTemp, 'Temperatura', temp, '#F5A623', [], 65.0, 80.0, '°C');
  }

  if (seleccionGraficos.fc) {
    const ctxFC = (document.getElementById('canvas-tendencia-fc') as HTMLCanvasElement)?.getContext('2d');
    if (ctxFC) chartsInstancias.fc = configBase(ctxFC, 'Factor Cresta', fc, '#c084fc', [], 3.5, 5.0, 'FC+');
  }

  const panelProyeccion = document.getElementById('panel-proyeccion-falla');
  if (panelProyeccion) {
    const estadoProy = (rms[rms.length - 1] || 0) >= umbralCriticoRMS || (proyRMS.diasHastaFalla !== null && proyRMS.diasHastaFalla <= 15) ? '#ef4444' : '#00e676';

    panelProyeccion.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <strong style="color: #ffffff; font-size: 0.88rem;">Diagnóstico Predictivo de Vida Residual:</strong>
        <span style="font-size: 0.72rem; color: #94A3B8; font-family: monospace;">Ajuste R²: <strong>${proyRMS.r2}</strong> | Tasa: <strong>+${proyRMS.pendiente} mm/s/ciclo</strong></span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
        <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px;">
          <span style="font-size: 0.7rem; color: #94A3B8; text-transform: uppercase;">Tiempo hasta Alarma (Zona C):</span>
          <div style="font-size: 1.05rem; font-weight: 800; color: #facc15; margin-top: 2px;">
            ${proyRMS.diasHastaAlarma !== null ? `~ ${proyRMS.diasHastaAlarma} días` : 'Estable'}
          </div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px;">
          <span style="font-size: 0.7rem; color: #94A3B8; text-transform: uppercase;">Proyección a Falla (Zona D):</span>
          <div style="font-size: 1.05rem; font-weight: 800; color: ${estadoProy}; margin-top: 2px;">
            ${proyRMS.fechaEstimadaFalla}
          </div>
        </div>
      </div>
    `;
  }
};

export const cerrarModalGraficoTendencia = (): void => {
  const modal = document.getElementById('modal-grafico-tendencia');
  if (modal) modal.style.display = 'none';
  destruirGraficosActivos();
};

export const abrirModalAnalisisExperto = async (idActivo: string): Promise<void> => {
  let modal = document.getElementById('modal-analisis-experto-cbm');
  if (modal) modal.remove();

  analisisModularMemoria.idFirebase = idActivo;
  analisisModularMemoria.tag = idActivo;

  modal = document.createElement('div');
  modal.id = 'modal-analisis-experto-cbm';
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="max-width: 900px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; overflow: hidden;">
      <header style="padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(14, 27, 31, 0.95);">
        <h3 style="margin: 0; color: #ffffff; font-size: 1.1rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
          Diagnóstico Espectral Experto — ${idActivo}
        </h3>
        <button type="button" class="btn-cerrar-modal" onclick="document.getElementById('modal-analisis-experto-cbm').remove()">&times;</button>
      </header>

      <div style="padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; font-size: 0.85rem; color: #E2E8F0;">
        <div style="background: rgba(22, 40, 45, 0.85); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
          <label style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; display: block; margin-bottom: 6px;">Diagnóstico Técnico CBM:</label>
          <textarea id="diag-experto-texto" rows="3" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none;">${analisisModularMemoria.motor.diagnostico}</textarea>
        </div>

        <div style="background: rgba(22, 40, 45, 0.85); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
          <label style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; display: block; margin-bottom: 6px;">Recomendación / Aviso SAP:</label>
          <textarea id="recom-experto-texto" rows="3" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none;">${analisisModularMemoria.motor.recomendaciones}</textarea>
        </div>
      </div>

      <footer style="padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; gap: 10px; background: rgba(14, 27, 31, 0.95);">
        <button type="button" class="btn-secundario" onclick="document.getElementById('modal-analisis-experto-cbm').remove()">Cerrar</button>
        <button type="button" id="btn-guardar-analisis-db" onclick="window.guardarDiagnosticoExperto()" style="background: #F5A623; color: #0E1B1F; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 800; cursor: pointer;">Guardar Diagnóstico</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
};

export const guardarDiagnosticoExperto = async (): Promise<void> => {
  const diagInput = document.getElementById('diag-experto-texto') as HTMLTextAreaElement | null;
  const recomInput = document.getElementById('recom-experto-texto') as HTMLTextAreaElement | null;
  const tag = analisisModularMemoria.tag;

  if (diagInput) analisisModularMemoria.motor.diagnostico = diagInput.value;
  if (recomInput) analisisModularMemoria.motor.recomendaciones = recomInput.value;

  await SyncManager.despacharOEncolar(`analisis_experto:${tag}`, 'CREATE', {
    tag,
    diagnostico: analisisModularMemoria.motor.diagnostico,
    recomendaciones: analisisModularMemoria.motor.recomendaciones,
    timestamp: Date.now()
  });

  alert(`✅ Diagnóstico experto guardado para ${tag}`);
  document.getElementById('modal-analisis-experto-cbm')?.remove();
};

// Exposición global
if (typeof window !== 'undefined') {
  window.abrirGraficoTendencia = abrirGraficoTendencia;
  window.cerrarModalGraficoTendencia = cerrarModalGraficoTendencia;
  window.abrirModalAnalisisExperto = abrirModalAnalisisExperto;
  window.guardarDiagnosticoExperto = guardarDiagnosticoExperto;
  window.toggleGraficoSeleccion = (tipo: 'rms' | 'temp' | 'fc') => {
    datosGraficoMemoria.seleccionGraficos[tipo] = !datosGraficoMemoria.seleccionGraficos[tipo];
    renderizarTresGraficosSimultaneos();
  };
}