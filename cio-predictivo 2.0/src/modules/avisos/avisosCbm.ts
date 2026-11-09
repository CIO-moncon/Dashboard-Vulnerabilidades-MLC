/**
 * Módulo de Avisos CBM — SAP PM.
 *
 * Los avisos nacen de las observaciones automáticas del expediente, se
 * persisten en el backend (o en el Outbox si no hay red) y se gestionan de
 * forma independiente: número SAP, prioridad y estado Realizado / No realizado.
 */

import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';
import { argsJson, ejecutarComando, registrarComando } from '../../core/app/comandos';
import { formatearFechaCorta } from '../../core/utils/fechas';
import { escaparHTML } from '../../core/utils/sanitizar';
import type {
  ObservacionCBM,
  PrioridadAvisoCBM,
  SeveridadObservacionCBM,
  TipoComponenteCBM,
} from '../../core/cbm/observaciones';
import { UI } from '../layout/notificaciones';

export type EstadoAvisoCBM = 'Pendiente' | 'Emitido' | 'Realizado' | 'No realizado';

export interface AvisoCBM {
  id: string;
  observacionId: string;
  tag: string;
  nombreActivo?: string;
  area?: string;
  punto: string;
  componente: string;
  tipoComponente: TipoComponenteCBM | string;
  severidad: SeveridadObservacionCBM;
  color: string;
  titulo: string;
  detalle: string;
  recomendacion: string;
  plazoDias: number;
  prioridadSap: PrioridadAvisoCBM;
  avisoSap: string;
  estado: EstadoAvisoCBM;
  fechaDeteccion: string;
  fechaEmision?: string;
  fechaCierre?: string;
  observacionCierre?: string;
  creadoPor?: string;
  timestamp: number;
  actualizadoEn: number;
}

const CLAVE_CACHE_BASE = 'cio_avisos_cbm_v1';
/** La caché se separa por tenant para no mezclar avisos entre faenas. */
const claveCache = (): string =>
  `${CLAVE_CACHE_BASE}:${AuthService.getSesion()?.tenantId || 'sin_tenant'}`;
let avisos: AvisoCBM[] = [];
let cargado = false;
let filtroEstado: EstadoAvisoCBM | 'TODOS' = 'TODOS';
let filtroTexto = '';
let filtroTag: string | null = null;

const leerCache = (): AvisoCBM[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const crudo = localStorage.getItem(claveCache());
    if (!crudo) return [];
    const datos = JSON.parse(crudo) as unknown;
    return Array.isArray(datos) ? (datos as AvisoCBM[]) : [];
  } catch {
    return [];
  }
};

const guardarCache = (): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(claveCache(), JSON.stringify(avisos));
  } catch {
    // La caché es un respaldo; si el navegador la bloquea se ignora.
  }
};

/** Solo se aceptan colores hex para evitar inyección en atributos style. */
const colorSeguro = (color: unknown): string => {
  const valor = String(color || '')
    .trim()
    .toLowerCase();
  return /^#[0-9a-f]{6}$/.test(valor) ? valor : '#eab308';
};

const normalizarAviso = (payload: Record<string, unknown>, creadoEn = 0): AvisoCBM | null => {
  const id = String(payload.id || '');
  if (!id) return null;
  const actualizadoEn = Number(payload.actualizadoEn || 0) || creadoEn * 1000;
  return {
    id,
    observacionId: String(payload.observacionId || ''),
    tag: String(payload.tag || 'S/T'),
    nombreActivo: payload.nombreActivo ? String(payload.nombreActivo) : undefined,
    area: payload.area ? String(payload.area) : undefined,
    punto: String(payload.punto || '—'),
    componente: String(payload.componente || 'Componente'),
    tipoComponente: String(payload.tipoComponente || 'OTRO'),
    severidad: (payload.severidad as SeveridadObservacionCBM) || 'AMARILLO',
    color: colorSeguro(payload.color),
    titulo: String(payload.titulo || 'Aviso CBM'),
    detalle: String(payload.detalle || ''),
    recomendacion: String(payload.recomendacion || ''),
    plazoDias: Number(payload.plazoDias || 0),
    prioridadSap: (payload.prioridadSap as PrioridadAvisoCBM) || 'Media',
    avisoSap: String(payload.avisoSap || ''),
    estado: (payload.estado as EstadoAvisoCBM) || 'Pendiente',
    fechaDeteccion: String(payload.fechaDeteccion || formatearFechaCorta(new Date())),
    fechaEmision: payload.fechaEmision ? String(payload.fechaEmision) : undefined,
    fechaCierre: payload.fechaCierre ? String(payload.fechaCierre) : undefined,
    observacionCierre: payload.observacionCierre ? String(payload.observacionCierre) : undefined,
    creadoPor: payload.creadoPor ? String(payload.creadoPor) : undefined,
    timestamp: Number(payload.timestamp || creadoEn * 1000 || Date.now()),
    actualizadoEn,
  };
};

/** Carga los avisos desde el backend y los mezcla con la caché local. */
export const cargarAvisosCBM = async (recargar = false): Promise<AvisoCBM[]> => {
  if (cargado && !recargar) return avisos;

  const mapa = new Map<string, AvisoCBM>();
  leerCache().forEach((aviso) => mapa.set(aviso.id, aviso));

  try {
    const respuesta = await fetch('/api/cbm/registros?limit=1000', {
      headers: AuthService.getHeadersTenant(),
    });
    if (respuesta.ok) {
      const data = await respuesta.json();
      (data.registros || []).forEach((registro: any) => {
        if (!String(registro.resource || '').startsWith('aviso_cbm:')) return;
        const aviso = normalizarAviso(registro.payload || {}, Number(registro.creado_en || 0));
        if (!aviso) return;
        const previo = mapa.get(aviso.id);
        if (!previo || aviso.actualizadoEn >= previo.actualizadoEn) {
          mapa.set(aviso.id, aviso);
        }
      });
    }
  } catch (error) {
    console.warn('[AvisosCBM] No se pudieron recuperar los avisos remotos:', error);
  }

  avisos = Array.from(mapa.values()).sort((a, b) => b.timestamp - a.timestamp);
  guardarCache();
  cargado = true;
  return avisos;
};

const persistirAviso = async (aviso: AvisoCBM): Promise<void> => {
  const actualizado: AvisoCBM = { ...aviso, actualizadoEn: Date.now() };
  const indice = avisos.findIndex((item) => item.id === actualizado.id);
  if (indice >= 0) avisos[indice] = actualizado;
  else avisos.unshift(actualizado);

  guardarCache();
  await SyncManager.despacharOEncolar(`aviso_cbm:${actualizado.id}`, 'UPDATE', actualizado);
};

/** Claves de avisos vigentes (se excluyen los marcados como No realizado). */
export const obtenerClavesAvisosExistentes = (): Set<string> =>
  new Set(
    avisos
      .filter((aviso) => aviso.estado !== 'No realizado' && aviso.observacionId)
      .map((aviso) => aviso.observacionId),
  );

/** Genera y persiste un aviso a partir de una observación automática. */
export const generarAvisoCBM = async (
  activo: { tag: string; nombre?: string; area?: string },
  observacion: ObservacionCBM,
): Promise<{ aviso: AvisoCBM; duplicado: boolean }> => {
  await cargarAvisosCBM();

  const observacionId = `${activo.tag}::${observacion.id}`;
  const existente = avisos.find(
    (aviso) => aviso.observacionId === observacionId && aviso.estado !== 'No realizado',
  );
  if (existente) return { aviso: existente, duplicado: true };

  const ahora = Date.now();
  const sesion = AuthService.getSesion();
  const aviso: AvisoCBM = {
    id: `AVC_${ahora}_${Math.random().toString(36).slice(2, 7)}`,
    observacionId,
    tag: activo.tag,
    nombreActivo: activo.nombre,
    area: activo.area,
    punto: observacion.punto,
    componente: observacion.componente,
    tipoComponente: observacion.tipoComponente,
    severidad: observacion.severidad,
    color: observacion.color,
    titulo: observacion.titulo,
    detalle: observacion.detalle,
    recomendacion: observacion.recomendacion,
    plazoDias: observacion.plazoDias,
    prioridadSap: observacion.prioridadSap,
    avisoSap: '',
    estado: 'Pendiente',
    fechaDeteccion: formatearFechaCorta(new Date()),
    creadoPor: sesion?.nombre || sesion?.email || 'Usuario CBM',
    timestamp: ahora,
    actualizadoEn: ahora,
  };

  await persistirAviso(aviso);
  return { aviso, duplicado: false };
};

const etiquetaEstado = (estado: EstadoAvisoCBM): { bg: string; color: string; borde: string } => {
  switch (estado) {
    case 'Emitido':
      return {
        bg: 'rgba(56, 189, 248, 0.15)',
        color: '#38bdf8',
        borde: 'rgba(56, 189, 248, 0.35)',
      };
    case 'Realizado':
      return {
        bg: 'rgba(0, 230, 118, 0.15)',
        color: '#00e676',
        borde: 'rgba(0, 230, 118, 0.35)',
      };
    case 'No realizado':
      return {
        bg: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        borde: 'rgba(239, 68, 68, 0.35)',
      };
    default:
      return {
        bg: 'rgba(234, 179, 8, 0.15)',
        color: '#eab308',
        borde: 'rgba(234, 179, 8, 0.35)',
      };
  }
};

const avisosFiltrados = (): AvisoCBM[] => {
  const texto = filtroTexto.trim().toLowerCase();
  return avisos.filter((aviso) => {
    if (filtroTag && aviso.tag !== filtroTag) return false;
    if (filtroEstado !== 'TODOS' && aviso.estado !== filtroEstado) return false;
    if (!texto) return true;
    return `${aviso.tag} ${aviso.componente} ${aviso.punto} ${aviso.titulo} ${aviso.avisoSap}`
      .toLowerCase()
      .includes(texto);
  });
};

const filaTabla = (aviso: AvisoCBM): string => {
  const estado = etiquetaEstado(aviso.estado);
  const color = colorSeguro(aviso.color);
  const prioridadColor =
    aviso.prioridadSap === 'Alta'
      ? '#f87171'
      : aviso.prioridadSap === 'Media'
        ? '#facc15'
        : '#94A3B8';

  return `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
      <td style="padding: 10px 12px; font-family: monospace; font-size: 0.7rem; color: #94A3B8; white-space: nowrap;">
        ${escaparHTML(formatearFechaCorta(aviso.fechaDeteccion))}
      </td>
      <td style="padding: 10px 12px; font-family: monospace; font-weight: 800; color: #ffffff;">
        ${escaparHTML(aviso.tag)}
      </td>
      <td style="padding: 10px 12px; color: #E2E8F0;">
        <div style="font-family: monospace; color: #38bdf8; font-weight: 700;">[${escaparHTML(aviso.punto)}]</div>
        <div style="font-size: 0.72rem; color: #94A3B8;">${escaparHTML(aviso.componente)}</div>
      </td>
      <td style="padding: 10px 12px;">
        <span style="display: inline-flex; align-items: center; gap: 5px; color: ${color}; font-weight: 800; font-size: 0.72rem;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
          ${escaparHTML(aviso.severidad)}
        </span>
      </td>
      <td style="padding: 10px 12px; color: #E2E8F0; max-width: 260px;">
        <div style="font-weight: 700;">${escaparHTML(aviso.titulo)}</div>
        <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 2px;">Plazo: ${aviso.plazoDias} días</div>
      </td>
      <td style="padding: 10px 12px; font-family: monospace; font-weight: 800; color: ${aviso.avisoSap ? '#facc15' : '#94A3B8'};">
        ${escaparHTML(aviso.avisoSap || 'Sin N°')}
      </td>
      <td style="padding: 10px 12px;">
        <span style="background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; color: ${prioridadColor};">
          ${escaparHTML(aviso.prioridadSap)}
        </span>
      </td>
      <td style="padding: 10px 12px;">
        <span style="background: ${estado.bg}; color: ${estado.color}; border: 1px solid ${estado.borde}; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; white-space: nowrap;">
          ${escaparHTML(aviso.estado)}
        </span>
      </td>
      <td style="padding: 10px 12px; text-align: center; white-space: nowrap;">
        <button type="button" data-accion="avisosCbm:gestionar" data-args='${argsJson([aviso.id])}' title="Editar aviso" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 700;">
          Gestionar
        </button>
        <button type="button" data-accion="avisosCbm:marcar" data-args='${argsJson([aviso.id, 'Realizado'])}' title="Marcar como realizado" style="background: rgba(0, 230, 118, 0.12); border: 1px solid rgba(0, 230, 118, 0.3); color: #00e676; padding: 4px 7px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 800; margin-left: 4px;">
          ✓
        </button>
        <button type="button" data-accion="avisosCbm:marcar" data-args='${argsJson([aviso.id, 'No realizado'])}' title="Marcar como no realizado" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 4px 7px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 800; margin-left: 4px;">
          ✕
        </button>
      </td>
    </tr>
  `;
};

const contenidoTabla = (): string => {
  const lista = avisosFiltrados();
  if (lista.length === 0) {
    return `
      <tr>
        <td colspan="9" style="padding: 2.5rem; text-align: center; color: #94A3B8;">
          No hay avisos CBM que coincidan con los filtros. Genera uno desde las observaciones del expediente.
        </td>
      </tr>
    `;
  }
  return lista.map(filaTabla).join('');
};

const actualizarTabla = (): void => {
  const cuerpo = document.getElementById('tbody-avisos-cbm');
  if (cuerpo) cuerpo.innerHTML = contenidoTabla();
  const contador = document.getElementById('contador-avisos-cbm');
  if (contador) contador.textContent = String(avisosFiltrados().length);
};

export const renderizarModuloAvisosCBM = async (
  contenedorId = 'espacio-trabajo-dinamico',
): Promise<void> => {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  await cargarAvisosCBM();

  const total = avisos.length;
  const pendientes = avisos.filter((a) => a.estado === 'Pendiente').length;
  const emitidos = avisos.filter((a) => a.estado === 'Emitido').length;
  const realizados = avisos.filter((a) => a.estado === 'Realizado').length;
  const noRealizados = avisos.filter((a) => a.estado === 'No realizado').length;

  contenedor.innerHTML = `
    <section class="panel-industrial" style="display: flex; flex-direction: column; height: 100%; padding: 1.25rem; gap: 1rem; box-sizing: border-box; overflow-y: auto;">
      <header style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; background: rgba(14, 27, 31, 0.95); padding: 1.25rem 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 10px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #38bdf8;">
            <span class="material-symbols-outlined" style="font-size: 1.8rem;" aria-hidden="true">notification_important</span>
          </div>
          <div>
            <h2 style="margin: 0; color: #ffffff; font-size: 1.25rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
              Avisos CBM — Gestión SAP PM
            </h2>
            <p style="margin: 2px 0 0 0; color: #94A3B8; font-size: 0.78rem;">
              Avisos generados desde las observaciones del expediente, con trazabilidad de emisión, realización y cierre.
            </p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button type="button" data-accion="avisosCbm:recargar" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.05rem;">refresh</span>
            <span>Actualizar</span>
          </button>
          <button type="button" data-accion="mapa:renderizar" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.05rem;">map</span>
            <span>Volver al Geovisor</span>
          </button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.68rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">Total avisos</span>
          <div style="font-size: 1.45rem; font-weight: 800; color: #ffffff; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">${total}</div>
        </div>
        <div style="background: #16282D; border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.68rem; color: #eab308; text-transform: uppercase; font-weight: 700;">Pendientes</span>
          <div style="font-size: 1.45rem; font-weight: 800; color: #eab308; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">${pendientes}</div>
        </div>
        <div style="background: #16282D; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.68rem; color: #38bdf8; text-transform: uppercase; font-weight: 700;">Emitidos SAP</span>
          <div style="font-size: 1.45rem; font-weight: 800; color: #38bdf8; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">${emitidos}</div>
        </div>
        <div style="background: #16282D; border: 1px solid rgba(0, 230, 118, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.68rem; color: #00e676; text-transform: uppercase; font-weight: 700;">Realizados</span>
          <div style="font-size: 1.45rem; font-weight: 800; color: #00e676; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">${realizados}</div>
        </div>
        <div style="background: #16282D; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.68rem; color: #f87171; text-transform: uppercase; font-weight: 700;">No realizados</span>
          <div style="font-size: 1.45rem; font-weight: 800; color: #f87171; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">${noRealizados}</div>
        </div>
      </div>

      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <label style="font-size: 0.74rem; color: #94A3B8; font-weight: 700;">Estado:</label>
          <select data-accion="avisosCbm:cambiarEstado" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 5px 10px; border-radius: 6px; font-size: 0.76rem; outline: none;">
            <option value="TODOS" ${filtroEstado === 'TODOS' ? 'selected' : ''}>Todos</option>
            <option value="Pendiente" ${filtroEstado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="Emitido" ${filtroEstado === 'Emitido' ? 'selected' : ''}>Emitido</option>
            <option value="Realizado" ${filtroEstado === 'Realizado' ? 'selected' : ''}>Realizado</option>
            <option value="No realizado" ${filtroEstado === 'No realizado' ? 'selected' : ''}>No realizado</option>
          </select>

          <input type="search" data-accion="avisosCbm:buscar" value="${escaparHTML(filtroTexto)}" placeholder="Buscar TAG, componente o N° SAP..." style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; outline: none; min-width: 260px; box-sizing: border-box;">

          ${
            filtroTag
              ? `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                  TAG: ${escaparHTML(filtroTag)}
                  <button type="button" data-accion="avisosCbm:limpiarTag" title="Quitar filtro de TAG" style="background: transparent; border: none; color: #38bdf8; cursor: pointer; font-weight: 800; font-size: 0.9rem; line-height: 1;">×</button>
                </span>`
              : ''
          }
        </div>
        <span style="font-size: 0.72rem; color: #94A3B8;">
          Mostrando <strong id="contador-avisos-cbm" style="color: #ffffff;">${avisosFiltrados().length}</strong> avisos
        </span>
      </div>

      <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden; flex: 1;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.78rem;">
            <thead>
              <tr style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); color: #94A3B8; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.4px;">
                <th style="padding: 11px 12px;">Detección</th>
                <th style="padding: 11px 12px;">TAG</th>
                <th style="padding: 11px 12px;">Componente</th>
                <th style="padding: 11px 12px;">Severidad</th>
                <th style="padding: 11px 12px;">Hallazgo</th>
                <th style="padding: 11px 12px;">N° Aviso SAP</th>
                <th style="padding: 11px 12px;">Prioridad</th>
                <th style="padding: 11px 12px;">Estado</th>
                <th style="padding: 11px 12px; text-align: center;">Acciones</th>
              </tr>
            </thead>
            <tbody id="tbody-avisos-cbm">
              ${contenidoTabla()}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
};

const abrirModalGestion = (avisoId: string): void => {
  const aviso = avisos.find((item) => item.id === avisoId);
  if (!aviso) return;

  document.getElementById('modal-gestionar-aviso-cbm')?.remove();
  const color = colorSeguro(aviso.color);

  const modal = document.createElement('div');
  modal.id = 'modal-gestionar-aviso-cbm';
  modal.className = 'modal-overlay';
  modal.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 95%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
      <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1;">
        <h3 style="margin: 0; color: #ffffff; font-size: 1rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
          Gestión de Aviso CBM — ${escaparHTML(aviso.tag)} [${escaparHTML(aviso.punto)}]
        </h3>
        <button type="button" data-accion="avisosCbm:cerrarModal" style="background: transparent; border: none; color: #94A3B8; font-size: 1.4rem; cursor: pointer;">&times;</button>
      </header>

      <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem; color: #E2E8F0;">
        <div style="border-left: 3px solid ${color}; padding-left: 10px;">
          <div style="color: ${color}; font-weight: 800; font-size: 0.74rem; text-transform: uppercase;">${escaparHTML(aviso.severidad)} · ${escaparHTML(aviso.componente)}</div>
          <div style="font-weight: 800; margin-top: 2px;">${escaparHTML(aviso.titulo)}</div>
          <p style="margin: 6px 0 0 0; color: #CBD5E1; line-height: 1.45;">${escaparHTML(aviso.detalle)}</p>
          <p style="margin: 6px 0 0 0; color: #38bdf8; line-height: 1.45;"><strong>Recomendación:</strong> ${escaparHTML(aviso.recomendacion)}</p>
          <p style="margin: 6px 0 0 0; color: #94A3B8; font-size: 0.72rem;">Plazo recomendado: ${aviso.plazoDias} días · Detectado: ${escaparHTML(formatearFechaCorta(aviso.fechaDeteccion))}</p>
        </div>

        <div>
          <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px;">Número de Aviso SAP PM</label>
          <input type="text" id="input-aviso-cbm-sap" value="${escaparHTML(aviso.avisoSap)}" placeholder="Ej: 10058921" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; font-family: monospace; font-size: 0.9rem; outline: none;">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px;">Prioridad</label>
            <select id="select-aviso-cbm-prioridad" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; outline: none;">
              <option value="Alta" ${aviso.prioridadSap === 'Alta' ? 'selected' : ''}>Alta</option>
              <option value="Media" ${aviso.prioridadSap === 'Media' ? 'selected' : ''}>Media</option>
              <option value="Baja" ${aviso.prioridadSap === 'Baja' ? 'selected' : ''}>Baja</option>
            </select>
          </div>
          <div>
            <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px;">Estado</label>
            <select id="select-aviso-cbm-estado" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; outline: none;">
              <option value="Pendiente" ${aviso.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="Emitido" ${aviso.estado === 'Emitido' ? 'selected' : ''}>Emitido</option>
              <option value="Realizado" ${aviso.estado === 'Realizado' ? 'selected' : ''}>Realizado</option>
              <option value="No realizado" ${aviso.estado === 'No realizado' ? 'selected' : ''}>No realizado</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px;">Observación de cierre / ejecución</label>
          <textarea id="input-aviso-cbm-cierre" rows="3" placeholder="Detalle de la ejecución, motivo de no realización, repuestos, etc." style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; font-size: 0.8rem; outline: none; resize: vertical;">${escaparHTML(aviso.observacionCierre || '')}</textarea>
        </div>

        ${
          aviso.creadoPor
            ? `<p style="margin: 0; font-size: 0.68rem; color: #64748B;">Generado por ${escaparHTML(aviso.creadoPor)}</p>`
            : ''
        }
      </div>

      <footer style="padding: 12px 18px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 8px; position: sticky; bottom: 0;">
        <button type="button" data-accion="avisosCbm:cerrarModal" style="background: transparent; color: #94A3B8; border: 1px solid rgba(255,255,255,0.2); padding: 7px 14px; border-radius: 6px; cursor: pointer; font-weight: 700;">Cancelar</button>
        <button type="button" data-accion="avisosCbm:guardar" data-args='${argsJson([aviso.id])}' style="background: #0284c7; color: white; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 800; cursor: pointer;">Guardar aviso</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.remove();
  });
};

const validarTransicion = (estado: EstadoAvisoCBM, avisoSap: string): string | null => {
  if (estado === 'Emitido' && !avisoSap.trim()) {
    return 'Ingresa el número de aviso SAP antes de marcarlo como Emitido.';
  }
  return null;
};

const marcarAviso = async (avisoId: string, estado: EstadoAvisoCBM): Promise<void> => {
  const aviso = avisos.find((item) => item.id === avisoId);
  if (!aviso) return;

  const error = validarTransicion(estado, aviso.avisoSap);
  if (error) {
    UI.mostrarToast(error, 'info');
    return;
  }

  aviso.estado = estado;
  if (estado === 'Emitido' && !aviso.fechaEmision) {
    aviso.fechaEmision = formatearFechaCorta(new Date());
  }
  if (estado === 'Realizado' || estado === 'No realizado') {
    aviso.fechaCierre = formatearFechaCorta(new Date());
  }
  await persistirAviso(aviso);
  UI.mostrarToast(
    `Aviso ${aviso.avisoSap || aviso.id} de ${aviso.tag} marcado como ${estado}.`,
    'exito',
  );
  await renderizarModuloAvisosCBM();
};

// ============================================================================
// COMANDOS
// ============================================================================
registrarComando('avisosCbm:abrir', (_evento, tag) => {
  filtroTag = tag ? String(tag) : null;
  filtroTexto = '';
  filtroEstado = 'TODOS';
  ejecutarComando('mapa:destruir');
  void renderizarModuloAvisosCBM();
});

registrarComando('avisosCbm:renderizar', () => {
  void renderizarModuloAvisosCBM();
});

registrarComando('avisosCbm:recargar', async () => {
  await cargarAvisosCBM(true);
  await renderizarModuloAvisosCBM();
});

registrarComando('avisosCbm:cambiarEstado', (evento) => {
  filtroEstado = ((evento?.target as HTMLSelectElement | null)?.value ?? 'TODOS') as
    EstadoAvisoCBM | 'TODOS';
  actualizarTabla();
});

registrarComando('avisosCbm:buscar', (evento) => {
  filtroTexto = (evento?.target as HTMLInputElement | null)?.value ?? '';
  actualizarTabla();
});

registrarComando('avisosCbm:limpiarTag', () => {
  filtroTag = null;
  void renderizarModuloAvisosCBM();
});

registrarComando('avisosCbm:gestionar', (_evento, id) => {
  abrirModalGestion(String(id ?? ''));
});

registrarComando('avisosCbm:cerrarModal', () => {
  document.getElementById('modal-gestionar-aviso-cbm')?.remove();
});

registrarComando('avisosCbm:guardar', async (_evento, id) => {
  const aviso = avisos.find((item) => item.id === String(id ?? ''));
  if (!aviso) return;

  const inputSap = document.getElementById('input-aviso-cbm-sap') as HTMLInputElement | null;
  const selectPrioridad = document.getElementById(
    'select-aviso-cbm-prioridad',
  ) as HTMLSelectElement | null;
  const selectEstado = document.getElementById(
    'select-aviso-cbm-estado',
  ) as HTMLSelectElement | null;
  const inputCierre = document.getElementById(
    'input-aviso-cbm-cierre',
  ) as HTMLTextAreaElement | null;

  const avisoSap = inputSap?.value.trim() ?? aviso.avisoSap;
  const estado = (selectEstado?.value as EstadoAvisoCBM) || aviso.estado;
  const error = validarTransicion(estado, avisoSap);
  if (error) {
    UI.mostrarToast(error, 'info');
    return;
  }

  aviso.avisoSap = avisoSap;
  aviso.prioridadSap = (selectPrioridad?.value as PrioridadAvisoCBM) || aviso.prioridadSap;
  aviso.estado = estado;
  aviso.observacionCierre = inputCierre?.value.trim() || '';
  if (aviso.estado === 'Emitido' && !aviso.fechaEmision) {
    aviso.fechaEmision = formatearFechaCorta(new Date());
  }
  if (aviso.estado === 'Realizado' || aviso.estado === 'No realizado') {
    aviso.fechaCierre = formatearFechaCorta(new Date());
  }

  await persistirAviso(aviso);
  document.getElementById('modal-gestionar-aviso-cbm')?.remove();
  UI.mostrarToast(`Aviso CBM de ${aviso.tag} actualizado.`, 'exito');
  await renderizarModuloAvisosCBM();
});

registrarComando('avisosCbm:marcar', async (_evento, id, estado) => {
  await marcarAviso(String(id ?? ''), String(estado ?? '') as EstadoAvisoCBM);
});
