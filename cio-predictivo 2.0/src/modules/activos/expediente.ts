import { SyncManager } from '../../core/offline/syncManager';
import { UI } from '../layout/notificaciones';
import { generarPDFExpediente } from '../../core/pdf/reportes';
import { argsJson, registrarComando } from '../../core/app/comandos';
import { obtenerDatosEquipos } from '../../core/app/estadoApp';
import { generarObservacionesCBM, type ObservacionCBM } from '../../core/cbm/observaciones';
import { AuthService } from '../../core/auth/authService';
import {
  MAGNITUDES_CBM,
  MOTIVOS_NO_MEDICION,
  describirMotivo,
  etiquetasMagnitudes,
  magnitudesFaltantes,
  normalizarMagnitudes,
  normalizarMotivo,
  validarEstadoMedicion,
  type MagnitudCBM,
} from '../../core/cbm/trazabilidadSm';
import {
  cargarAvisosCBM,
  generarAvisoCBM,
  obtenerClavesAvisosExistentes,
} from '../avisos/avisosCbm';
import {
  type CategoriaCinematica,
  clasificarCategoriaCinematica,
  infoCategoria,
  ordenarSpotsCinematica,
} from '../../core/domain/ordenCinematica';
import { abrirModalGraficosSpot } from './modalGraficosSpot';

declare const Chart: any;

export { MOTIVOS_NO_MEDICION };

export interface RegistroHistoricoPunto {
  fecha: string;
  timestamp: number;
  fuente: 'TERRENO' | 'DYNAMOX';
  rms: number;
  temp: number;
  fc: number;
  motivo?: string;
  magnitudesSinMedicion?: MagnitudCBM[];
  usuario?: string;
  rol?: string;
}

export interface SpotFicha {
  punto: string;
  componente: string;
  direccion?: string;
  fechaUltima?: string;
  fechaUltimaInspeccion?: string;
  anteriorRms?: number;
  anteriorTemp?: number;
  anteriorFc?: number;
  /** Campos heredados de versiones anteriores (compatibilidad de lectura). */
  rms?: number;
  temp?: number;
  fc?: number;
  motivoNoMedicion?: string;
  magnitudesSinMedicion?: MagnitudCBM[];
  actualFecha?: string;
  actualRms?: number;
  actualTemp?: number;
  actualFc?: number;
  historial?: RegistroHistoricoPunto[];
}

let spotActivoGrafico: string | null = null;
let fuenteVisualizacionActiva: 'TERRENO' | 'DYNAMOX' = 'TERRENO';

/**
 * Borradores de medición en memoria (aún no guardados). Permiten que lo digitado
 * sobreviva a re-renderizados y que el PDF reciba siempre los valores actuales.
 */
interface BorradorMedicion {
  fecha: string;
  rms: number | null;
  temp: number | null;
  fc: number | null;
}
const borradoresMedicion = new Map<string, BorradorMedicion>();
const claveBorrador = (tag: string, sKey: string): string => `${tag}::${sKey}`;

/**
 * Normaliza el historial de un punto. Las bases importadas desde Firebase
 * pueden traer `historial` como objeto indexado en vez de arreglo; también se
 * ordena por timestamp ascendente para que el último elemento sea el vigente.
 */
export const normalizarHistorial = (historial: unknown): RegistroHistoricoPunto[] => {
  const registros = Array.isArray(historial)
    ? historial
    : historial && typeof historial === 'object'
      ? Object.values(historial as Record<string, RegistroHistoricoPunto>)
      : [];
  const timestampSeguro = (valor: unknown): number => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  };
  return registros
    .filter(
      (registro): registro is RegistroHistoricoPunto =>
        Boolean(registro) && typeof registro === 'object',
    )
    .sort((a, b) => timestampSeguro(a.timestamp) - timestampSeguro(b.timestamp));
};

const htmlOpcionesMotivo = (seleccionado: string, excluirOtro = false): string =>
  MOTIVOS_NO_MEDICION.filter((m) => !excluirOtro || m.value !== 'otro')
    .map(
      (m) =>
        `<option value="${m.value}" ${seleccionado === m.value ? 'selected' : ''}>${escaparHTML(m.label)}</option>`,
    )
    .join('');

/** Usuario autenticado que deja la trazabilidad del registro. */
const usuarioActual = (): { usuario: string; rol: string } => {
  const sesion = AuthService.getSesion();
  return {
    usuario: sesion?.nombre || sesion?.email || 'No identificado',
    rol: sesion?.rol || '',
  };
};

/** Lee un input numérico distinguiendo vacío (null) de cero (0). */
const leerNumeroOpcional = (id: string): number | null => {
  const elemento = document.getElementById(id) as HTMLInputElement | null;
  const texto = elemento?.value?.trim() ?? '';
  if (!texto) return null;
  const numero = Number(texto.replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
};

/** Lee el motivo seleccionado en la fila y combina "otro" con su detalle. */
const leerMotivoDOM = (sKey: string): string => {
  const select = document.getElementById(`motivo-${sKey}`) as HTMLSelectElement | null;
  if (!select) return '';
  const otro = document.getElementById(`motivo-otro-${sKey}`) as HTMLInputElement | null;
  return normalizarMotivo(select.value, otro?.value || '');
};

/**
 * Observaciones vigentes por activo. Se recalculan al renderizar y al digitar,
 * y alimentan tanto la sección visible como el PDF y el aviso SAP.
 */
const observacionesPorActivo = new Map<string, ObservacionCBM[]>();
let clavesAvisosExistentes = new Set<string>();

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
import { formatearFechaCorta } from '../../core/utils/fechas';

// Niveles de severidad compartidos por los tres evaluadores (mismos colores).
const NIVEL_POR_COLOR: Record<string, number> = {
  '#00e676': 0,
  '#eab308': 1,
  '#f97316': 2,
  '#ef4444': 3,
};
const ZONAS_POR_NIVEL = ['Zona A', 'Zona B', 'Zona C', 'Zona D'];
const nivelSeveridad = (color: string): number =>
  NIVEL_POR_COLOR[String(color).toLowerCase()] ?? -1;

interface MedicionEvaluadaExpediente {
  sKey: string;
  punto: string;
  componente: string;
  fecha: string;
  rms: number;
  temp: number;
  fc: number;
  motivo?: string;
  magnitudesSinMedicion?: MagnitudCBM[];
  usuario?: string;
  evalRms: { color: string; zona: string; bg: string };
  evalTemp: { color: string; zona: string; bg: string };
  evalFc: { color: string; zona: string; bg: string };
  zonaGlobal: string;
  colorGlobal: string;
}

/** Convierte mediciones legacy (texto/null) a número seguro. */
const aNumeroSeguro = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/**
 * Reúne las mediciones del activo con la misma prioridad que usa el PDF:
 * lo digitado (DOM/borrador) → actuales en memoria → última medición del
 * historial → columna "Ant." → campos heredados.
 *
 * Si hay una captura nueva, las magnitudes vacías se consideran S/M y no se
 * rellenan con valores antiguos: así el reporte no muestra datos viejos como
 * si fueran de esta inspección.
 */
const construirMedicionesEvaluadas = (
  activo: any,
  leerDOM = false,
): MedicionEvaluadaExpediente[] => {
  const spotsMap: Record<string, SpotFicha> = activo.spots || {};
  const { usuario } = usuarioActual();
  const keysOrdenadas = ordenarSpotsCinematica(spotsMap);

  return keysOrdenadas.map((sKey) => {
    const sp = spotsMap[sKey] || ({} as SpotFicha);
    const borrador = borradoresMedicion.get(claveBorrador(String(activo.tag), sKey));
    const historialSpot = normalizarHistorial(sp.historial);
    const ultimo = historialSpot.length > 0 ? historialSpot[historialSpot.length - 1] : null;
    const inputFecha = leerDOM
      ? (document.getElementById(`fecha-${sKey}`) as HTMLInputElement | null)
      : null;

    const rmsCapturado = leerDOM ? leerNumeroOpcional(`rms-${sKey}`) : (borrador?.rms ?? null);
    const tempCapturado = leerDOM ? leerNumeroOpcional(`temp-${sKey}`) : (borrador?.temp ?? null);
    const fcCapturado = leerDOM ? leerNumeroOpcional(`fc-${sKey}`) : (borrador?.fc ?? null);
    const hayCaptura = rmsCapturado !== null || tempCapturado !== null || fcCapturado !== null;

    const actualRms = aNumeroSeguro(sp.actualRms);
    const actualTemp = aNumeroSeguro(sp.actualTemp);
    const actualFc = aNumeroSeguro(sp.actualFc);
    const tieneActual = actualRms > 0 || actualTemp > 0 || actualFc > 0;

    let rms: number;
    let temp: number;
    let fc: number;
    let faltantes: MagnitudCBM[];
    let motivo: string;
    let usuarioRegistro = '';

    if (hayCaptura) {
      rms = rmsCapturado ?? 0;
      temp = tempCapturado ?? 0;
      fc = fcCapturado ?? 0;
      faltantes = magnitudesFaltantes({
        rms: rmsCapturado,
        temp: tempCapturado,
        fc: fcCapturado,
      });
      motivo = leerDOM ? leerMotivoDOM(sKey) : sp.motivoNoMedicion || '';
      usuarioRegistro = usuario;
    } else if (tieneActual) {
      rms = actualRms;
      temp = actualTemp;
      fc = actualFc;
      faltantes = magnitudesFaltantes({ rms: actualRms, temp: actualTemp, fc: actualFc });
      motivo = sp.motivoNoMedicion || '';
      usuarioRegistro = usuario;
    } else if (ultimo) {
      rms = aNumeroSeguro(ultimo.rms);
      temp = aNumeroSeguro(ultimo.temp);
      fc = aNumeroSeguro(ultimo.fc);
      faltantes = normalizarMagnitudes(ultimo.magnitudesSinMedicion);
      if (faltantes.length === 0) {
        faltantes = magnitudesFaltantes({ rms, temp, fc });
      }
      motivo = ultimo.motivo || '';
      usuarioRegistro = ultimo.usuario || '';
    } else {
      rms = aNumeroSeguro(sp.anteriorRms ?? sp.rms);
      temp = aNumeroSeguro(sp.anteriorTemp ?? sp.temp);
      fc = aNumeroSeguro(sp.anteriorFc ?? sp.fc);
      faltantes = normalizarMagnitudes(sp.magnitudesSinMedicion);
      if (faltantes.length === 0) {
        faltantes = magnitudesFaltantes({ rms, temp, fc });
      }
      motivo = sp.motivoNoMedicion || '';
    }

    let fecha = sp.actualFecha || ultimo?.fecha || sp.fechaUltima || '—';
    if (hayCaptura) {
      fecha =
        (leerDOM ? inputFecha?.value.trim() : '') ||
        borrador?.fecha ||
        sp.actualFecha ||
        formatearFechaCorta(new Date());
    }

    const evalRms = evaluarIso20816_3(rms, activo.grupoIso, activo.soporteIso);
    const evalTemp = evaluarNetaIso18434(temp);
    const evalFc = evaluarIso13373_2(fc);
    const niveles = [
      { nivel: nivelSeveridad(evalRms.color), color: evalRms.color },
      { nivel: nivelSeveridad(evalTemp.color), color: evalTemp.color },
      { nivel: nivelSeveridad(evalFc.color), color: evalFc.color },
    ];
    const peor = niveles.reduce((a, b) => (b.nivel > a.nivel ? b : a));

    return {
      sKey,
      punto: sp.punto || sKey,
      componente: sp.componente || 'Componente',
      fecha,
      rms,
      temp,
      fc,
      motivo: faltantes.length > 0 ? motivo : '',
      magnitudesSinMedicion: faltantes.length > 0 ? faltantes : undefined,
      usuario: usuarioRegistro,
      evalRms,
      evalTemp,
      evalFc,
      zonaGlobal: peor.nivel < 0 ? 'S/D' : ZONAS_POR_NIVEL[peor.nivel],
      colorGlobal: peor.color,
    };
  });
};

const generarObservacionesDeMediciones = (
  mediciones: MedicionEvaluadaExpediente[],
): ObservacionCBM[] =>
  generarObservacionesCBM(
    mediciones.map((medicion) => ({
      punto: medicion.punto,
      componente: medicion.componente,
      rms: medicion.rms,
      temp: medicion.temp,
      fc: medicion.fc,
      nivelRms: nivelSeveridad(medicion.evalRms.color),
      nivelTemp: nivelSeveridad(medicion.evalTemp.color),
      nivelFc: nivelSeveridad(medicion.evalFc.color),
    })),
  );

const htmlTarjetasObservaciones = (observaciones: ObservacionCBM[], tag: string): string => {
  if (observaciones.length === 0) {
    return `
      <div style="padding: 12px 16px; color: #00e676; font-size: 0.78rem; display: flex; align-items: center; gap: 8px;">
        <span class="material-symbols-outlined" style="font-size: 1.1rem;">check_circle</span>
        <span>Sin observaciones automáticas: las magnitudes evaluadas están en zona normal o no hay mediciones registradas.</span>
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 8px; padding: 10px 14px;">
      ${observaciones
        .map((obs) => {
          const clave = `${tag}::${obs.id}`;
          const yaGenerado = clavesAvisosExistentes.has(clave);
          const color = escaparHTML(obs.color);
          return `
            <div style="border-left: 3px solid ${color}; background: rgba(14, 27, 31, 0.65); border-radius: 6px; padding: 9px 12px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="background: ${color}22; color: ${color}; border: 1px solid ${color}66; padding: 1px 7px; border-radius: 4px; font-size: 0.64rem; font-weight: 800;">${escaparHTML(obs.severidad)}</span>
                <span style="font-family: monospace; font-weight: 800; color: #ffffff; font-size: 0.76rem;">[${escaparHTML(obs.punto)}]</span>
                <span style="color: #38bdf8; font-size: 0.74rem; font-weight: 700;">${escaparHTML(obs.componente)}</span>
                <strong style="color: #ffffff; font-size: 0.78rem;">${escaparHTML(obs.titulo)}</strong>
                <span style="margin-left: auto; color: ${color}; font-size: 0.68rem; font-weight: 800;">Plazo: ${obs.plazoDias} días</span>
              </div>
              <p style="margin: 6px 0 0 0; color: #CBD5E1; font-size: 0.74rem; line-height: 1.45;">${escaparHTML(obs.detalle)}</p>
              <p style="margin: 4px 0 0 0; color: #94A3B8; font-size: 0.72rem; line-height: 1.45;"><strong style="color: #E2E8F0;">Recomendación:</strong> ${escaparHTML(obs.recomendacion)}</p>
              ${
                obs.requiereAvisoSap
                  ? yaGenerado
                    ? `<span style="display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; color: #00e676; font-size: 0.7rem; font-weight: 800;"><span class="material-symbols-outlined" style="font-size: 0.95rem;">task_alt</span> Aviso SAP generado</span>`
                    : `<button type="button" data-accion="expediente:generarAvisoSap" data-args='${argsJson([tag, obs.id])}' style="margin-top: 6px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 4px 10px; border-radius: 5px; font-size: 0.7rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">notification_add</span>
                        Generar aviso SAP
                      </button>`
                  : ''
              }
            </div>
          `;
        })
        .join('')}
    </div>
  `;
};

const actualizarObservacionesExpediente = (tag: string): void => {
  const contenedor = document.getElementById('observaciones-expediente');
  if (!contenedor) return;

  const activo = obtenerDatosEquipos()?.[tag];
  if (!activo) return;

  const mediciones = construirMedicionesEvaluadas(activo);
  const observaciones = generarObservacionesDeMediciones(mediciones);
  observacionesPorActivo.set(tag, observaciones);
  contenedor.innerHTML = htmlTarjetasObservaciones(observaciones, tag);

  const contador = document.getElementById('contador-observaciones-expediente');
  if (contador) contador.textContent = String(observaciones.length);
};

// ============================================================================
// 1.1 HISTORIAL DE REGISTROS (modal de consulta)
// ============================================================================
const construirContenidoHistorial = (activo: any): { html: string; total: number } => {
  const spotsMap: Record<string, SpotFicha> = activo.spots || {};
  const registros: Array<RegistroHistoricoPunto & { punto: string }> = [];

  Object.entries(spotsMap).forEach(([sKey, sp]) => {
    normalizarHistorial(sp.historial).forEach((h) => {
      registros.push({ ...h, punto: sp.punto || sKey });
    });
  });

  const timestampSeguro = (valor: unknown): number => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  };
  registros.sort((a, b) => timestampSeguro(b.timestamp) - timestampSeguro(a.timestamp));
  const ultimos = registros.slice(0, 12);

  if (ultimos.length === 0) {
    return {
      total: 0,
      html: `
        <p style="color: #94A3B8; font-size: 0.82rem; margin: 0; padding: 1rem;">
          Aún no hay registros históricos para este activo. La primera vez que pulses
          "Guardar Mediciones" quedarán registradas aquí las mediciones y las justificaciones S/M.
        </p>
      `,
    };
  }

  const filas = ultimos
    .map((reg) => {
      const rmsNum = aNumeroSeguro(reg.rms);
      const tempNum = aNumeroSeguro(reg.temp);
      const fcNum = aNumeroSeguro(reg.fc);
      const faltantes = normalizarMagnitudes(reg.magnitudesSinMedicion);
      const faltantesRegistro =
        faltantes.length > 0
          ? faltantes
          : MAGNITUDES_CBM.filter((magnitud) => {
              const valor = magnitud === 'rms' ? rmsNum : magnitud === 'temp' ? tempNum : fcNum;
              return !(valor > 0);
            });
      const sinRms = faltantesRegistro.includes('rms');
      const sinTemp = faltantesRegistro.includes('temp');
      const sinFc = faltantesRegistro.includes('fc');
      const evalRms = evaluarIso20816_3(rmsNum, activo.grupoIso, activo.soporteIso);
      const esDynamox = (reg.fuente || 'TERRENO') === 'DYNAMOX';
      const responsable = reg.usuario
        ? `${escaparHTML(reg.usuario)}${reg.rol ? ` · ${escaparHTML(reg.rol)}` : ''}`
        : 'No registrado';
      const detalleSm =
        faltantesRegistro.length > 0
          ? `<div style="margin-top: 2px; font-size: 0.62rem; color: #F5A623; line-height: 1.35;">S/M ${escaparHTML(etiquetasMagnitudes(faltantesRegistro))}: ${escaparHTML(describirMotivo(reg.motivo) || 'sin motivo registrado')}</div>`
          : '';
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
          <td style="padding: 7px 10px; font-family: monospace; font-size: 0.72rem; color: #CBD5E1;">
            ${escaparHTML(formatearFechaCorta(reg.fecha))}
            <div style="margin-top: 2px; font-size: 0.6rem; color: #64748B; font-family: inherit; font-weight: 400;">${responsable}</div>
          </td>
          <td style="padding: 7px 10px; font-family: monospace; font-weight: 800; color: #38bdf8; font-size: 0.74rem;">
            [${escaparHTML(reg.punto)}]
            ${detalleSm}
          </td>
          <td style="padding: 7px 10px; text-align: center; font-family: monospace; font-weight: 800; font-size: 0.78rem; color: ${evalRms.color};" title="${escaparHTML(evalRms.zona)}">${sinRms ? 'S/M' : rmsNum.toFixed(2)}</td>
          <td style="padding: 7px 10px; text-align: center; font-family: monospace; font-size: 0.74rem; color: #CBD5E1;">${sinTemp ? 'S/M' : tempNum.toFixed(1) + '°'}</td>
          <td style="padding: 7px 10px; text-align: center; font-family: monospace; font-size: 0.74rem; color: #CBD5E1;">${sinFc ? 'S/M' : fcNum.toFixed(1)}</td>
          <td style="padding: 7px 10px; text-align: center;">
            <span style="font-size: 0.66rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: ${esDynamox ? 'rgba(0, 230, 118, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; color: ${esDynamox ? '#00e676' : '#38bdf8'};">${escaparHTML(reg.fuente || 'TERRENO')}</span>
          </td>
        </tr>
      `;
    })
    .join('');

  return {
    total: registros.length,
    html: `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.75rem; color: #E2E8F0;">
          <thead>
            <tr style="background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.08); color: #94A3B8; text-transform: uppercase; font-size: 0.66rem;">
              <th style="padding: 7px 10px;">Fecha</th>
              <th style="padding: 7px 10px;">Punto</th>
              <th style="padding: 7px 10px; text-align: center;">RMS (mm/s)</th>
              <th style="padding: 7px 10px; text-align: center;">Temp (°C)</th>
              <th style="padding: 7px 10px; text-align: center;">FC+</th>
              <th style="padding: 7px 10px; text-align: center;">Fuente</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <p style="margin: 10px 0 0 0; font-size: 0.68rem; color: #94A3B8;">
        Mostrando los últimos ${ultimos.length} de ${registros.length} registros · más recientes
        primero · S/M = sin medición, con motivo y responsable para trazabilidad.
      </p>
    `,
  };
};

export const abrirModalHistorial = (activo: any): void => {
  document.getElementById('modal-historial-expediente')?.remove();

  const { html, total } = construirContenidoHistorial(activo);
  const tagSeguro = escaparHTML(activo.tag || 'S/T');

  const modal = document.createElement('div');
  modal.id = 'modal-historial-expediente';
  modal.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; width: 94vw; max-width: 980px; max-height: 86vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.6);">
      <header style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.3rem;">history</span>
          <h3 style="margin: 0; color: #ffffff; font-size: 1rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
            Historial de Registros — <span style="font-family: monospace;">${tagSeguro}</span>
          </h3>
          <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 10px;">${total} registros</span>
        </div>
        <button type="button" data-accion="expediente:cerrarHistorial" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #E2E8F0; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 1.1rem;">×</button>
      </header>
      <div style="padding: 14px 18px; overflow-y: auto; flex: 1;">
        ${html}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};

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
  const listaSpotsKeys = ordenarSpotsCinematica(spotsMap);
  const totalHistorial = Object.values(spotsMap).reduce(
    (acc, sp) => acc + normalizarHistorial(sp.historial).length,
    0,
  );

  if (!spotActivoGrafico || !spotsMap[spotActivoGrafico]) {
    spotActivoGrafico = listaSpotsKeys[0] || null;
  }

  const medicionesEvaluadas = construirMedicionesEvaluadas(activo);
  const observaciones = generarObservacionesDeMediciones(medicionesEvaluadas);
  observacionesPorActivo.set(String(activo.tag), observaciones);

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

          <button type="button" data-accion="expediente:abrirHistorial" data-args='${argsJson([activo.tag])}' title="Consultar el historial de mediciones" style="background: rgba(245, 166, 35, 0.15); border: 1px solid rgba(245, 166, 35, 0.4); color: #F5A623; padding: 7px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 1rem;">history</span>
            <span>Historial (${totalHistorial})</span>
          </button>

          <button type="button" data-accion="avisosCbm:abrir" data-args='${argsJson([activo.tag])}' title="Avisos CBM y SAP del activo" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 7px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 1rem;">notification_important</span>
            <span>Avisos SAP</span>
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

        <div style="padding: 8px 14px; background: rgba(14, 27, 31, 0.55); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.66rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.4px;">Motivo masivo:</span>
          <select id="motivo-masivo" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 5px 8px; border-radius: 4px; font-size: 0.7rem; outline: none; min-width: 210px;">
            ${htmlOpcionesMotivo('', true)}
          </select>
          <button type="button" data-accion="expediente:aplicarMotivoMasivo" data-args='${argsJson([activo.tag])}'
                  style="background: rgba(245, 166, 35, 0.15); border: 1px solid rgba(245, 166, 35, 0.4); color: #F5A623; padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; cursor: pointer;">
            Aplicar a puntos con S/M
          </button>
          <span style="font-size: 0.64rem; color: #64748B;">Completa el motivo de las filas con algún campo vacío; no guarda.</span>
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
                <th style="padding: 10px 12px; width: 140px;">Fecha Medición (auto)</th>
                <th style="padding: 10px 8px; width: 105px;">Actual mm/s</th>
                <th style="padding: 10px 8px; width: 95px;">Actual °C</th>
                <th style="padding: 10px 8px; width: 95px;">Actual FC+</th>
                <th style="padding: 10px 12px; text-align: center;">Motivo si no midió</th>
                <th style="padding: 10px 12px; text-align: center;">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              ${
                listaSpotsKeys.length === 0
                  ? `
                <tr>
                  <td colspan="11" style="padding: 2rem; text-align: center; color: #94A3B8;">
                    No hay puntos asignados. Pulsa en "Editar Puntos / Ficha" para cargar la plantilla de este activo.
                  </td>
                </tr>
              `
                  : (() => {
                      let categoriaActual: CategoriaCinematica | null = null;
                      return listaSpotsKeys
                        .map((sKey) => {
                          const sp = spotsMap[sKey];
                          const cat = clasificarCategoriaCinematica(
                            sp?.componente,
                            sp?.punto || sKey,
                          );
                          let filaSeparador = '';
                          if (cat !== categoriaActual) {
                            categoriaActual = cat;
                            const info = infoCategoria(cat);
                            filaSeparador = `
                    <tr class="fila-separador-cinematica" style="background: rgba(14, 27, 31, 0.95); border-top: 1px solid rgba(56, 189, 248, 0.25); border-bottom: 1px solid rgba(255,255,255,0.06);">
                      <td colspan="11" style="padding: 7px 12px; font-size: 0.68rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.6px;">
                        <span style="display: inline-flex; align-items: center; gap: 6px;">
                          <span class="material-symbols-outlined" style="font-size: 0.95rem; color: #38bdf8;" aria-hidden="true">${info.icono}</span>
                          <span>${escaparHTML(info.titulo)}</span>
                        </span>
                      </td>
                    </tr>
                            `;
                          }
                          const esPuntoSeleccionado = spotActivoGrafico === sKey;

                          // Extraer anterior y actual (los datos legacy pueden venir como texto).
                          const anteriorRms = aNumeroSeguro(sp.anteriorRms ?? (sp as any).rms ?? 0);
                          const anteriorTemp = aNumeroSeguro(
                            sp.anteriorTemp ?? (sp as any).temp ?? 0,
                          );
                          const anteriorFc = aNumeroSeguro(sp.anteriorFc ?? (sp as any).fc ?? 0);

                          const borrador = borradoresMedicion.get(
                            claveBorrador(String(activo.tag), sKey),
                          );
                          const actualRms = borrador
                            ? (borrador.rms ?? 0)
                            : aNumeroSeguro(sp.actualRms);
                          const actualTemp = borrador
                            ? (borrador.temp ?? 0)
                            : aNumeroSeguro(sp.actualTemp);
                          const actualFc = borrador
                            ? (borrador.fc ?? 0)
                            : aNumeroSeguro(sp.actualFc);
                          const actualFecha = borrador?.fecha || sp.actualFecha || '';
                          const faltantesAnterior = normalizarMagnitudes(sp.magnitudesSinMedicion);
                          const sinRmsAnterior =
                            faltantesAnterior.length > 0
                              ? faltantesAnterior.includes('rms')
                              : anteriorRms <= 0;
                          const sinTempAnterior =
                            faltantesAnterior.length > 0
                              ? faltantesAnterior.includes('temp')
                              : anteriorTemp <= 0;
                          const sinFcAnterior =
                            faltantesAnterior.length > 0
                              ? faltantesAnterior.includes('fc')
                              : anteriorFc <= 0;
                          const ultimoMotivo = sp.motivoNoMedicion || '';

                          // Colores normativos iniciales
                          const colorVib = evaluarIso20816_3(
                            actualRms,
                            activo.grupoIso,
                            activo.soporteIso,
                          );
                          const colorTmp = evaluarNetaIso18434(actualTemp);
                          const colorFc = evaluarIso13373_2(actualFc);

                          return (
                            filaSeparador +
                            `
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
                      ${escaparHTML(formatearFechaCorta(sp.fechaUltima || 'S/D'))}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${sinRmsAnterior ? 'S/M' : anteriorRms.toFixed(2)}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${sinTempAnterior ? 'S/M' : anteriorTemp.toFixed(1) + '°'}
                    </td>
                    <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: 700; color: #CBD5E1;">
                      ${sinFcAnterior ? 'S/M' : anteriorFc.toFixed(1)}
                    </td>

                    <!-- FECHA DE MEDICIÓN ACTUAL (AUTO, NO EDITABLE) -->
                    <td style="padding: 8px 12px;">
                      <input type="text" id="fecha-${sKey}" value="${escaparHTML(actualFecha)}" placeholder="auto" readonly
                             style="width: 100%; background: rgba(14, 27, 31, 0.6); border: 1px solid rgba(255,255,255,0.08); color: #94A3B8; padding: 5px 8px; border-radius: 4px; font-family: monospace; font-size: 0.72rem; outline: none; box-sizing: border-box; cursor: not-allowed;">
                    </td>

                    <!-- VALORES ACTUALES EDITABLES CON COLOR EN VIVO Y TENDENCIA VS ÚLTIMO REGISTRO -->
                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.01" min="0" id="rms-${sKey}" value="${actualRms > 0 ? actualRms : ''}" placeholder="0.00"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'RMS', anteriorRms, activo.grupoIso || 'GRUPO_1', activo.soporteIso || 'RIGIDO', activo.tag])}'
                             title="${colorVib.zona}"
                             style="width: 100%; background: ${colorVib.bg}; border: 1.5px solid ${colorVib.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                      <span id="delta-rms-${sKey}" style="display: block; font-size: 0.62rem; font-weight: 800; margin-top: 2px; min-height: 12px; text-align: center;"></span>
                    </td>

                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.1" min="0" id="temp-${sKey}" value="${actualTemp > 0 ? actualTemp : ''}" placeholder="°C"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'TEMP', anteriorTemp, activo.grupoIso || 'GRUPO_1', activo.soporteIso || 'RIGIDO', activo.tag])}'
                             title="${colorTmp.zona}"
                             style="width: 100%; background: ${colorTmp.bg}; border: 1.5px solid ${colorTmp.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                      <span id="delta-temp-${sKey}" style="display: block; font-size: 0.62rem; font-weight: 800; margin-top: 2px; min-height: 12px; text-align: center;"></span>
                    </td>

                    <td style="padding: 6px 8px;">
                      <input type="number" step="0.1" min="0" id="fc-${sKey}" value="${actualFc > 0 ? actualFc : ''}" placeholder="FC+"
                             data-accion="expediente:digitarMedicion" data-args='${argsJson([sKey, 'FC', anteriorFc, activo.grupoIso || 'GRUPO_1', activo.soporteIso || 'RIGIDO', activo.tag])}'
                             title="${colorFc.zona}"
                             style="width: 100%; background: ${colorFc.bg}; border: 1.5px solid ${colorFc.color}; color: #ffffff; padding: 5px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 0.8rem; text-align: center; outline: none; box-sizing: border-box;">
                      <span id="delta-fc-${sKey}" style="display: block; font-size: 0.62rem; font-weight: 800; margin-top: 2px; min-height: 12px; text-align: center;"></span>
                    </td>

                    <!-- MOTIVO SI NO SE MIDIÓ (trazabilidad) -->
                    <td style="padding: 6px 8px; min-width: 150px;">
                      <select id="motivo-${sKey}" data-skey="${sKey}" data-accion="expediente:cambiarMotivo"
                              style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 5px 6px; border-radius: 4px; font-size: 0.7rem; outline: none; box-sizing: border-box;">
                        ${htmlOpcionesMotivo('')}
                      </select>
                      <input type="text" id="motivo-otro-${sKey}" value="" placeholder="Detalle del motivo"
                             style="display: none; width: 100%; margin-top: 4px; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 4px 6px; border-radius: 4px; font-size: 0.68rem; box-sizing: border-box;">
                      ${
                        ultimoMotivo
                          ? `<div style="margin-top: 3px; font-size: 0.6rem; color: #64748B;">Último: ${escaparHTML(describirMotivo(ultimoMotivo))}</div>`
                          : ''
                      }
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
                `
                          );
                        })
                        .join('');
                    })()
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- OBSERVACIONES Y RECOMENDACIONES AUTOMÁTICAS -->
      <section style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; flex-shrink: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.35);">
        <div style="padding: 10px 14px; background: rgba(14, 27, 31, 0.8); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.1rem;">lightbulb</span>
            <span style="font-size: 0.75rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">Observaciones y recomendaciones automáticas</span>
            <span id="contador-observaciones-expediente" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.68rem; font-weight: 800; padding: 1px 7px; border-radius: 10px;">${observaciones.length}</span>
          </div>
          <span style="font-size: 0.66rem; color: #94A3B8;">Reglas: ISO 20816-3 · ISO 18434-1 · ISO 13373-2</span>
        </div>
        <div id="observaciones-expediente">${htmlTarjetasObservaciones(observaciones, activo.tag)}</div>
      </section>

    </article>
  `;

  // Marcar las observaciones que ya tienen un aviso vigente (backend/caché).
  void cargarAvisosCBM()
    .then(() => {
      clavesAvisosExistentes = obtenerClavesAvisosExistentes();
      actualizarObservacionesExpediente(String(activo.tag));
    })
    .catch(() => {
      // Si no hay red, se mantiene la caché local y el botón de generación.
    });
};

// ============================================================================
// 4. REGISTRO DE COMANDOS (antes: window.*)
// ============================================================================
registrarComando('expediente:renderizar', (_evento, idActivo) => {
  renderizarExpediente(String(idActivo ?? ''));
});

registrarComando('expediente:abrirHistorial', (_evento, tag) => {
  const activo = obtenerDatosEquipos()[String(tag ?? '')];
  if (activo) abrirModalHistorial(activo);
});

registrarComando('expediente:cerrarHistorial', () => {
  document.getElementById('modal-historial-expediente')?.remove();
});

registrarComando('expediente:cambiarMotivo', (evento) => {
  const select = evento?.target as HTMLSelectElement | null;
  if (!select) return;
  const sKey = select.getAttribute('data-skey') || '';
  const otro = document.getElementById(`motivo-otro-${sKey}`) as HTMLInputElement | null;
  if (otro) {
    otro.style.display = select.value === 'otro' ? 'block' : 'none';
    if (select.value !== 'otro') otro.value = '';
  }
});

registrarComando('expediente:aplicarMotivoMasivo', (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  const selectMasivo = document.getElementById('motivo-masivo') as HTMLSelectElement | null;
  const motivo = selectMasivo?.value || '';
  if (!motivo) {
    UI.mostrarToast('Selecciona un motivo para aplicar a los puntos con S/M.', 'info');
    return;
  }

  let aplicados = 0;
  const filas = document.querySelectorAll<HTMLTableRowElement>('tr[id^="fila-spot-"]');
  filas.forEach((fila) => {
    const sKey = fila.id.replace('fila-spot-', '');
    const hayBlanco = MAGNITUDES_CBM.some((magnitud) => {
      const input = document.getElementById(`${magnitud}-${sKey}`) as HTMLInputElement | null;
      return !input?.value?.trim();
    });
    if (!hayBlanco) return;

    const select = document.getElementById(`motivo-${sKey}`) as HTMLSelectElement | null;
    if (!select) return;
    select.value = motivo;
    const otro = document.getElementById(`motivo-otro-${sKey}`) as HTMLInputElement | null;
    if (otro) {
      otro.style.display = 'none';
      otro.value = '';
    }
    aplicados++;
  });

  UI.mostrarToast(
    aplicados > 0
      ? `Motivo aplicado a ${aplicados} punto(s) con S/M. Revisa y guarda la matriz.`
      : 'No hay puntos con campos vacíos para aplicar el motivo.',
    aplicados > 0 ? 'exito' : 'info',
  );
  void tagEquipo;
});

registrarComando('expediente:generarAvisoSap', async (_evento, tag, observacionId) => {
  const tagEquipo = String(tag ?? '');
  const activo = obtenerDatosEquipos()?.[tagEquipo];
  if (!activo) return;

  const observacion = (observacionesPorActivo.get(tagEquipo) || []).find(
    (item) => item.id === String(observacionId),
  );
  if (!observacion) {
    UI.mostrarToast('La observación ya no está vigente. Vuelve a calcular la matriz.', 'info');
    return;
  }

  const { aviso, duplicado } = await generarAvisoCBM(activo, observacion);
  clavesAvisosExistentes = obtenerClavesAvisosExistentes();

  if (duplicado) {
    UI.mostrarToast(
      `Ya existe el aviso ${aviso.avisoSap || aviso.id} para esta observación.`,
      'info',
    );
  } else {
    UI.mostrarToast(
      `Aviso CBM ${aviso.id} generado para ${tagEquipo}. Gestiónalo en "Avisos CBM SAP".`,
      'exito',
    );
  }
  actualizarObservacionesExpediente(tagEquipo);
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

    abrirModalGraficosSpot(activo, spot);
  }
});

/**
 * Al digitar en cualquier casilla, se auto-completa la fecha actual, se reevalúa
 * la norma para pintar el fondo y borde del input, y se muestra el indicador de
 * tendencia (▲ aumentó / ▼ disminuyó / = se mantuvo) frente al último registro.
 */
const actualizarIndicadorDelta = (
  key: string,
  tipoMedicion: 'RMS' | 'TEMP' | 'FC',
  valor: number,
  anterior: number,
): void => {
  const el = document.getElementById(
    `delta-${tipoMedicion === 'RMS' ? 'rms' : tipoMedicion === 'TEMP' ? 'temp' : 'fc'}-${key}`,
  );
  if (!el) return;

  if (!valor || valor <= 0 || !anterior || anterior <= 0) {
    el.textContent = '';
    return;
  }

  const diff = valor - anterior;
  const umbral = tipoMedicion === 'TEMP' ? 0.5 : 0.05;
  const decimales = tipoMedicion === 'TEMP' ? 1 : 2;

  if (Math.abs(diff) < umbral) {
    el.textContent = '= se mantuvo';
    el.style.color = '#94A3B8';
  } else if (diff > 0) {
    el.textContent = `▲ +${diff.toFixed(decimales)}`;
    el.style.color = '#f87171';
  } else {
    el.textContent = `▼ ${diff.toFixed(decimales)}`;
    el.style.color = '#00e676';
  }
};

registrarComando(
  'expediente:digitarMedicion',
  (
    _evento,
    sKey,
    tipo,
    valorAnterior,
    grupoIso = 'GRUPO_1',
    soporteIso = 'RIGIDO',
    tagEquipo = '',
  ) => {
    const key = String(sKey ?? '');
    const tipoMedicion = String(tipo ?? 'RMS') as 'RMS' | 'TEMP' | 'FC';
    const anterior = Number(valorAnterior ?? 0);

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

    // 3. Guardar borrador en memoria: sobrevive a re-renderizados y alimenta el PDF.
    // null representa "vacío"; 0 es un valor medido válido.
    const tag = String(tagEquipo ?? '');
    if (tag) {
      const valorDe = (id: string): number | null => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        const texto = el?.value?.trim() ?? '';
        if (!texto) return null;
        const n = Number(texto.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      const valNumerico = Number.isFinite(val) ? val : null;

      borradoresMedicion.set(claveBorrador(tag, key), {
        fecha: inputFecha?.value.trim() || '',
        rms: tipoMedicion === 'RMS' ? valNumerico : valorDe(`rms-${key}`),
        temp: tipoMedicion === 'TEMP' ? valNumerico : valorDe(`temp-${key}`),
        fc: tipoMedicion === 'FC' ? valNumerico : valorDe(`fc-${key}`),
      });

      // Recalcular observaciones en vivo con la medición recién digitada.
      actualizarObservacionesExpediente(tag);
    }

    // 4. Indicador de tendencia vs el último registro
    actualizarIndicadorDelta(key, tipoMedicion, val, anterior);
  },
);

/**
 * Guarda todas las filas de la matriz en lote.
 *
 * Regla de trazabilidad: cada punto debe quedar medido o con un motivo de no
 * medición. Un punto 100% en blanco también genera un registro S/M; ya no se
 * puede omitir sin dejar constancia.
 */
registrarComando('expediente:guardarMatriz', async (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  const eq = obtenerDatosEquipos()?.[tagEquipo];
  if (!eq || !eq.spots) return;

  const ahoraTimestamp = Date.now();
  const fechaAhora = formatearFechaCorta(new Date());
  const { usuario, rol } = usuarioActual();

  interface FilaEstado {
    sKey: string;
    spot: SpotFicha;
    rms: number | null;
    temp: number | null;
    fc: number | null;
    motivo: string;
    faltantes: MagnitudCBM[];
    hayMedicion: boolean;
    fecha: string;
  }

  const filas: FilaEstado[] = Object.entries(eq.spots as Record<string, SpotFicha>).map(
    ([sKey, spot]) => {
      const borrador = borradoresMedicion.get(claveBorrador(tagEquipo, sKey));
      const inputFecha = document.getElementById(`fecha-${sKey}`) as HTMLInputElement | null;
      const tieneInputRms = Boolean(document.getElementById(`rms-${sKey}`));
      const tieneInputTemp = Boolean(document.getElementById(`temp-${sKey}`));
      const tieneInputFc = Boolean(document.getElementById(`fc-${sKey}`));
      const rms = tieneInputRms ? leerNumeroOpcional(`rms-${sKey}`) : (borrador?.rms ?? null);
      const temp = tieneInputTemp ? leerNumeroOpcional(`temp-${sKey}`) : (borrador?.temp ?? null);
      const fc = tieneInputFc ? leerNumeroOpcional(`fc-${sKey}`) : (borrador?.fc ?? null);
      const selectMotivo = document.getElementById(`motivo-${sKey}`) as HTMLSelectElement | null;
      const motivo = selectMotivo ? leerMotivoDOM(sKey) : spot.motivoNoMedicion || '';
      const faltantes = magnitudesFaltantes({ rms, temp, fc });

      return {
        sKey,
        spot,
        rms,
        temp,
        fc,
        motivo,
        faltantes,
        hayMedicion: faltantes.length < MAGNITUDES_CBM.length,
        fecha: inputFecha?.value.trim() || borrador?.fecha || fechaAhora,
      };
    },
  );

  // Validación: si falta alguna magnitud, el motivo es obligatorio. También
  // aplica al punto completo en blanco (S/M total).
  for (const fila of filas) {
    const validacion = validarEstadoMedicion({
      rms: fila.rms,
      temp: fila.temp,
      fc: fila.fc,
      motivo: fila.motivo,
    });
    if (!validacion.ok) {
      const punto = fila.spot.punto || fila.sKey;
      UI.mostrarToast(`Punto ${punto}: ${validacion.mensaje}`, 'info');
      return;
    }
  }

  let totalRegistrados = 0;
  let totalSm = 0;

  filas.forEach((fila, indice) => {
    const { spot } = fila;
    const esSm = fila.faltantes.length > 0;
    const fechaGuardada = fila.fecha || fechaAhora;

    // Solo se actualiza la columna "Ant." de las magnitudes realmente medidas;
    // las S/M conservan el último valor conocido para no borrar el historial.
    if (fila.rms !== null) {
      spot.anteriorRms = fila.rms;
      spot.rms = fila.rms;
    }
    if (fila.temp !== null) {
      spot.anteriorTemp = fila.temp;
      spot.temp = fila.temp;
    }
    if (fila.fc !== null) {
      spot.anteriorFc = fila.fc;
    }
    if (fila.hayMedicion) {
      spot.fechaUltima = fechaGuardada;
    }
    spot.fechaUltimaInspeccion = fechaGuardada;
    spot.motivoNoMedicion = esSm ? fila.motivo : '';
    spot.magnitudesSinMedicion = esSm ? fila.faltantes : undefined;

    // Los campos "Actuales" quedan vacíos para la próxima medición.
    spot.actualFecha = '';
    spot.actualRms = 0;
    spot.actualTemp = 0;
    spot.actualFc = 0;
    borradoresMedicion.delete(claveBorrador(tagEquipo, fila.sKey));

    spot.historial = normalizarHistorial(spot.historial);
    spot.historial.push({
      fecha: fechaGuardada,
      timestamp: ahoraTimestamp + indice,
      fuente: fuenteVisualizacionActiva,
      rms: fila.rms ?? 0,
      temp: fila.temp ?? 0,
      fc: fila.fc ?? 0,
      motivo: esSm ? fila.motivo : undefined,
      magnitudesSinMedicion: esSm ? fila.faltantes : undefined,
      usuario,
      rol: rol || undefined,
    });

    totalRegistrados++;
    if (esSm) totalSm++;
  });

  if (totalRegistrados === 0) {
    UI.mostrarToast('No hay puntos para registrar en este activo.', 'info');
    return;
  }

  // Persistir hacia FastAPI / Outbox
  await SyncManager.despacharOEncolar(`activo_catastro:${tagEquipo}`, 'UPDATE', eq);
  UI.mostrarToast(
    `Matriz guardada: ${totalRegistrados} registros (${totalSm} con S/M). Campos "Actuales" reiniciados.`,
    'exito',
  );

  renderizarExpediente(tagEquipo);
});

registrarComando('expediente:exportarPDF', async (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  const eq = obtenerDatosEquipos()?.[tagEquipo];
  if (!eq) return;
  UI.mostrarToast(`Generando reporte técnico para ${tagEquipo}...`, 'info');

  // Reunir TODOS los puntos, incluso los que quedaron 100% en S/M. El reporte
  // debe dejar constancia de lo no medido y su motivo, no ocultarlo.
  const medicionesEvaluadas = construirMedicionesEvaluadas(eq, true);
  const observaciones = generarObservacionesDeMediciones(medicionesEvaluadas);

  const mediciones = medicionesEvaluadas.map((medicion) => ({
    punto: medicion.punto,
    componente: medicion.componente,
    fecha: medicion.fecha,
    actualRms: medicion.rms,
    actualTemp: medicion.temp,
    actualFc: medicion.fc,
    zonaActual: medicion.evalRms.zona,
    colorActual: medicion.evalRms.color,
    colorTemp: medicion.evalTemp.color,
    colorFc: medicion.evalFc.color,
    zonaGlobal: medicion.zonaGlobal,
    colorGlobal: medicion.colorGlobal,
    motivoNoMedicion: medicion.motivo,
    magnitudesSinMedicion: medicion.magnitudesSinMedicion,
    usuario: medicion.usuario,
  }));

  const generado = await generarPDFExpediente({
    tagEquipo,
    nombre: eq.nombre || 'Activo Crítico',
    area: eq.area || 'General',
    nivel: eq.nivel || 'Nivel 1',
    grupoIso: eq.grupoIso || 'GRUPO_1',
    soporteIso: eq.soporteIso || 'RIGIDO',
    criticidad: eq.criticidad || 'Media',
    severidad: eq.severidad || 'VERDE',
    mediciones,
    observaciones: observaciones.map((observacion) => ({
      severidad: observacion.severidad,
      color: observacion.color,
      titulo: observacion.titulo,
      detalle: observacion.detalle,
      recomendacion: observacion.recomendacion,
      punto: observacion.punto,
      componente: observacion.componente,
      plazoDias: observacion.plazoDias,
      requiereAvisoSap: observacion.requiereAvisoSap,
    })),
    abrirEnVisor: true,
  });

  if (!generado) {
    UI.mostrarToast('No se pudo generar el PDF del expediente.', 'error');
  }
});
