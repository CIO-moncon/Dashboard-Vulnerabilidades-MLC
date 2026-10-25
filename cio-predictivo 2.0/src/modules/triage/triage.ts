import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';
import { EvidenciaAlerta } from '../terreno/terrenoCore';

export type EstadoTriage = 'Pendiente' | 'nuevo' | 'Visto' | 'Validado' | 'Descartado';
export type FiltroEstadoTriage = 'PENDIENTES' | 'VALIDADOS' | 'TODOS';

export interface HallazgoTriage {
  id: string;
  tenantId?: string;
  tag: string;
  area: string;
  componente?: string;
  severidad: string;
  severidadPreliminar?: string;
  severidadValidada?: string;
  severidadIso?: string;
  descripcion?: string;
  detalle?: string;
  diagnostico?: string;
  avisoSap?: string;
  estado: EstadoTriage;
  inspector?: string;
  analistaValidador?: string;
  timestamp: string | number;
  evidencias?: EvidenciaAlerta[];
  fotoBase64?: string;
}

let listaHallazgosActuales: Record<string, HallazgoTriage> = {};
let filtroEstadoTriage: FiltroEstadoTriage = 'PENDIENTES';
let filtroBusquedaTriage = '';
let timerEscuchaBadge: number | null = null;

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const normalizarSeveridadParaCatastro = (textoSev = ''): string => {
  const s = String(textoSev).toLowerCase();
  if (s.includes('rojo') || s.includes('zona d') || s.includes('critico') || s.includes('crítico')) return 'Rojo';
  if (s.includes('naranja') || s.includes('zona c') || s.includes('alerta')) return 'Naranja';
  if (s.includes('amarillo') || s.includes('zona b') || s.includes('seguimiento')) return 'Amarillo';
  return 'Verde';
};

export const obtenerColorCriticidad = (textoSev = ''): string => {
  const s = String(textoSev).toLowerCase();
  if (s.includes('rojo') || s.includes('d')) return '#ef4444';
  if (s.includes('naranja') || s.includes('c')) return '#f97316';
  if (s.includes('amarillo') || s.includes('b')) return '#eab308';
  if (s.includes('verde') || s.includes('a')) return '#00e676';
  return '#38bdf8';
};

// ============================================================================
// CONSULTA Y SINCRONIZACIÓN DE ALERTAS (FASTAPI REST + AUDIT TRAIL)
// ============================================================================
export const cargarAlertasDesdeServidor = async (): Promise<void> => {
  try {
    const sesion = AuthService.getSesion();
    if (!sesion) return;

    const response = await fetch('/api/cbm/registros?limit=150', {
      headers: AuthService.getHeadersTenant()
    });

    if (response.ok) {
      const data = await response.json();
      const registros = data.registros || [];
      const mapaTemporal: Record<string, HallazgoTriage> = {};

      registros.forEach((r: any) => {
        const payload = r.payload || {};
        const idKey = r.id || `cbm_${Date.now()}`;
        mapaTemporal[idKey] = {
          id: idKey,
          tenantId: r.tenant_id,
          tag: payload.tag || 'EQUIPO',
          area: payload.area || 'General',
          componente: payload.componente || 'Condición Global',
          severidad: payload.severidad || 'Zona C',
          severidadValidada: payload.severidadValidada,
          severidadPreliminar: payload.severidadPreliminar || payload.severidad,
          severidadIso: payload.severidadIso,
          descripcion: payload.descripcion || payload.detalle || '',
          detalle: payload.detalle || payload.descripcion || '',
          diagnostico: payload.diagnostico || '',
          avisoSap: payload.avisoSap || '',
          estado: (payload.estado as EstadoTriage) || 'Pendiente',
          inspector: payload.inspector || r.user_id,
          analistaValidador: payload.analistaValidador,
          timestamp: payload.timestamp || r.creado_en * 1000,
          evidencias: payload.evidencias || []
        };
      });

      listaHallazgosActuales = mapaTemporal;
      actualizarBadgeTriageGlobal();
      if (typeof document !== 'undefined' && document.getElementById('triage-lista-container')) {
        renderizarListaTriage();
      }
    }
  } catch (err) {
    console.warn('[Triage] Error consultando alertas del servidor:', err);
  }
};

export const iniciarEscuchaBadgeGlobal = (): void => {
  if (timerEscuchaBadge !== null) return;
  cargarAlertasDesdeServidor();
  // Sondeo periódico cada 20 segundos para monitoreo en vivo en sala de control
  timerEscuchaBadge = window.setInterval(cargarAlertasDesdeServidor, 20000);
};

const actualizarBadgeTriageGlobal = (): void => {
  if (typeof document === 'undefined') return;

  const entries = Object.entries(listaHallazgosActuales);
  let pend = 0;
  entries.forEach(([, h]) => {
    const estadoH = h.estado || 'Pendiente';
    if (estadoH === 'Pendiente' || estadoH === 'nuevo' || estadoH === 'Visto') pend++;
  });

  const badgeSidebar =
    document.getElementById('badgeTriagePendientes') ||
    document.getElementById('badgeAlertasTerreno') ||
    document.querySelector('.badge-alerta');

  if (badgeSidebar) {
    badgeSidebar.textContent = String(pend);
    if (pend > 0) {
      (badgeSidebar as HTMLElement).style.display = 'inline-flex';
      badgeSidebar.classList.add('pulsante');
    } else {
      (badgeSidebar as HTMLElement).style.display = 'none';
      badgeSidebar.classList.remove('pulsante');
    }
  }
};

// ============================================================================
// VISOR MULTIMEDIA
// ============================================================================
export const abrirVisorMultimediaInterno = (urlMedia: string, tipo: 'imagen' | 'video' = 'imagen'): void => {
  let modal = document.getElementById('modal-visor-multimedia');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="modal-visor-multimedia" class="modal-overlay" role="dialog" aria-modal="true" style="position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);">
        <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 60px rgba(0,0,0,0.8); border-radius: 14px; width: 95%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
          <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.4rem;">photo_camera</span>
              <h3 style="margin: 0; color: white; font-size: 1rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif;">Visor de Evidencia de Terreno</h3>
            </div>
            <button type="button" onclick="window.cerrarVisorMultimedia()" style="background: transparent; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;">&times;</button>
          </header>
          <div style="flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px;" id="contenedor-contenido-media">
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild!);
    modal = document.getElementById('modal-visor-multimedia');
  }

  const contenedorMedia = document.getElementById('contenedor-contenido-media');
  if (contenedorMedia) {
    if (tipo === 'video') {
      contenedorMedia.innerHTML = `<video src="${urlMedia}" controls autoplay style="max-width: 100%; max-height: 100%; border-radius: 8px;"></video>`;
    } else {
      contenedorMedia.innerHTML = `<img src="${urlMedia}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;" alt="Evidencia ampliada">`;
    }
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('oculto');
  }
};

export const cerrarVisorMultimedia = (): void => {
  const modal = document.getElementById('modal-visor-multimedia');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('oculto');
    const contenedorMedia = document.getElementById('contenedor-contenido-media');
    if (contenedorMedia) contenedorMedia.innerHTML = '';
  }
};

// ============================================================================
// RENDERIZADO DE LA VISTA PRINCIPAL DE TRIAGE
// ============================================================================
export const renderizarModuloTriage = (idContenedor = 'espacio-trabajo-dinamico'): void => {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  iniciarEscuchaBadgeGlobal();

  contenedor.innerHTML = `
    <section class="seccion-triage-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; animation: fadeIn 0.25s ease;">
      
      <header style="background: rgba(14, 27, 31, 0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif;">
            <span class="material-symbols-outlined" style="color: #F5A623;" aria-hidden="true">fact_check</span>
            Bandeja de Triage de Hallazgos CBM
          </h2>
          <p style="margin: 0; font-size: 0.78rem; color: #94A3B8;">
            Validación de anomalías en terreno con impacto en Timeline del activo y trazabilidad SAP PM.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.4); padding: 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <button type="button" id="btn-triage-pendientes" onclick="window.filtrarTriageEstado('PENDIENTES')" style="background: #F5A623; color: #0E1B1F; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
              Pendientes (<span id="lbl-triage-pend-count">0</span>)
            </button>
            <button type="button" id="btn-triage-validados" onclick="window.filtrarTriageEstado('VALIDADOS')" style="background: transparent; color: #94A3B8; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
              Validados (<span id="lbl-triage-val-count">0</span>)
            </button>
            <button type="button" id="btn-triage-todos" onclick="window.filtrarTriageEstado('TODOS')" style="background: transparent; color: #94A3B8; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
              Todos
            </button>
          </div>
        </div>
      </header>

      <div style="background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="position: relative; max-width: 320px; flex: 1;">
          <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: #94A3B8; pointer-events: none;" aria-hidden="true">search</span>
          <input type="search" id="triage-busqueda-input" placeholder="Buscar por TAG, Área, Componente..." oninput="window.filtrarTriageTexto(this.value)" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px 8px 34px; border-radius: 6px; font-size: 0.82rem; outline: none; box-sizing: border-box;">
        </div>
      </div>

      <div style="background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;">
        <div id="triage-lista-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    </section>
  `;

  renderizarListaTriage();
};

export const renderizarListaTriage = (): void => {
  const cont = document.getElementById('triage-lista-container');
  const lblPendCount = document.getElementById('lbl-triage-pend-count');
  const lblValCount = document.getElementById('lbl-triage-val-count');
  if (!cont) return;

  const entries = Object.entries(listaHallazgosActuales);

  let pend = 0;
  let val = 0;
  entries.forEach(([, h]) => {
    const estadoH = h.estado || 'Pendiente';
    if (estadoH === 'Validado' || estadoH === 'Descartado') val++;
    else pend++;
  });

  if (lblPendCount) lblPendCount.textContent = String(pend);
  if (lblValCount) lblValCount.textContent = String(val);

  const filtrados = entries.filter(([, h]) => {
    const texto = filtroBusquedaTriage.toLowerCase();
    const coincideTexto =
      !texto ||
      String(h.tag || '').toLowerCase().includes(texto) ||
      String(h.area || '').toLowerCase().includes(texto) ||
      String(h.componente || '').toLowerCase().includes(texto) ||
      String(h.descripcion || '').toLowerCase().includes(texto);

    let coincideEstado = true;
    const estadoH = h.estado || 'Pendiente';
    if (filtroEstadoTriage === 'PENDIENTES') {
      coincideEstado = estadoH === 'Pendiente' || estadoH === 'nuevo' || estadoH === 'Visto';
    } else if (filtroEstadoTriage === 'VALIDADOS') {
      coincideEstado = estadoH === 'Validado' || estadoH === 'Descartado';
    }
    return coincideTexto && coincideEstado;
  });

  filtrados.sort(([, a], [, b]) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  if (filtrados.length === 0) {
    cont.innerHTML = `
      <div style="padding: 2.5rem; text-align: center; color: #94A3B8; font-size: 0.85rem;">
        <span class="material-symbols-outlined" style="font-size: 2.2rem; color: #38bdf8; margin-bottom: 8px;" aria-hidden="true">inbox</span>
        <p style="margin: 0;">No se encontraron hallazgos en la bandeja bajo el filtro seleccionado.</p>
      </div>
    `;
    return;
  }

  cont.innerHTML = filtrados
    .map(([idKey, h]) => {
      const estado = h.estado || 'Pendiente';
      const esValidado = estado === 'Validado';
      const esDescartado = estado === 'Descartado';
      const esVisto = estado === 'Visto';

      let colorEstado = '#F5A623';
      let etiquetaEstado = estado.toUpperCase();
      if (esValidado) colorEstado = '#00e676';
      else if (esDescartado) colorEstado = '#ef4444';
      else if (esVisto) {
        colorEstado = '#38bdf8';
        etiquetaEstado = 'VISTO';
      }

      const fechaFmt = h.timestamp ? new Date(h.timestamp).toLocaleString('es-CL') : 'Reciente';
      const componenteText = h.componente || 'Condición Global';
      const severidadText = h.severidadValidada || h.severidadPreliminar || h.severidad || 'Zona C';
      const colorSev = obtenerColorCriticidad(severidadText);
      const avisoSapText = h.avisoSap ? ` | Aviso SAP: ${h.avisoSap}` : '';

      return `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 180px minmax(220px, 1fr) 220px 140px; align-items: center; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <span style="background: rgba(0,0,0,0.5); color: ${colorEstado}; border: 1px solid ${colorEstado}; padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 0.65rem; text-align: center; width: 85px; flex-shrink: 0;">
              ${etiquetaEstado}
            </span>
            <div style="min-width: 0;">
              <div style="font-weight: 800; color: #ffffff; font-family: monospace; font-size: 0.88rem;">${escaparHTML(h.tag)}</div>
              <div style="font-size: 0.68rem; color: #38bdf8;">Área: ${escaparHTML(h.area)}</div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <div style="font-size: 0.78rem; font-weight: 700; color: #f8fafc;">
              📍 Punto: <span style="color: #38bdf8;">${escaparHTML(componenteText)}</span>
            </div>
            <div style="font-size: 0.68rem; color: #CBD5E1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escaparHTML(h.descripcion || '').substring(0, 50)}...
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <div style="font-size: 0.74rem; color: #94A3B8;">
              Criticidad: <strong style="color: ${colorSev};">${escaparHTML(severidadText)}</strong>
            </div>
            <div style="font-size: 0.68rem; color: #64748B;">
              Fecha: ${escaparHTML(fechaFmt)}${escaparHTML(avisoSapText)}
            </div>
          </div>

          <div style="text-align: right;">
            <button type="button" onclick="window.abrirModalValidacionAnalista('${escaparHTML(idKey)}')" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; cursor: pointer;">
              ${estado === 'Pendiente' || estado === 'nuevo' ? 'Ver Reporte' : (esVisto ? 'Validar Caso' : 'Ver / Editar')}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
};

export const filtrarTriageEstado = (estado: FiltroEstadoTriage): void => {
  filtroEstadoTriage = estado;
  const btnPend = document.getElementById('btn-triage-pendientes');
  const btnVal = document.getElementById('btn-triage-validados');
  const btnTodos = document.getElementById('btn-triage-todos');

  if (btnPend) {
    btnPend.style.background = estado === 'PENDIENTES' ? '#F5A623' : 'transparent';
    btnPend.style.color = estado === 'PENDIENTES' ? '#0E1B1F' : '#94A3B8';
  }
  if (btnVal) {
    btnVal.style.background = estado === 'VALIDADOS' ? '#00e676' : 'transparent';
    btnVal.style.color = estado === 'VALIDADOS' ? '#0E1B1F' : '#94A3B8';
  }
  if (btnTodos) {
    btnTodos.style.background = estado === 'TODOS' ? '#38bdf8' : 'transparent';
    btnTodos.style.color = estado === 'TODOS' ? '#0E1B1F' : '#94A3B8';
  }
  renderizarListaTriage();
};

export const filtrarTriageTexto = (txt: string): void => {
  filtroBusquedaTriage = txt;
  renderizarListaTriage();
};

export const abrirModalValidacionAnalista = async (idKey: string): Promise<void> => {
  const hallazgo = listaHallazgosActuales[idKey];
  if (!hallazgo) return;

  const idModal = 'modal-val-' + Date.now();
  const overlay = document.createElement('div');
  overlay.id = idModal;
  overlay.className = 'modal-overlay';
  overlay.style.cssText =
    'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;';

  let multimediaHTML = `<div style="font-size: 0.78rem; color: #94A3B8; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">📷 Sin evidencias multimedia adjuntas.</div>`;

  const listaEvidencias = hallazgo.evidencias || (hallazgo.fotoBase64 ? [{ tipo: 'IMAGEN_BASE64', data: hallazgo.fotoBase64 }] : []);

  if (listaEvidencias.length > 0) {
    multimediaHTML = `
      <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;" role="region" aria-label="Carrusel de evidencias">
        ${listaEvidencias
          .map((ev, i) => {
            return `<img src="${ev.data}" style="height: 110px; width: 110px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; flex-shrink: 0;" onclick="window.abrirVisorMultimediaInterno('${ev.data}', 'imagen')" title="Clic para visor ampliado" alt="Evidencia ${i + 1}">`;
          })
          .join('')}
      </div>
    `;
  }

  const sevActual = hallazgo.severidadValidada || hallazgo.severidadPreliminar || hallazgo.severidad || 'Zona C (Naranja)';

  overlay.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; width: 100%; max-width: 540px; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
      <header style="background: rgba(245, 166, 35, 0.18); border-bottom: 1px solid rgba(245, 166, 35, 0.35); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-outlined" style="color: #F5A623; font-size: 1.4rem;" aria-hidden="true">fact_check</span>
          <h3 style="margin: 0; color: white; font-size: 1.05rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif;">Validación CBM: ${escaparHTML(hallazgo.tag)}</h3>
        </div>
        <button type="button" id="btn-cerrar-x" style="background: transparent; border: none; color: #94A3B8; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </header>
      
      <div style="padding: 18px 20px; color: #E2E8F0; font-size: 0.85rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700; text-transform: uppercase;">Evidencias de Terreno:</label>
          ${multimediaHTML}
        </div>

        <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
          <p style="margin: 0 0 4px 0; color: #38bdf8; font-weight: bold; font-size: 0.78rem;">Descripción del Inspector:</p>
          <p style="margin: 0; color: #E2E8F0; white-space: pre-line; line-height: 1.4;">${escaparHTML(hallazgo.descripcion || hallazgo.detalle)}</p>
        </div>

        <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div class="campo-formulario">
            <label style="font-size: 0.72rem; color: #94A3B8;">Aviso SAP Asignado:</label>
            <input type="text" id="input-aviso-sap-val" value="${escaparHTML(hallazgo.avisoSap || '')}" placeholder="Ej: AV-928471" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; font-size: 0.82rem; outline: none; font-family: monospace;">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 0.75rem; color: #94A3B8; display: block; margin-bottom: 4px;">Decisión Analista</label>
            <select id="select-estado-val" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; outline: none; font-weight: bold;">
              <option value="Validado" ${hallazgo.estado === 'Validado' ? 'selected' : ''}>✅ Validar (Impacta Timeline)</option>
              <option value="Descartado" ${hallazgo.estado === 'Descartado' ? 'selected' : ''}>❌ Descartar</option>
              <option value="Visto" ${hallazgo.estado === 'Visto' ? 'selected' : ''}>👁️ En Revisión</option>
            </select>
          </div>

          <div>
            <label style="font-size: 0.75rem; color: #94A3B8; display: block; margin-bottom: 4px;">Severidad Validada</label>
            <select id="select-severidad-val" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; outline: none; font-weight: bold;">
              <option value="Zona A (Verde)" ${sevActual.includes('Verde') || sevActual.includes('Zona A') ? 'selected' : ''}>🟢 Zona A (Verde)</option>
              <option value="Zona B (Amarillo)" ${sevActual.includes('Amarillo') || sevActual.includes('Zona B') ? 'selected' : ''}>🟡 Zona B (Amarillo)</option>
              <option value="Zona C (Naranja)" ${sevActual.includes('Naranja') || sevActual.includes('Zona C') ? 'selected' : ''}>🟠 Zona C (Naranja)</option>
              <option value="Zona D (Rojo)" ${sevActual.includes('Rojo') || sevActual.includes('Zona D') ? 'selected' : ''}>🔴 Zona D (Rojo)</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size: 0.75rem; color: #94A3B8; display: block; margin-bottom: 4px;">Diagnóstico CBM Experto</label>
          <textarea id="textarea-diag-val" placeholder="Ingrese el diagnóstico técnico..." rows="3" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 9px; border-radius: 6px; box-sizing: border-box; resize: none; outline: none;">${escaparHTML(hallazgo.diagnostico || '')}</textarea>
        </div>
      </div>

      <footer style="padding: 12px 20px; background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
        <button type="button" id="btn-cerrar-val" style="background: transparent; color: #94A3B8; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Cerrar</button>
        <button type="button" id="btn-guardar-val" style="background: #F5A623; color: #0E1B1F; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 800;">Guardar y Registrar</button>
      </footer>
    </div>
  `;

  document.body.appendChild(overlay);

  const cerrarModal = () => overlay.remove();
  overlay.querySelector('#btn-cerrar-val')!.addEventListener('click', cerrarModal);
  overlay.querySelector('#btn-cerrar-x')!.addEventListener('click', cerrarModal);

  overlay.querySelector('#btn-guardar-val')!.addEventListener('click', async () => {
    const btnGuardar = overlay.querySelector('#btn-guardar-val') as HTMLButtonElement;
    const nuevoEstado = (overlay.querySelector('#select-estado-val') as HTMLSelectElement).value as EstadoTriage;
    const nuevaSeveridad = (overlay.querySelector('#select-severidad-val') as HTMLSelectElement).value;
    const avisoSapVal = (overlay.querySelector('#input-aviso-sap-val') as HTMLInputElement).value.trim();
    const diagnosticoTxt = (overlay.querySelector('#textarea-diag-val') as HTMLTextAreaElement).value.trim();

    btnGuardar.disabled = true;
    btnGuardar.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Guardando...`;

    try {
      const sesion = AuthService.getSesion();
      const payloadValidacion = {
        idAlerta: idKey,
        tag: hallazgo.tag,
        estado: nuevoEstado,
        severidadValidada: nuevaSeveridad,
        severidad: normalizarSeveridadParaCatastro(nuevaSeveridad),
        avisoSap: avisoSapVal,
        diagnostico: diagnosticoTxt,
        analistaValidador: sesion?.email || 'Analista CBM',
        fechaValidacion: new Date().toISOString()
      };

      // Despacho con trazabilidad hacia el backend y cola outbox
      await SyncManager.despacharOEncolar(`alerta_validacion:${idKey}`, 'UPDATE', payloadValidacion);

      // Actualización reactiva local
      if (listaHallazgosActuales[idKey]) {
        listaHallazgosActuales[idKey].estado = nuevoEstado;
        listaHallazgosActuales[idKey].severidadValidada = nuevaSeveridad;
        listaHallazgosActuales[idKey].avisoSap = avisoSapVal;
        listaHallazgosActuales[idKey].diagnostico = diagnosticoTxt;
      }

      actualizarBadgeTriageGlobal();
      renderizarListaTriage();
      cerrarModal();
    } catch (err) {
      console.error('[Triage] Error validando alerta:', err);
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = 'Guardar y Registrar';
    }
  });
};

// ============================================================================
// EXPOSICIÓN GLOBAL
// ============================================================================
if (typeof window !== 'undefined') {
  const w = window as any;
  w.renderizarModuloTriage = renderizarModuloTriage;
  w.filtrarTriageEstado = filtrarTriageEstado;
  w.filtrarTriageTexto = filtrarTriageTexto;
  w.abrirModalValidacionAnalista = abrirModalValidacionAnalista;
  w.abrirVisorMultimediaInterno = abrirVisorMultimediaInterno;
  w.cerrarVisorMultimedia = cerrarVisorMultimedia;
}