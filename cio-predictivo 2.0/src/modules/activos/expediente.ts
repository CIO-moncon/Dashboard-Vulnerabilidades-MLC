import { SyncManager } from '../../core/offline/syncManager';
import { UI } from '../layout/notificaciones';
import { generarPDFExpediente } from '../../core/pdf/reportes';
import { argsJson, registrarComando } from '../../core/app/comandos';
import { obtenerDatosEquipos } from '../../core/app/estadoApp';

declare const Chart: any;

export interface RegistroHistoricoPunto {
  fecha: string;
  timestamp: number;
  fuente: 'TERRENO' | 'DYNAMOX';
  rms: number;
  temp: number;
  fc: number;
}

export interface SpotFicha {
  punto: string;
  componente: string;
  direccion?: string;
  fechaUltima?: string;
  anteriorRms?: number;
  anteriorTemp?: number;
  anteriorFc?: number;
  actualFecha?: string;
  actualRms?: number;
  actualTemp?: number;
  actualFc?: number;
  historial?: RegistroHistoricoPunto[];
}

let spotActivoGrafico: string | null = null;
let chartTendenciaInstancia: any = null;
let chartRulInstancia: any = null;
let fuenteVisualizacionActiva: 'TERRENO' | 'DYNAMOX' = 'TERRENO';

// ============================================================================
// 1. EVALUADORES NORMATIVOS INTERNACIONALES
// ============================================================================

/**
 * ISO 20816-3: Evaluación de Vibración Global RMS en velocidad (mm/s)
 */
export const evaluarIso20816_3 = (
  rms: number,
  grupo = 'GRUPO_1',
  soporte = 'RIGIDO',
): { color: string; zona: string; bg: string } => {
  if (rms === undefined || rms === null || isNaN(rms) || rms <= 0) {
    return { color: '#64748B', zona: 'S/D', bg: 'rgba(100, 116, 139, 0.15)' };
  }

  const esFlexible = soporte === 'FLEXIBLE';
  const esGrupo1 = grupo === 'GRUPO_1';

  const limA = esGrupo1 ? (esFlexible ? 4.5 : 2.8) : esFlexible ? 2.3 : 1.4;
  const limB = esGrupo1 ? (esFlexible ? 7.1 : 4.5) : esFlexible ? 4.5 : 2.8;
  const limC = esGrupo1 ? (esFlexible ? 11.0 : 7.1) : esFlexible ? 7.1 : 4.5;

  if (rms <= limA)
    return { color: '#00e676', zona: 'Zona A (Bueno)', bg: 'rgba(0, 230, 118, 0.18)' };
  if (rms <= limB)
    return { color: '#eab308', zona: 'Zona B (Aceptable)', bg: 'rgba(234, 179, 8, 0.18)' };
  if (rms <= limC)
    return { color: '#f97316', zona: 'Zona C (Alerta)', bg: 'rgba(249, 115, 22, 0.18)' };
  return { color: '#ef4444', zona: 'Zona D (Peligro)', bg: 'rgba(239, 68, 68, 0.22)' };
};

/**
 * NETA MTS / ISO 18434-1: Severidad Térmica en Componentes Mecánicos/Rodamientos
 */
export const evaluarNetaIso18434 = (temp: number): { color: string; zona: string; bg: string } => {
  if (temp === undefined || temp === null || isNaN(temp) || temp <= 0) {
    return { color: '#64748B', zona: 'S/D', bg: 'rgba(100, 116, 139, 0.15)' };
  }
  if (temp < 60) return { color: '#00e676', zona: 'Normal (<60°C)', bg: 'rgba(0, 230, 118, 0.18)' };
  if (temp <= 75)
    return { color: '#eab308', zona: 'Seguimiento (60-75°C)', bg: 'rgba(234, 179, 8, 0.18)' };
  if (temp <= 90)
    return { color: '#f97316', zona: 'Alerta (76-90°C)', bg: 'rgba(249, 115, 22, 0.18)' };
  return { color: '#ef4444', zona: 'Crítico (>90°C)', bg: 'rgba(239, 68, 68, 0.22)' };
};

/**
 * ISO 13373-2: Factor de Cresta (FC+ = Peak / RMS) para Detección de Impulsividad en Rodamientos
 */
export const evaluarIso13373_2 = (fc: number): { color: string; zona: string; bg: string } => {
  if (fc === undefined || fc === null || isNaN(fc) || fc <= 0) {
    return { color: '#64748B', zona: 'S/D', bg: 'rgba(100, 116, 139, 0.15)' };
  }
  if (fc <= 3.5)
    return { color: '#00e676', zona: 'Normal (<= 3.5)', bg: 'rgba(0, 230, 118, 0.18)' };
  if (fc <= 6.0)
    return { color: '#eab308', zona: 'Incipiente (3.5 - 6.0)', bg: 'rgba(234, 179, 8, 0.18)' };
  if (fc <= 9.0)
    return {
      color: '#f97316',
      zona: 'Desgaste Pistas (6.0 - 9.0)',
      bg: 'rgba(249, 115, 22, 0.18)',
    };
  return { color: '#ef4444', zona: 'Severo / Desconchado (> 9.0)', bg: 'rgba(239, 68, 68, 0.22)' };
};

import { escaparHTML } from '../../core/utils/sanitizar';

// ============================================================================
// 2. RENDERIZADO DEL EXPEDIENTE Y MATRIZ DE DIGITACIÓN DIRECTA
// ============================================================================
export const renderizarExpediente = async (
  idActivo: string,
  contenedorId = 'espacio-trabajo-dinamico',
): Promise<void> => {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  const datosEquipos = obtenerDatosEquipos();
  const activo =
    datosEquipos[idActivo] || Object.values(datosEquipos).find((e: any) => e.tag === idActivo);

  if (!activo) {
    contenedor.innerHTML = `
      <div style="padding: 3rem; text-align: center; color: #94A3B8;">
        <h3>No se encontró el activo solicitado (${escaparHTML(idActivo)}).</h3>
        <button type="button" data-accion="mapa:renderizar" style="margin-top: 1rem; background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Volver al Geovisor</button>
      </div>
    `;
    return;
  }

  const tagLimpio = escaparHTML(activo.tag);
  const spotsMap: Record<string, SpotFicha> = activo.spots || {};
  const listaSpotsKeys = Object.keys(spotsMap);

  if (!spotActivoGrafico || !spotsMap[spotActivoGrafico]) {
    spotActivoGrafico = listaSpotsKeys[0] || null;
  }

  contenedor.innerHTML = `
    <article class="expediente-tecnico" style="display: flex; flex-direction: column; height: 100%; padding: 1rem 1.25rem; gap: 0.85rem; box-sizing: border-box; overflow-y: auto;">
      
      <!-- CABECERA DE LA FICHA -->
      <header style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; background: rgba(14, 27, 31, 0.95); padding: 12px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 10px; height: 44px; border-radius: 4px; background: #38bdf8; box-shadow: 0 0 10px #38bdf8;"></div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 style="margin: 0; color: #ffffff; font-size: 1.3rem; font-weight: 800; font-family: monospace;">${tagLimpio}</h2>
              <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">${escaparHTML(activo.area || 'General')}</span>
              <span style="background: rgba(255,255,255,0.08); color: #CBD5E1; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">${escaparHTML(activo.nivel || 'Nivel 1')}</span>
              <span style="background: rgba(245, 166, 35, 0.15); color: #F5A623; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">ISO 20816-3: ${escaparHTML(activo.grupoIso || 'GRUPO_1')} (${escaparHTML(activo.soporteIso || 'RIGIDO')})</span>
            </div>
            <p style="margin: 2px 0 0 0; color: #94A3B8; font-size: 0.76rem;">${escaparHTML(activo.nombre || 'Sin descripción técnica')}</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="display: flex; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 2px;">
            <button type="button" data-accion="expediente:cambiarFuente" data-args='${argsJson([activo.tag, 'TERRENO'])}' style="background: ${fuenteVisualizacionActiva === 'TERRENO' ? '#0284c7' : 'transparent'}; color: ${fuenteVisualizacionActiva === 'TERRENO' ? 'white' : '#94A3B8'}; border: none; padding: 5px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              Ruta Terreno
            </button>
            <button type="button" data-accion="expediente:cambiarFuente" data-args='${argsJson([activo.tag, 'DYNAMOX'])}' style="background: ${fuenteVisualizacionActiva === 'DYNAMOX' ? '#00e676' : 'transparent'}; color: ${fuenteVisualizacionActiva === 'DYNAMOX' ? '#0E1B1F' : '#94A3B8'}; border: none; padding: 5px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              Dynamox Online
            </button>
          </div>

          <button type="button" data-accion="expediente:guardarMatriz" data-args='${argsJson([activo.tag])}' style="background: #0284c7; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 1rem;">save</span>
            <span>Guardar Mediciones</span>
          </button>

          <button type="button" data-accion="expediente:exportarPDF" data-args='${argsJson([activo.tag])}' style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; padding: 7px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
            PDF
          </button>

          <button type="button" data-accion="mapa:renderizar" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 7px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
            Geovisor
          </button>
        </div>
      </header>

      <!-- TABLA MATRICIAL DE DIGITACIÓN RÁPIDA -->
      <section style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; flex-shrink: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div style="padding: 10px 14px; background: rgba(14, 27, 31, 0.8); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">
            Matriz de Registro CBM: ${fuenteVisualizacionActiva === 'TERRENO' ? 'Inspección en Terreno' : 'Plataforma Dynamox'}
          </span>
          <span style="font-size: 0.68rem; color: #94A3B8;">
            * Los campos se colorean en vivo según ISO 20816-3 (Vibración), NETA/ISO 18434 (Temp) e ISO 13373-2 (FC+)
          </span>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; color: #E2E8F0; text-align: left;">
            <thead>
              <tr style="background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.08); color: #94A3B8; text-transform: uppercase; font-size: 0.68rem;">
                <th style="padding: 10px 12px;">Punto / Componente</th>
                <th style="padding: 10px 8px; text-align: center;">Última Fecha</th>
                <th style="padding: 10px 8px; text-align: center;">Ant. mm/s</th>
                <th style="padding: 10px 8px; text-align: center;">Ant. °C</th>
                <th style="padding: 10px 8px; text-align: center;">Ant. FC+</th>
                <th style="padding: 10px 12px; width: 140px;">Fecha Medición</th>
                <th style="padding: 10px 8px; width: 105px;">Actual mm/s</th>
                <th style="padding: 10px 8px; width: 95px;">Actual °C</th>
                <th style="padding: 10px 8px; width: 95px;">Actual FC+</th>
                <th style="padding: 10px 12px; text-align: center;">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              ${
                listaSpotsKeys.length === 0
                  ? `
                <tr>
                  <td colspan="10" style="padding: 2rem; text-align: center; color: #94A3B8;">
                    No hay puntos asignados. Pulsa en "Editar Puntos / Ficha" para cargar la plantilla de este activo.
                  </td>
                </tr>
              `
                  : listaSpotsKeys
                      .map((sKey) => {
                        const sp = spotsMap[sKey];
                        const esPuntoSeleccionado = spotActivoGrafico === sKey;

                        // Extraer anterior y actual
                        const anteriorRms = sp.anteriorRms ?? 0;
                        const anteriorTemp = sp.anteriorTemp ?? 0;
                        const anteriorFc = sp.anteriorFc ?? 0;

                        const actualRms = sp.actualRms ?? (sp as any).rms ?? 0;
                        const actualTemp = sp.actualTemp ?? (sp as any).temp ?? 0;
                        const actualFc = sp.actualFc ?? 0;

                        // Colores normativos iniciales
                        const colorVib = evaluarIso20816_3(
                          actualRms,
                          activo.grupoIso,
                          activo.soporteIso,
                        );
                        const colorTmp = evaluarNetaIso18434(actualTemp);
                        const colorFc = evaluarIso13373_2(actualFc);

                        return `
                  <tr id="fila-spot-${sKey}" style="border-bottom: 1px solid rgba(255,255,255,0.04); background: ${esPuntoSeleccionado ? 'rgba(56, 189, 248, 0.08)' : 'transparent'}; transition: background 0.15s ease;">
                    
                    <!-- PUNTO Y COMPONENTE -->
                    <td style="padding: 8px 12px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-family: monospace; font-weight: 800; color: #ffffff; font-size: 0.8rem;">[${escaparHTML(sp.punto || sKey)}]</span>
                        <span style="font-size: 0.7rem; color: #38bdf8;">${escaparHTML(sp.componente)}</span>
                      </div>
                    </td>

                    <!-- DATOS ANTERIORES -->
                    <td style="padding: 8px; text-align: center; font-family: monospace; color: #94A3B8; font-size: 0.7rem;">
                      ${sp.fechaUltima || 'S/D'}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${anteriorRms > 0 ? anteriorRms.toFixed(2) : '--'}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${anteriorTemp > 0 ? anteriorTemp.toFixed(1) + '°' : '--'}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${anteriorFc > 0 ? anteriorFc.toFixed(1) : '--'}
                    </td>

                    <!-- FECHA DE MEDICIÓN ACTUAL (AUTO-RELLENABLE AL TIPIAR) -->
                    <td style="padding: 8px 12px;">
                      <input type="text" id="fecha-${sKey}" value="${sp.actualFecha || ''}" placeholder="dd/mm/aaaa hh:mm"
                             style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: #38bdf8; padding: 5px 8px; border-radius: 4px; font-family: monospace; font-size: 0.72rem; outline: none; box-sizing: border-box;">
                    </td>

                    <!-- VALORES ACTUALES EDITABLES CON COLOR EN VIVO -->
                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.01" min="0" id="rms-${sKey}" value="${actualRms > 0 ? actualRms : ''}" placeholder="0.00"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'RMS', activo.grupoIso || 'GRUPO_1', activo.soporteIso || 'RIGIDO'])}'
                             title="${colorVib.zona}"
                             style="width: 100%; background: ${colorVib.bg}; border: 1.5px solid ${colorVib.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                    </td>

                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.1" min="0" id="temp-${sKey}" value="${actualTemp > 0 ? actualTemp : ''}" placeholder="°C"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'TEMP'])}'
                             title="${colorTmp.zona}"
                             style="width: 100%; background: ${colorTmp.bg}; border: 1.5px solid ${colorTmp.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                    </td>

                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.1" min="0" id="fc-${sKey}" value="${actualFc > 0 ? actualFc : ''}" placeholder="FC+"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'FC'])}'
                             title="${colorFc.zona}"
                             style="width: 100%; background: ${colorFc.bg}; border: 1.5px solid ${colorFc.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                    </td>

                    <!-- BOTÓN DE GRÁFICO DEL PUNTO -->
                    <td style="padding: 6px 12px; text-align: center;">
                      <button type="button" data-accion="expediente:cambiarSpot" data-args='${argsJson([sKey, activo.tag])}' 
                              title="Cargar curvas de este punto"
                              style="background: ${esPuntoSeleccionado ? '#0284c7' : 'rgba(56, 189, 248, 0.12)'}; color: ${esPuntoSeleccionado ? 'white' : '#38bdf8'}; border: 1px solid rgba(56, 189, 248, 0.35); padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">monitoring</span>
                        <span>Gráfico</span>
                      </button>
                    </td>

                  </tr>
                `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- SECCIÓN INFERIOR: GRÁFICAS DE TENDENCIA Y RUL DEL PUNTO SELECCIONADO -->
      <section style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; flex: 1; min-height: 230px;">
        
        <!-- GRÁFICA 1: HISTORIAL DE EVOLUCIÓN ISO -->
        <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.74rem; font-weight: 800; color: #38bdf8; text-transform: uppercase;">
              Historial de Tendencia del Punto: <span style="font-family: monospace; color: white;">[${spotActivoGrafico || 'N/A'}]</span>
            </span>
            <span style="font-size: 0.68rem; color: #94A3B8;">Norma ISO 20816-3 (RMS mm/s)</span>
          </div>
          <div style="flex: 1; position: relative; min-height: 180px;">
            <canvas id="chart-historial-tendencia"></canvas>
          </div>
        </div>

        <!-- GRÁFICA 2: PROYECCIÓN RUL (DÍAS RESTANTES A LA FALLA) -->
        <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.74rem; font-weight: 800; color: #F5A623; text-transform: uppercase;">
              Proyección RUL: Días Restantes para Falla (Zona D)
            </span>
            <div id="badge-rul-dias" style="padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid #00e676;">
              Calculando...
            </div>
          </div>
          <div style="flex: 1; position: relative; min-height: 180px;">
            <canvas id="chart-proyeccion-rul"></canvas>
          </div>
        </div>

      </section>

    </article>
  `;

  setTimeout(() => {
    actualizarGraficosExpediente(activo, spotActivoGrafico);
  }, 80);
};

// ============================================================================
// 3. MOTOR DE GRÁFICOS: HISTORIAL Y CÁLCULO DE DÍAS RESTANTES (RUL)
// ============================================================================
const actualizarGraficosExpediente = (activo: any, spotKey: string | null): void => {
  if (typeof Chart === 'undefined') return;

  const canvasHist = document.getElementById(
    'chart-historial-tendencia',
  ) as HTMLCanvasElement | null;
  const canvasRul = document.getElementById('chart-proyeccion-rul') as HTMLCanvasElement | null;
  if (!canvasHist || !canvasRul) return;

  if (chartTendenciaInstancia) chartTendenciaInstancia.destroy();
  if (chartRulInstancia) chartRulInstancia.destroy();

  const spot: SpotFicha | undefined = activo.spots?.[spotKey || ''];
  let historial: RegistroHistoricoPunto[] = spot?.historial || [];

  // Semilla ilustrativa si aún no existen registros acumulados
  if (historial.length === 0) {
    const ahora = Date.now();
    historial = [
      {
        fecha: 'Sem -4',
        timestamp: ahora - 86400000 * 28,
        fuente: 'TERRENO',
        rms: 1.8,
        temp: 42,
        fc: 2.8,
      },
      {
        fecha: 'Sem -3',
        timestamp: ahora - 86400000 * 21,
        fuente: 'TERRENO',
        rms: 2.2,
        temp: 44,
        fc: 3.1,
      },
      {
        fecha: 'Sem -2',
        timestamp: ahora - 86400000 * 14,
        fuente: 'TERRENO',
        rms: 2.7,
        temp: 48,
        fc: 3.6,
      },
      {
        fecha: 'Sem -1',
        timestamp: ahora - 86400000 * 7,
        fuente: 'TERRENO',
        rms: 3.4,
        temp: 53,
        fc: 4.2,
      },
      {
        fecha: 'Actual',
        timestamp: ahora,
        fuente: 'TERRENO',
        rms: spot?.actualRms || 4.1,
        temp: spot?.actualTemp || 58,
        fc: spot?.actualFc || 4.9,
      },
    ];
  }

  const esFlexible = activo.soporteIso === 'FLEXIBLE';
  const esGrupo1 = activo.grupoIso === 'GRUPO_1';
  const limiteZonaD = esGrupo1 ? (esFlexible ? 11.0 : 7.1) : esFlexible ? 7.1 : 4.5;
  const limiteZonaC = esGrupo1 ? (esFlexible ? 7.1 : 4.5) : esFlexible ? 4.5 : 2.8;

  const labelsFechas = historial.map((h) => h.fecha);
  const valoresRms = historial.map((h) => h.rms);

  // GRÁFICA 1: HISTORIAL DE TENDENCIA
  chartTendenciaInstancia = new Chart(canvasHist.getContext('2d'), {
    type: 'line',
    data: {
      labels: labelsFechas,
      datasets: [
        {
          label: 'Vibración RMS (mm/s)',
          data: valoresRms,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          tension: 0.25,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#38bdf8',
        },
        {
          label: `Límite Zona D (${limiteZonaD} mm/s)`,
          data: labelsFechas.map(() => limiteZonaD),
          borderColor: '#ef4444',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: `Alerta Zona C (${limiteZonaC} mm/s)`,
          data: labelsFechas.map(() => limiteZonaC),
          borderColor: '#f97316',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 9.5 } } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94A3B8', font: { size: 9 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94A3B8', font: { size: 9 } },
          suggestedMax: limiteZonaD + 1,
        },
      },
    },
  });

  // GRÁFICA 2: REGRESIÓN LINEAL Y ESTIMACIÓN DE DÍAS A LA FALLA (RUL)
  const puntosRegresion = historial.slice(-5);
  let diasParaFalla = Infinity;
  let mensajeRul = 'Estable / Sin degradación crítica';
  let colorRul = '#00e676';

  if (puntosRegresion.length >= 2) {
    const t0 = puntosRegresion[0].timestamp;
    const xVals = puntosRegresion.map((p) => (p.timestamp - t0) / (1000 * 60 * 60 * 24)); // en días
    const yVals = puntosRegresion.map((p) => p.rms);

    const n = xVals.length;
    const sumX = xVals.reduce((a, b) => a + b, 0);
    const sumY = yVals.reduce((a, b) => a + b, 0);
    const sumXY = xVals.reduce((acc, curr, i) => acc + curr * yVals[i], 0);
    const sumXX = xVals.reduce((acc, curr) => acc + curr * curr, 0);

    const divisor = n * sumXX - sumX * sumX;
    const pendiente = divisor !== 0 ? (n * sumXY - sumX * sumY) / divisor : 0; // mm/s por día
    const rmsActual = yVals[yVals.length - 1];

    if (pendiente > 0.005) {
      const diasEstimados = (limiteZonaD - rmsActual) / pendiente;
      diasParaFalla = Math.max(1, Math.round(diasEstimados));

      if (diasParaFalla <= 7) {
        mensajeRul = `⚠️ Falla Inminente: ~${diasParaFalla} días para Zona D`;
        colorRul = '#ef4444';
      } else if (diasParaFalla <= 21) {
        mensajeRul = `Alerta: ~${diasParaFalla} días para Falla`;
        colorRul = '#f97316';
      } else {
        mensajeRul = `Vida Útil Restante: ~${diasParaFalla} días`;
        colorRul = '#eab308';
      }
    }
  }

  const badgeRul = document.getElementById('badge-rul-dias');
  if (badgeRul) {
    badgeRul.textContent = mensajeRul;
    badgeRul.style.color = colorRul;
    badgeRul.style.borderColor = colorRul;
    badgeRul.style.background = `${colorRul}22`;
  }

  const rmsActual = valoresRms[valoresRms.length - 1] || 2.0;
  const tasaIncremento =
    diasParaFalla < 500 ? (limiteZonaD - rmsActual) / Math.max(1, diasParaFalla) : 0;

  const labelsFuturos = ['Hoy', '+7 días', '+14 días', '+21 días', '+30 días'];
  const curvaProyectada = [
    rmsActual,
    Math.min(limiteZonaD + 2, rmsActual + tasaIncremento * 7),
    Math.min(limiteZonaD + 2, rmsActual + tasaIncremento * 14),
    Math.min(limiteZonaD + 2, rmsActual + tasaIncremento * 21),
    Math.min(limiteZonaD + 2, rmsActual + tasaIncremento * 30),
  ];

  chartRulInstancia = new Chart(canvasRul.getContext('2d'), {
    type: 'line',
    data: {
      labels: labelsFuturos,
      datasets: [
        {
          label: 'Pronóstico de Degradación RMS',
          data: curvaProyectada,
          borderColor: colorRul,
          backgroundColor: `${colorRul}15`,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: colorRul,
        },
        {
          label: `Límite Falla Zona D (${limiteZonaD} mm/s)`,
          data: labelsFuturos.map(() => limiteZonaD),
          borderColor: '#ef4444',
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 9.5 } } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94A3B8', font: { size: 9 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94A3B8', font: { size: 9 } },
          suggestedMax: limiteZonaD + 1,
        },
      },
    },
  });
};

// ============================================================================
// 4. REGISTRO DE COMANDOS (antes: window.*)
// ============================================================================
registrarComando('expediente:renderizar', (_evento, idActivo) => {
  renderizarExpediente(String(idActivo ?? ''));
});

registrarComando('expediente:cambiarFuente', (_evento, tag, fuente) => {
  fuenteVisualizacionActiva = (fuente as 'TERRENO' | 'DYNAMOX') || 'TERRENO';
  renderizarExpediente(String(tag ?? ''));
});

registrarComando('expediente:cambiarSpot', (_evento, spotKey, tag) => {
  const spot = String(spotKey ?? '');
  const tagEquipo = String(tag ?? '');
  spotActivoGrafico = spot;
  const activo = obtenerDatosEquipos()?.[tagEquipo];
  if (activo) {
    // Actualizar selección visual de filas
    document.querySelectorAll('[id^="fila-spot-"]').forEach((tr) => {
      (tr as HTMLElement).style.background = 'transparent';
    });
    const fila = document.getElementById(`fila-spot-${spot}`);
    if (fila) fila.style.background = 'rgba(56, 189, 248, 0.08)';

    actualizarGraficosExpediente(activo, spot);
  }
});

/**
 * Al digitar en cualquier casilla, se auto-completa la fecha actual
 * y se reevalúa la norma para pintar el fondo y borde del input.
 */
registrarComando(
  'expediente:digitarMedicion',
  (_evento, sKey, tipo, grupoIso = 'GRUPO_1', soporteIso = 'RIGIDO') => {
    const key = String(sKey ?? '');
    const tipoMedicion = String(tipo ?? 'RMS') as 'RMS' | 'TEMP' | 'FC';

    const input =
      (_evento?.target as HTMLInputElement | null) ??
      (document.getElementById(
        tipoMedicion === 'RMS'
          ? `rms-${key}`
          : tipoMedicion === 'TEMP'
            ? `temp-${key}`
            : `fc-${key}`,
      ) as HTMLInputElement | null);
    if (!input) return;

    // 1. Auto-rellenar la fecha si está vacía
    const inputFecha = document.getElementById(`fecha-${key}`) as HTMLInputElement | null;
    if (inputFecha && !inputFecha.value.trim()) {
      const ahora = new Date();
      const dd = String(ahora.getDate()).padStart(2, '0');
      const mm = String(ahora.getMonth() + 1).padStart(2, '0');
      const yyyy = ahora.getFullYear();
      const hh = String(ahora.getHours()).padStart(2, '0');
      const min = String(ahora.getMinutes()).padStart(2, '0');
      inputFecha.value = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    // 2. Evaluar norma y colorear
    const val = parseFloat(input.value);
    let evaluacion = { color: '#64748B', bg: 'rgba(100, 116, 139, 0.15)', zona: 'S/D' };

    if (tipoMedicion === 'RMS')
      evaluacion = evaluarIso20816_3(val, String(grupoIso), String(soporteIso));
    else if (tipoMedicion === 'TEMP') evaluacion = evaluarNetaIso18434(val);
    else if (tipoMedicion === 'FC') evaluacion = evaluarIso13373_2(val);

    input.style.borderColor = evaluacion.color;
    input.style.background = evaluacion.bg;
    input.title = evaluacion.zona;
  },
);

/**
 * Guarda todas las filas de la matriz en lote
 */
registrarComando('expediente:guardarMatriz', async (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  const eq = obtenerDatosEquipos()?.[tagEquipo];
  if (!eq || !eq.spots) return;

  let totalActualizados = 0;
  const ahoraTimestamp = Date.now();

  Object.keys(eq.spots).forEach((sKey) => {
    const inputFecha = document.getElementById(`fecha-${sKey}`) as HTMLInputElement | null;
    const inputRms = document.getElementById(`rms-${sKey}`) as HTMLInputElement | null;
    const inputTemp = document.getElementById(`temp-${sKey}`) as HTMLInputElement | null;
    const inputFc = document.getElementById(`fc-${sKey}`) as HTMLInputElement | null;

    const fTxt = inputFecha?.value.trim();
    const rmsVal = parseFloat(inputRms?.value || '0');
    const tempVal = parseFloat(inputTemp?.value || '0');
    const fcVal = parseFloat(inputFc?.value || '0');

    if (rmsVal > 0 || tempVal > 0 || fcVal > 0) {
      const spot = eq.spots[sKey];

      // Mover los valores actuales hacia el historial antes de sobreescribir
      if (spot.actualRms && spot.actualRms > 0) {
        spot.anteriorRms = spot.actualRms;
        spot.anteriorTemp = spot.actualTemp;
        spot.anteriorFc = spot.actualFc;
        spot.fechaUltima = spot.actualFecha || 'Anterior';
      }

      spot.actualFecha = fTxt || new Date().toLocaleString('es-CL');
      spot.actualRms = rmsVal;
      spot.actualTemp = tempVal;
      spot.actualFc = fcVal;

      // Actualizar valores de catastro
      spot.rms = rmsVal;
      spot.temp = tempVal;

      if (!spot.historial) spot.historial = [];
      spot.historial.push({
        fecha: spot.actualFecha,
        timestamp: ahoraTimestamp,
        fuente: fuenteVisualizacionActiva,
        rms: rmsVal,
        temp: tempVal,
        fc: fcVal,
      });

      totalActualizados++;
    }
  });

  if (totalActualizados === 0) {
    UI.mostrarToast('No se ingresaron valores numéricos para registrar.', 'info');
    return;
  }

  // Persistir hacia FastAPI / Outbox
  await SyncManager.despacharOEncolar(`activo_catastro:${tagEquipo}`, 'UPDATE', eq);
  UI.mostrarToast(
    `Matriz guardada: ${totalActualizados} puntos actualizados para ${tagEquipo}.`,
    'exito',
  );

  renderizarExpediente(tagEquipo);
});

registrarComando('expediente:exportarPDF', async (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  const eq = obtenerDatosEquipos()?.[tagEquipo];
  if (!eq) return;
  UI.mostrarToast(`Generando reporte técnico para ${tagEquipo}...`, 'info');

  const generado = await generarPDFExpediente({
    tagEquipo,
    elementoId: 'espacio-trabajo-dinamico',
    abrirEnVisor: true,
  });

  if (generado) {
    UI.mostrarToast('PDF generado exitosamente.', 'exito');
  }
});
