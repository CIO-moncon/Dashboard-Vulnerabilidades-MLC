import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';
import { evaluarISO20816, ZonaIsoId } from '../../core/domain/evaluadorIso';
import { masterTemplateRegistry } from '../../core/domain/plantillas';

export type SeveridadCBM = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' | 'SIN_DATOS';

export interface PuntoMedicionCBM {
  id: string;
  punto: string;
  componente: string;
  rms: number | string;
  temp: number | string;
  fc: number | string;
  fecha?: string;
}

export interface HitoTimeline {
  idKey: string;
  origen: 'timeline' | 'pms';
  titulo: string;
  detalle: string;
  severidadAnterior?: string;
  severidadNueva?: string;
  avisoSap?: string;
  otSap?: string;
  evaluacionCondicion?: string;
  autor?: string;
  timestamp: string | number;
  evidencias?: Array<{ tipo: 'imagen' | 'video'; data: string }>;
}

export interface AnaliticaPythonData {
  rms_mm_s: number;
  factor_cresta: number;
  pico_maximo: number;
  evaluacion_iso: string;
  anomalia_ml: boolean;
  recomendacion_mantenimiento: string;
  picos_espectrales?: Array<{ frecuencia_hz: number; amplitud: number }>;
}

export interface ActivoExpediente {
  id: string;
  tag: string;
  nombre: string;
  area: string;
  nivel: string;
  severidad: string;
  estado?: string;
  potencia?: number | string;
  rpm?: number | string;
  latitud?: number;
  longitud?: number;
  spots?: Record<string, PuntoMedicionCBM> | PuntoMedicionCBM[];
  components?: PuntoMedicionCBM[];
  timeline?: Record<string, Omit<HitoTimeline, 'idKey' | 'origen'>>;
  bitacora?: Record<string, any>;
  analitica_python?: AnaliticaPythonData;
  ultimaInspeccion?: string;
}

// Variables de estado del módulo
let equipoActual: ActivoExpediente | null = null;
let idEquipoActual: string | null = null;

// Inyección de estilos de severidad y timeline
const inyectarEstilosSeveridad = (): void => {
  if (typeof document === 'undefined' || document.getElementById('cbm-estilos-dinamicos-severidad')) return;
  const style = document.createElement('style');
  style.id = 'cbm-estilos-dinamicos-severidad';
  style.innerHTML = `
    .cbm-input-optima {
      background-color: rgba(0, 230, 118, 0.22) !important;
      border: 2px solid #00e676 !important;
      color: #00e676 !important;
      box-shadow: 0 0 10px rgba(0, 230, 118, 0.35) !important;
      font-weight: 800 !important;
    }
    .cbm-input-seguimiento {
      background-color: rgba(234, 179, 8, 0.22) !important;
      border: 2px solid #eab308 !important;
      color: #facc15 !important;
      box-shadow: 0 0 10px rgba(234, 179, 8, 0.35) !important;
      font-weight: 800 !important;
    }
    .cbm-input-alerta {
      background-color: rgba(249, 115, 22, 0.25) !important;
      border: 2px solid #f97316 !important;
      color: #fb923c !important;
      box-shadow: 0 0 10px rgba(249, 115, 22, 0.35) !important;
      font-weight: 800 !important;
    }
    .cbm-input-critica {
      background-color: rgba(239, 68, 68, 0.28) !important;
      border: 2px solid #ef4444 !important;
      color: #f87171 !important;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.45) !important;
      font-weight: 800 !important;
    }
    .timeline-cbm-contenedor {
      position: relative;
      padding-left: 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .timeline-cbm-contenedor::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: rgba(255, 255, 255, 0.12);
    }
    .timeline-hito-item {
      position: relative;
      background: rgba(22, 40, 45, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .timeline-hito-item:hover {
      background: rgba(28, 52, 59, 0.95);
      border-color: var(--primary-color, #38bdf8);
      transform: translateX(4px);
    }
    .timeline-punto-nodo {
      position: absolute;
      left: -24px;
      top: 14px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid #0E1B1F;
      box-shadow: 0 0 8px currentColor;
    }
  `;
  document.head.appendChild(style);
};
inyectarEstilosSeveridad();

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const resolverColorBadge = (sev = ''): string => {
  const s = String(sev).toLowerCase();
  if (s.includes('rojo') || s.includes('crit') || s.includes('zona d')) return '#ef4444';
  if (s.includes('naranja') || s.includes('alert') || s.includes('zona c')) return '#f97316';
  if (s.includes('amarillo') || s.includes('seg') || s.includes('zona b')) return '#eab308';
  if (s.includes('normal') || s.includes('optimo') || s.includes('verde') || s.includes('zona a')) return '#00e676';
  return '#38bdf8';
};

export const clasificarPuntoCinematico = (puntoRaw = '') => {
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

export const ordenarPuntosCinematicos = (a: { punto?: string; id?: string }, b: { punto?: string; id?: string }) => {
  const infoA = clasificarPuntoCinematico(a.punto || a.id);
  const infoB = clasificarPuntoCinematico(b.punto || b.id);
  if (infoA.peso !== infoB.peso) return infoA.peso - infoB.peso;
  if (infoA.num !== infoB.num) return infoA.num - infoB.num;
  if (infoA.pesoSufijo !== infoB.pesoSufijo) return infoA.pesoSufijo - infoB.pesoSufijo;
  return infoA.sufijo.localeCompare(infoB.sufijo);
};

export const deducirNombreComponente = (puntoStr: string, nombreOriginal?: string): string => {
  if (nombreOriginal && nombreOriginal !== 'Componente' && nombreOriginal.trim() !== '') {
    return nombreOriginal;
  }
  const p = String(puntoStr || '').toUpperCase();
  if (p === 'M1' || p === 'M1_LL') return 'Motor NDE (Lado Libre)';
  if (p === 'M2' || p === 'M2_LA') return 'Motor DE (Lado Acople)';
  if (p.startsWith('G') || p.startsWith('RED')) {
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

// ----------------------------------------------------------------------------
// VERIFICACIÓN DEL MOTOR FASTAPI
// ----------------------------------------------------------------------------
export const verificarEstadoBackend = async (): Promise<boolean> => {
  const indicadorEl = document.getElementById('estado-backend-python');
  try {
    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), 2000);

    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controlador.signal
    });
    clearTimeout(timeoutId);

    if (response.ok && indicadorEl) {
      indicadorEl.innerHTML = `
        <span style="display: inline-block; width: 8px; height: 8px; background: #00e676; border-radius: 50%; box-shadow: 0 0 8px #00e676; margin-right: 5px;"></span>
        <span style="color: #00e676; font-size: 0.72rem; font-weight: 700;">Core Engine: En Línea (FFT + ML)</span>
      `;
      return true;
    }
    throw new Error('Respuesta no OK');
  } catch {
    if (indicadorEl) {
      indicadorEl.innerHTML = `
        <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; box-shadow: 0 0 8px #f59e0b; margin-right: 5px;"></span>
        <span style="color: #facc15; font-size: 0.72rem; font-weight: 700;">Core Engine: Modo Offline Local</span>
      `;
    }
    return false;
  }
};

// ----------------------------------------------------------------------------
// EVALUACIÓN DINÁMICA DE ENTRADAS EN VIVO
// ----------------------------------------------------------------------------
export const evaluarInputEnVivo = (inputEl: HTMLInputElement, tipo: 'rms' | 'temp' | 'fc'): void => {
  if (!inputEl) return;
  const v = Number.parseFloat(inputEl.value);

  inputEl.classList.remove('cbm-input-optima', 'cbm-input-seguimiento', 'cbm-input-alerta', 'cbm-input-critica');

  if (!Number.isFinite(v) || inputEl.value.trim() === '') {
    inputEl.style.removeProperty('background-color');
    inputEl.style.removeProperty('border-color');
    inputEl.style.removeProperty('color');
    inputEl.style.removeProperty('box-shadow');
    inputEl.style.removeProperty('font-weight');
    return;
  }

  let clase = 'cbm-input-optima';
  let bg = 'rgba(0, 230, 118, 0.22)';
  let border = '#00e676';
  let color = '#00e676';
  let shadow = '0 0 10px rgba(0, 230, 118, 0.35)';

  if (tipo === 'rms') {
    const resIso = evaluarISO20816(v, 'grupo1', 'rigido');
    if (resIso.zona === 'D') {
      clase = 'cbm-input-critica';
      bg = 'rgba(239, 68, 68, 0.28)';
      border = '#ef4444';
      color = '#f87171';
      shadow = '0 0 12px rgba(239, 68, 68, 0.45)';
    } else if (resIso.zona === 'C') {
      clase = 'cbm-input-alerta';
      bg = 'rgba(249, 115, 22, 0.25)';
      border = '#f97316';
      color = '#fb923c';
      shadow = '0 0 10px rgba(249, 115, 22, 0.35)';
    } else if (resIso.zona === 'B') {
      clase = 'cbm-input-seguimiento';
      bg = 'rgba(234, 179, 8, 0.22)';
      border = '#eab308';
      color = '#facc15';
      shadow = '0 0 10px rgba(234, 179, 8, 0.35)';
    }
  } else if (tipo === 'temp') {
    if (v >= 80.0) {
      clase = 'cbm-input-critica';
      bg = 'rgba(239, 68, 68, 0.28)';
      border = '#ef4444';
      color = '#f87171';
      shadow = '0 0 12px rgba(239, 68, 68, 0.45)';
    } else if (v >= 65.0) {
      clase = 'cbm-input-alerta';
      bg = 'rgba(249, 115, 22, 0.25)';
      border = '#f97316';
      color = '#fb923c';
      shadow = '0 0 10px rgba(249, 115, 22, 0.35)';
    } else if (v >= 55.0) {
      clase = 'cbm-input-seguimiento';
      bg = 'rgba(234, 179, 8, 0.22)';
      border = '#eab308';
      color = '#facc15';
      shadow = '0 0 10px rgba(234, 179, 8, 0.35)';
    }
  } else if (tipo === 'fc') {
    if (v >= 5.0) {
      clase = 'cbm-input-critica';
      bg = 'rgba(239, 68, 68, 0.28)';
      border = '#ef4444';
      color = '#f87171';
      shadow = '0 0 12px rgba(239, 68, 68, 0.45)';
    } else if (v >= 3.5) {
      clase = 'cbm-input-alerta';
      bg = 'rgba(249, 115, 22, 0.25)';
      border = '#f97316';
      color = '#fb923c';
      shadow = '0 0 10px rgba(249, 115, 22, 0.35)';
    } else if (v >= 2.5) {
      clase = 'cbm-input-seguimiento';
      bg = 'rgba(234, 179, 8, 0.22)';
      border = '#eab308';
      color = '#facc15';
      shadow = '0 0 10px rgba(234, 179, 8, 0.35)';
    }
  }

  inputEl.classList.add(clase);
  inputEl.style.setProperty('background-color', bg, 'important');
  inputEl.style.setProperty('border-color', border, 'important');
  inputEl.style.setProperty('color', color, 'important');
  inputEl.style.setProperty('box-shadow', shadow, 'important');
  inputEl.style.setProperty('font-weight', '800', 'important');
};

// ----------------------------------------------------------------------------
// FASE 7: LÍNEA DE TIEMPO HISTÓRICA DEL ACTIVO (TIMELINE UI)
// ----------------------------------------------------------------------------
export const abrirModalTimelineActivo = async (idActivo: string): Promise<void> => {
  const modalId = 'modal-timeline-completo-activo';
  document.getElementById(modalId)?.remove();

  const eq: ActivoExpediente = equipoActual || { id: idActivo, tag: idActivo, nombre: 'Activo', area: 'General', nivel: '1', severidad: 'VERDE' };
  const tag = eq.tag || idActivo;

  // Consultar registros consolidados desde backend o memoria local
  let listaCompleta: HitoTimeline[] = [];

  try {
    const response = await fetch(`/api/cbm/registros?tag=${encodeURIComponent(tag)}&limit=100`, {
      headers: AuthService.getHeadersTenant()
    });
    if (response.ok) {
      const data = await response.json();
      const registrosServidor = data.registros || [];
      registrosServidor.forEach((r: any) => {
        const payload = r.payload || {};
        listaCompleta.push({
          idKey: r.id,
          origen: payload.otSap ? 'pms' : 'timeline',
          titulo: payload.otSap ? `Intervención SAP PM: OT ${payload.otSap}` : (payload.titulo || `Inspección CBM: ${payload.componente || tag}`),
          detalle: payload.detalle || payload.descripcion || 'Sin detalle registrado',
          severidadNueva: payload.severidad || 'Normal',
          severidadAnterior: payload.severidadAnterior,
          avisoSap: payload.avisoSap,
          otSap: payload.otSap,
          evaluacionCondicion: payload.severidadIso || payload.severidad,
          autor: payload.inspector || r.user_id,
          timestamp: payload.timestamp || r.creado_en * 1000,
          evidencias: payload.evidencias
        });
      });
    }
  } catch (err) {
    console.warn('[Timeline] Consulta de servidor omitida, usando estado local:', err);
  }

  // Fallback con eventos de timeline local del activo si existen
  if (listaCompleta.length === 0 && eq.timeline) {
    Object.entries(eq.timeline).forEach(([k, v]) => {
      listaCompleta.push({ idKey: k, origen: 'timeline', ...v } as HitoTimeline);
    });
  }

  listaCompleta.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; width: 95%; max-width: 740px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.8);">
      <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-outlined" style="color: #F5A623; font-size: 1.4rem;">timeline</span>
          <div>
            <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', monospace;">
              Línea de Tiempo Operativa: ${escaparHTML(tag)}
            </h3>
            <p style="margin: 0; font-size: 0.72rem; color: #94A3B8;">
              Historial trazable de mediciones CBM, anomalías ISO 20816-3 e intervenciones SAP PM.
            </p>
          </div>
        </div>
        <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </header>

      <div style="padding: 18px 20px; overflow-y: auto; flex: 1;">
        ${listaCompleta.length === 0 ? `
          <div style="padding: 3rem 1rem; text-align: center; color: #94A3B8; font-size: 0.85rem; background: rgba(0,0,0,0.25); border-radius: 8px;">
            <span class="material-symbols-outlined" style="font-size: 2.2rem; color: #64748B; margin-bottom: 6px;">event_note</span>
            <p style="margin: 0;">No se registran eventos ni cambios de condición para ${escaparHTML(tag)}.</p>
          </div>
        ` : `
          <div class="timeline-cbm-contenedor">
            ${listaCompleta.map((item) => {
              const colorNodo = resolverColorBadge(item.severidadNueva || item.severidadAnterior);
              const fechaTexto = item.timestamp ? new Date(item.timestamp).toLocaleString('es-CL') : 'Fecha no especificada';

              const payloadEnc = encodeURIComponent(JSON.stringify(item));
              return `
                <div class="timeline-hito-item" onclick="window.abrirModalDetalleTimeline('${payloadEnc}')" title="Clic para ver detalle">
                  <span class="timeline-punto-nodo" style="background-color: ${colorNodo}; color: ${colorNodo};"></span>
                  
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong style="color: #ffffff; font-size: 0.88rem;">${escaparHTML(item.titulo)}</strong>
                      <span style="background: rgba(0,0,0,0.4); color: ${colorNodo}; border: 1px solid ${colorNodo}; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">
                        ${escaparHTML(item.severidadNueva || 'Info')}
                      </span>
                      ${item.otSap ? `<span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-family: monospace;">OT: ${escaparHTML(item.otSap)}</span>` : ''}
                      ${item.avisoSap ? `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-family: monospace;">SAP: ${escaparHTML(item.avisoSap)}</span>` : ''}
                    </div>
                    <time style="font-size: 0.7rem; color: #94A3B8; font-family: monospace;">${fechaTexto}</time>
                  </div>

                  <p style="margin: 6px 0 0 0; font-size: 0.78rem; color: #CBD5E1; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escaparHTML(item.detalle)}
                  </p>

                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 0.7rem; color: #64748B;">
                    <span>👤 Registrado por: ${escaparHTML(item.autor || 'Sistema')}</span>
                    ${item.evidencias && item.evidencias.length > 0 ? `<span style="color: #38bdf8; display: inline-flex; align-items: center; gap: 3px;"><span class="material-symbols-outlined" style="font-size: 0.85rem;">photo_camera</span> ${item.evidencias.length} evidencias</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <footer style="padding: 12px 20px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end;">
        <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 7px 16px; border-radius: 6px; font-weight: 700; cursor: pointer;">Cerrar</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
};

export const abrirModalDetalleTimeline = (hitoJsonStr: string): void => {
  try {
    const hito: HitoTimeline = JSON.parse(decodeURIComponent(hitoJsonStr));
    const modalId = 'modal-detalle-timeline-item';
    document.getElementById(modalId)?.remove();

    const colorSevNueva = resolverColorBadge(hito.severidadNueva);
    const colorSevAnt = resolverColorBadge(hito.severidadAnterior);
    const fechaFmt = hito.timestamp ? new Date(hito.timestamp).toLocaleString('es-CL') : 'Fecha no especificada';

    let evidenciasHTML = '';
    if (hito.evidencias && Array.isArray(hito.evidencias) && hito.evidencias.length > 0) {
      evidenciasHTML = `
        <div style="margin-top: 10px;">
          <label style="font-size: 0.72rem; color: #94A3B8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 6px;">
            Evidencias Adjuntas (${hito.evidencias.length}):
          </label>
          <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;">
            ${hito.evidencias.map((ev, i) => {
              if (ev.tipo === 'video') {
                return `<video src="${ev.data}" controls style="height: 100px; width: 140px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0;"></video>`;
              }
              return `<img src="${ev.data}" style="height: 100px; width: 100px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; flex-shrink: 0;" alt="Evidencia ${i + 1}">`;
            }).join('')}
          </div>
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100000;';

    modal.innerHTML = `
      <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 95%; max-width: 500px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
        <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: #38bdf8;">history_toggle_off</span>
            <h3 style="margin: 0; color: #ffffff; font-size: 1rem; font-weight: 700;">Hito de Bitácora CBM</h3>
          </div>
          <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.4rem; cursor: pointer;">&times;</button>
        </header>

        <div style="padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem; color: #E2E8F0;">
          <div>
            <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 0.98rem;">${escaparHTML(hito.titulo)}</h4>
            <time style="font-size: 0.72rem; color: #94A3B8;">📅 ${escaparHTML(fechaFmt)} | Autor: ${escaparHTML(hito.autor || 'Sistema')}</time>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.75rem; color: #94A3B8;">Severidad:</span>
            <span style="background: rgba(0,0,0,0.5); color: ${colorSevAnt}; border: 1px solid ${colorSevAnt}; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: bold;">
              ${escaparHTML(hito.severidadAnterior || 'N/A')}
            </span>
            <span class="material-symbols-outlined" style="font-size: 0.9rem; color: #64748B;">arrow_forward</span>
            <span style="background: rgba(0,0,0,0.5); color: ${colorSevNueva}; border: 1px solid ${colorSevNueva}; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: bold;">
              ${escaparHTML(hito.severidadNueva || 'N/A')}
            </span>
          </div>

          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); padding: 10px 12px; border-radius: 6px;">
            <span style="font-size: 0.7rem; color: #38bdf8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Detalle / Diagnóstico:</span>
            <p style="margin: 0; white-space: pre-line; line-height: 1.4; color: #CBD5E1;">${escaparHTML(hito.detalle)}</p>
          </div>

          ${evidenciasHTML}
        </div>

        <footer style="padding: 10px 18px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end;">
          <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 700; cursor: pointer;">Cerrar</button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);
  } catch (e) {
    console.error('Error al abrir detalle de timeline:', e);
  }
};

// ----------------------------------------------------------------------------
// RENDERIZADO DEL EXPEDIENTE Y RUTA CINEMÁTICA
// ----------------------------------------------------------------------------
export const renderizarExpediente = async (idActivo: string, idContenedor = 'espacio-trabajo-dinamico'): Promise<void> => {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  idEquipoActual = idActivo;

  // Consultar ficha técnica del activo desde backend / catálogo local
  const w = window as any;
  equipoActual = (w.datosGlobalesEquipos && w.datosGlobalesEquipos[idActivo]) || null;

  if (!equipoActual) {
    equipoActual = {
      id: idActivo,
      tag: idActivo,
      nombre: 'Activo de Planta',
      area: 'General',
      nivel: 'Nivel 1',
      severidad: 'VERDE'
    };
  }

  const tag = equipoActual.tag || idActivo;
  const nombre = equipoActual.nombre || 'Activo Crítico';
  const area = equipoActual.area || 'General';
  const nivel = equipoActual.nivel || 'Nivel 1';
  const sevActual = equipoActual.severidad || 'VERDE';
  const colorSevActual = resolverColorBadge(sevActual);

  // Normalización de puntos cinemáticos con fallback al registro de plantillas
  let spotsArray: PuntoMedicionCBM[] = [];
  const rawSpots = equipoActual.spots || equipoActual.components;

  if (Array.isArray(rawSpots)) {
    spotsArray = rawSpots.map((s: any, idx: number) => ({
      id: s.punto || s.tag || `P${idx + 1}`,
      punto: s.punto || s.tag || `P${idx + 1}`,
      componente: deducirNombreComponente(s.punto || s.tag, s.componente || s.nombre),
      rms: s.rms || '',
      temp: s.temp || '',
      fc: s.fc || '',
      fecha: s.fecha || ''
    }));
  } else if (typeof rawSpots === 'object' && rawSpots !== null) {
    spotsArray = Object.entries(rawSpots).map(([key, val]: [string, any]) => ({
      id: key,
      punto: val.punto || val.tag || key,
      componente: deducirNombreComponente(val.punto || val.tag || key, val.componente || val.nombre),
      rms: val.rms || '',
      temp: val.temp || '',
      fc: val.fc || '',
      fecha: val.fecha || ''
    }));
  }

  // Si no tenía spots, resolver automáticamente según cinemática de la plantilla
  if (spotsArray.length === 0) {
    const estructura = masterTemplateRegistry.resolverEstructura(tag);
    if (estructura) {
      spotsArray = estructura.nodos.flatMap((nodo) =>
        nodo.spots.map((spot) => ({
          id: spot,
          punto: spot,
          componente: `${nodo.nombre} - ${spot}`,
          rms: '',
          temp: '',
          fc: '',
          fecha: ''
        }))
      );
    }
  }

  spotsArray.sort(ordenarPuntosCinematicos);

  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const fechaHoraLocal = new Date(Date.now() - tzOffset).toISOString().slice(0, 16);

  contenedor.innerHTML = `
    <article class="panel-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.25s ease;">
      <header style="background: rgba(14, 27, 31, 0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #38bdf8;">
            <span class="material-symbols-outlined" style="font-size: 1.6rem;" aria-hidden="true">precision_manufacturing</span>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 style="margin: 0; color: #ffffff; font-size: 1.25rem; font-weight: 800; font-family: 'Space Grotesk', monospace;">
                Inspección CBM: ${escaparHTML(tag)}
              </h2>
              <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">
                ${escaparHTML(nivel)}
              </span>
              <span style="background: rgba(0,0,0,0.5); color: ${colorSevActual}; border: 1px solid ${colorSevActual}; font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 4px;">
                Condición: ${escaparHTML(sevActual.toUpperCase())}
              </span>
              <div id="estado-backend-python" style="display: inline-flex; align-items: center; background: rgba(0,0,0,0.4); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                <span style="display: inline-block; width: 8px; height: 8px; background: #facc15; border-radius: 50%; margin-right: 5px;"></span>
                <span style="color: #facc15; font-size: 0.72rem;">Verificando Core...</span>
              </div>
            </div>
            <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #94A3B8;">
              ${escaparHTML(nombre)} | <span style="color: #38bdf8; font-weight: 600;">${escaparHTML(area)}</span>
            </p>
          </div>
        </div>

        <nav aria-label="Acciones del activo" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button type="button" 
                  id="btn-timeline-directo"
                  onclick="window.abrirModalTimelineActivo('${escaparHTML(idActivo)}')" 
                  title="Ver bitácora técnica e historial de eventos"
                  style="background: rgba(245, 166, 35, 0.18); color: #F5A623; border: 1px solid rgba(245, 166, 35, 0.45); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">timeline</span>
            <span>Bitácora & Trazabilidad</span>
          </button>

          <button type="button" id="btn-cerrar-expediente" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">close</span>
          </button>
        </nav>
      </header>

      <section style="background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">speed</span>
            <h3 style="margin: 0; font-size: 1.05rem; color: #ffffff; font-weight: 800;">
              Ingreso de Mediciones CBM (Ruta Cinemática)
            </h3>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="fecha-ruta-terreno" style="font-size: 0.78rem; color: #94A3B8; font-weight: 600;">Fecha y Hora:</label>
            <input type="datetime-local" id="fecha-ruta-terreno" value="${fechaHoraLocal}" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; outline: none; font-family: monospace;">
          </div>
        </div>

        <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
            <thead>
              <tr style="background: rgba(0,0,0,0.4); color: #94A3B8; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <th style="padding: 12px 10px; min-width: 75px;">Punto</th>
                <th style="padding: 12px 10px; min-width: 210px;">Componente Cinemático</th>
                <th style="padding: 12px 10px; min-width: 140px;">Lectura Previa</th>
                <th style="padding: 12px 10px; min-width: 110px;">RMS (mm/s)</th>
                <th style="padding: 12px 10px; min-width: 110px;">Temp (°C)</th>
                <th style="padding: 12px 10px; min-width: 110px;">FC+</th>
              </tr>
            </thead>
            <tbody id="tabla-spots-body">
              ${spotsArray.map((s) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 10px; font-weight: 800; font-family: monospace; color: #ffffff;">${escaparHTML(s.punto)}</td>
                  <td style="padding: 10px; color: #CBD5E1; font-weight: 600;">${escaparHTML(s.componente)}</td>
                  <td style="padding: 10px; color: #94A3B8; font-family: monospace;">
                    ${s.rms ? `${Number(s.rms).toFixed(2)} mm/s` : '---'}
                  </td>
                  <td style="padding: 10px;">
                    <input type="number" step="0.01" class="input-cbm-punto" data-punto="${escaparHTML(s.punto)}" data-componente="${escaparHTML(s.componente)}" data-tipo="rms" placeholder="RMS" style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box;">
                  </td>
                  <td style="padding: 10px;">
                    <input type="number" step="0.1" class="input-cbm-punto" data-punto="${escaparHTML(s.punto)}" data-componente="${escaparHTML(s.componente)}" data-tipo="temp" placeholder="°C" style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box;">
                  </td>
                  <td style="padding: 10px;">
                    <input type="number" step="0.01" class="input-cbm-punto" data-punto="${escaparHTML(s.punto)}" data-componente="${escaparHTML(s.componente)}" data-tipo="fc" placeholder="FC+" style="width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; outline: none; font-family: monospace; box-sizing: border-box;">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
          <button type="button" 
                  id="btn-guardar-ruta-cbm"
                  onclick="window.guardarMedicionesRuta('${escaparHTML(idActivo)}')" 
                  style="background: #F5A623; color: #0E1B1F; border: none; padding: 11px 20px; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" aria-hidden="true">save</span>
            <span>Registrar Mediciones en Trazabilidad</span>
          </button>
        </div>
      </section>
    </article>
  `;

  verificarEstadoBackend();

  const tbody = document.getElementById('tabla-spots-body');
  if (tbody) {
    tbody.addEventListener('input', (e) => {
      const inp = (e.target as HTMLElement).closest('.input-cbm-punto') as HTMLInputElement | null;
      if (inp) {
        const tipo = inp.getAttribute('data-tipo') as 'rms' | 'temp' | 'fc';
        evaluarInputEnVivo(inp, tipo);
      }
    });
  }
};

// ----------------------------------------------------------------------------
// GUARDADO Y DESPACHO DE MEDICIONES CON AUDIT TRAIL
// ----------------------------------------------------------------------------
export const guardarMedicionesRuta = async (idActivo: string): Promise<void> => {
  const btn = document.getElementById('btn-guardar-ruta-cbm') as HTMLButtonElement | null;
  const inputFecha = document.getElementById('fecha-ruta-terreno') as HTMLInputElement | null;
  const fechaHora = inputFecha?.value ? new Date(inputFecha.value).toISOString() : new Date().toISOString();

  const inputs = document.querySelectorAll<HTMLInputElement>('.input-cbm-punto');
  const medicionesPorPunto: Record<string, any> = {};
  const amplitudesRMS: number[] = [];

  inputs.forEach((inp) => {
    const punto = inp.getAttribute('data-punto') || '';
    const componente = inp.getAttribute('data-componente') || punto;
    const tipo = inp.getAttribute('data-tipo');
    const val = inp.value.trim();

    if (val) {
      if (!medicionesPorPunto[punto]) {
        medicionesPorPunto[punto] = { punto, componente };
      }
      medicionesPorPunto[punto][tipo!] = Number.parseFloat(val);
      if (tipo === 'rms') {
        amplitudesRMS.push(Number.parseFloat(val));
      }
    }
  });

  if (Object.keys(medicionesPorPunto).length === 0) {
    alert('Debe ingresar al menos una medición para registrar la ruta.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Evaluando y Despachando...`;
  }

  try {
    const eq = equipoActual || { tag: idActivo, severidad: 'VERDE' };
    const tagLimpio = String(eq.tag || idActivo).trim().toUpperCase();
    const sevAnterior = eq.severidad || 'VERDE';

   // Determinar peor condición según norma ISO 20816-3
    let peorZona: ZonaIsoId = 'A';
    for (const rms of amplitudesRMS) {
      const res = evaluarISO20816(rms, 'grupo1', 'rigido');
      if (res.zona === 'D') {
        peorZona = 'D';
        break;
      }
      if (res.zona === 'C') {
        peorZona = 'C';
      } else if (res.zona === 'B' && peorZona === 'A') {
        peorZona = 'B';
      }
    }

    const mapeoSeveridad: Record<ZonaIsoId, SeveridadCBM> = {
      A: 'VERDE',
      B: 'AMARILLO',
      C: 'NARANJA',
      D: 'ROJO',
      SIN_DATOS: 'SIN_DATOS'
    };
    const peorSeveridad = mapeoSeveridad[peorZona];

    // Análisis FFT opcional en backend si existen lecturas
    let resultadoAnalitico: AnaliticaPythonData | null = null;
    if (amplitudesRMS.length >= 8) {
      try {
        const resFFT = await fetch('/api/analizar-vibracion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...AuthService.getHeadersTenant()
          },
          body: JSON.stringify({
            tag_equipo: tagLimpio,
            amplitudes: amplitudesRMS,
            frecuencia_muestreo: 1000.0
          })
        });
        if (resFFT.ok) {
          const dataFFT = await resFFT.json();
          resultadoAnalitico = dataFFT.resultado_analisis;
        }
      } catch (err) {
        console.warn('[Expediente] Fallback de análisis FFT por desconexión:', err);
      }
    }

    const sesion = AuthService.getSesion();
    const payloadRegistro = {
      tag: tagLimpio,
      idActivo,
      fecha: fechaHora,
      puntos: medicionesPorPunto,
      severidadAnterior: sevAnterior,
      severidadNueva: peorSeveridad,
      zonaIso: peorZona,
      analitica: resultadoAnalitico,
      inspector: sesion?.nombre || sesion?.email || 'Inspector CBM'
    };

    // Despacho directo con respaldo automático en Outbox IndexedDB
    const despacho = await SyncManager.despacharOEncolar(
      `inspeccion_ruta:${tagLimpio}`,
      'CBM_MEASURE',
      payloadRegistro
    );

    const msg = despacho.sincronizadoDirecto
      ? `✅ Mediciones transmitidas al servidor. Condición resultante: ${peorSeveridad}`
      : `📴 Mediciones resguardadas en cola offline. Condición: ${peorSeveridad}`;
    
    alert(msg);
    renderizarExpediente(idActivo);
  } catch (err) {
    console.error('[Expediente] Error al registrar ruta CBM:', err);
    alert('Error al registrar mediciones de ruta.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined">save</span> Registrar Mediciones en Trazabilidad`;
    }
  }
};

// Exposición al objeto window para compatibilidad con botones inline del DOM
if (typeof window !== 'undefined') {
  const w = window as any;
  w.abrirModalTimelineActivo = abrirModalTimelineActivo;
  w.abrirModalDetalleTimeline = abrirModalDetalleTimeline;
  w.evaluarInputEnVivo = evaluarInputEnVivo;
  w.guardarMedicionesRuta = guardarMedicionesRuta;
  w.renderizarExpediente = renderizarExpediente;
}