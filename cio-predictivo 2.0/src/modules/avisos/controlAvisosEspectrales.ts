import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';
import { UI } from '../layout/notificaciones';
import { obtenerSemanaISO, formatearFechaNomenclatura } from '../../core/pdf/pdfPlantilla';

declare const window: any;

export interface RegistroAvisoEspectral {
  id: string;
  tag: string;
  componente: 'Motor Eléctrico' | 'Reductor de Velocidad' | 'Poleas / Transmisión' | string;
  punto: string;
  severidad: 'ROJO' | 'NARANJA' | 'AMARILLO' | 'VERDE';
  avisoSap: string;
  prioridadSap: 'Alta' | 'Media' | 'Baja';
  estadoInforme: 'Emitido' | 'Pendiente' | 'Cerrado';
  semanaSap: string;
  fechaEmision: string;
  diagnosticoResumen: string;
}

let memoriaAvisos: RegistroAvisoEspectral[] = [];
let filtroSemanaActiva: string = `S${String(obtenerSemanaISO(new Date())).padStart(2, '0')}`;
let filtroEstadoActivo: string = 'TODOS';

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const cargarAvisosEspectrales = async (): Promise<void> => {
  try {
    const res = await fetch(`/api/cbm/registros?tipo=analisis_experto&limit=100`, {
      headers: AuthService.getHeadersTenant()
    });

    if (res.ok) {
      const data = await res.json();
      const registros = data.registros || [];
      const lista: RegistroAvisoEspectral[] = [];

      registros.forEach((r: any) => {
        const payload = r.payload || {};
        const semana = payload.semanaSap || `S${String(obtenerSemanaISO(new Date(payload.timestamp || Date.now()))).padStart(2, '0')}`;

        ['motor', 'reductor', 'poleas'].forEach((subKey) => {
          const sub = payload[subKey];
          if (sub && (sub.generaAviso || sub.avisoSap || sub.severidad === 'ROJO')) {
            let compNombre = 'Motor Eléctrico';
            if (subKey === 'reductor') compNombre = 'Reductor de Velocidad';
            if (subKey === 'poleas') compNombre = 'Poleas / Transmisión';

            lista.push({
              id: `${payload.tag}_${subKey}_${r.id}`,
              tag: payload.tag || 'S/T',
              componente: compNombre,
              punto: sub.puntos?.[0]?.punto || (subKey === 'motor' ? 'M1' : (subKey === 'reductor' ? 'G1' : 'PL1')),
              severidad: sub.severidad || 'ROJO',
              avisoSap: sub.avisoSap || 'Pendiente',
              prioridadSap: sub.prioridadSap || (sub.severidad === 'ROJO' ? 'Alta' : 'Media'),
              estadoInforme: sub.avisoSap ? 'Emitido' : 'Pendiente',
              semanaSap: semana,
              fechaEmision: payload.fecha || formatearFechaNomenclatura(new Date()),
              diagnosticoResumen: sub.diagnostico ? sub.diagnostico.substring(0, 110) + '...' : 'Sin detalle'
            });
          }
        });
      });

      memoriaAvisos = lista;
    }
  } catch (err) {
    console.warn('[AvisosEspectrales] Error recuperando avisos remotos, usando mock local:', err);
  }

  // Registros de muestra si aún no hay registros persistidos
  if (memoriaAvisos.length === 0) {
    const sem = `S${String(obtenerSemanaISO(new Date())).padStart(2, '0')}`;
    memoriaAvisos = [
      {
        id: 'AVS_01',
        tag: 'CV-01',
        componente: 'Motor Eléctrico',
        punto: 'M2',
        severidad: 'ROJO',
        avisoSap: '10058921',
        prioridadSap: 'Alta',
        estadoInforme: 'Emitido',
        semanaSap: sem,
        fechaEmision: formatearFechaNomenclatura(new Date()),
        diagnosticoResumen: 'Modulación en frecuencia de giro 1X/2X y energía en pista exterior NDE. Relubricación e inspección.'
      },
      {
        id: 'AVS_02',
        tag: 'CH-01',
        componente: 'Reductor de Velocidad',
        punto: 'G2',
        severidad: 'ROJO',
        avisoSap: '10058934',
        prioridadSap: 'Alta',
        estadoInforme: 'Emitido',
        semanaSap: sem,
        fechaEmision: formatearFechaNomenclatura(new Date()),
        diagnosticoResumen: 'Impactos dinámicos en etapa intermedia (GMF). Requiere inspección de backlash en parada programada.'
      },
      {
        id: 'AVS_03',
        tag: 'CV-02',
        componente: 'Motor Eléctrico',
        punto: 'M1',
        severidad: 'NARANJA',
        avisoSap: '',
        prioridadSap: 'Media',
        estadoInforme: 'Pendiente',
        semanaSap: sem,
        fechaEmision: formatearFechaNomenclatura(new Date()),
        diagnosticoResumen: 'Tendencia ascendente de velocidad RMS hacia Zona C. Seguimiento dinámico semanal.'
      }
    ];
  }
};

export const renderizarControlAvisosEspectrales = async (contenedorId = 'espacio-trabajo-dinamico'): Promise<void> => {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  await cargarAvisosEspectrales();

  const semanasDisponibles = Array.from(new Set(memoriaAvisos.map((a) => a.semanaSap)));
  if (!semanasDisponibles.includes(filtroSemanaActiva)) {
    semanasDisponibles.unshift(filtroSemanaActiva);
  }

  const avisosFiltrados = memoriaAvisos.filter((a) => {
    const coincideSemana = filtroSemanaActiva === 'TODAS' || a.semanaSap === filtroSemanaActiva;
    const coincideEstado = filtroEstadoActivo === 'TODOS' || a.estadoInforme === filtroEstadoActivo;
    return coincideSemana && coincideEstado;
  });

  const totalEmitidos = memoriaAvisos.filter((a) => a.estadoInforme === 'Emitido').length;
  const totalPendientes = memoriaAvisos.filter((a) => a.estadoInforme === 'Pendiente').length;

  contenedor.innerHTML = `
    <section class="panel-industrial" style="display: flex; flex-direction: column; height: 100%; padding: 1.25rem; gap: 1rem; box-sizing: border-box; overflow-y: auto;">
      
      <!-- CABECERA DEL PANEL -->
      <header style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; background: rgba(14, 27, 31, 0.95); padding: 1.25rem 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: rgba(2, 132, 199, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 10px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #38bdf8;">
            <span class="material-symbols-outlined" style="font-size: 1.8rem;" aria-hidden="true">assignment_turned_in</span>
          </div>
          <div>
            <h2 style="margin: 0; color: #ffffff; font-size: 1.25rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
              Control de Avisos SAP e Informes Espectrales CBM
            </h2>
            <p style="margin: 2px 0 0 0; color: #94A3B8; font-size: 0.78rem;">
              Bitácora independiente de requerimientos de mantenimiento predictivo, números de aviso SAP PM y trazabilidad de fallas.
            </p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button type="button" id="btn-volver-dashboard" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 14px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.1rem;">map</span>
            <span>Volver al Geovisor</span>
          </button>
        </div>
      </header>

      <!-- KPI CARDS -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.72rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">Avisos Registrados</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #ffffff; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">
            ${memoriaAvisos.length}
          </div>
        </div>

        <div style="background: #16282D; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.72rem; color: #38bdf8; text-transform: uppercase; font-weight: 700;">Informes Emitidos SAP</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #38bdf8; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">
            ${totalEmitidos}
          </div>
        </div>

        <div style="background: #16282D; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px 16px;">
          <span style="font-size: 0.72rem; color: #f87171; text-transform: uppercase; font-weight: 700;">Pendientes de Aviso SAP</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #f87171; margin-top: 4px; font-family: 'Space Grotesk', sans-serif;">
            ${totalPendientes}
          </div>
        </div>
      </div>

      <!-- BARRA DE FILTROS -->
      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <label style="font-size: 0.76rem; color: #94A3B8; font-weight: 700;">Semana Operacional:</label>
          <select id="select-filtro-semana" onchange="window.cambiarFiltroAvisosSemana(this.value)" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 5px 10px; border-radius: 6px; font-size: 0.78rem; outline: none;">
            <option value="TODAS" ${filtroSemanaActiva === 'TODAS' ? 'selected' : ''}>Todas las Semanas</option>
            ${semanasDisponibles.map((s) => `<option value="${s}" ${filtroSemanaActiva === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>

          <label style="font-size: 0.76rem; color: #94A3B8; font-weight: 700; margin-left: 10px;">Estado:</label>
          <select id="select-filtro-estado" onchange="window.cambiarFiltroAvisosEstado(this.value)" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 5px 10px; border-radius: 6px; font-size: 0.78rem; outline: none;">
            <option value="TODOS" ${filtroEstadoActivo === 'TODOS' ? 'selected' : ''}>Todos</option>
            <option value="Emitido" ${filtroEstadoActivo === 'Emitido' ? 'selected' : ''}>Emitidos</option>
            <option value="Pendiente" ${filtroEstadoActivo === 'Pendiente' ? 'selected' : ''}>Pendientes</option>
          </select>
        </div>

        <button type="button" onclick="window.registrarNuevoAvisoManualModal()" style="background: #0284c7; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 1.1rem;">add</span>
          <span>Vincular Aviso SAP Manual</span>
        </button>
      </div>

      <!-- TABLA DE CONTROL DE AVISOS -->
      <div style="background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden; flex: 1;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem;">
            <thead>
              <tr style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); color: #94A3B8; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.5px;">
                <th style="padding: 12px 14px;">Semana</th>
                <th style="padding: 12px 14px;">TAG / Activo</th>
                <th style="padding: 12px 14px;">Componente</th>
                <th style="padding: 12px 14px;">Punto</th>
                <th style="padding: 12px 14px;">Severidad</th>
                <th style="padding: 12px 14px;">N° Aviso SAP</th>
                <th style="padding: 12px 14px;">Prioridad</th>
                <th style="padding: 12px 14px;">Estado</th>
                <th style="padding: 12px 14px; text-align: center;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${avisosFiltrados.length === 0 ? `
                <tr>
                  <td colspan="9" style="padding: 2.5rem; text-align: center; color: #94A3B8;">
                    No se encontraron avisos SAP registrados bajo los filtros seleccionados.
                  </td>
                </tr>
              ` : avisosFiltrados.map((av) => {
                let colorSev = '#00e676';
                if (av.severidad === 'ROJO') colorSev = '#ef4444';
                else if (av.severidad === 'NARANJA') colorSev = '#f97316';
                else if (av.severidad === 'AMARILLO') colorSev = '#eab308';

                return `
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s ease;">
                    <td style="padding: 12px 14px; font-family: monospace; font-weight: 700; color: #38bdf8;">${escaparHTML(av.semanaSap)}</td>
                    <td style="padding: 12px 14px; font-family: monospace; font-weight: 800; color: #ffffff;">${escaparHTML(av.tag)}</td>
                    <td style="padding: 12px 14px; color: #E2E8F0;">${escaparHTML(av.componente)}</td>
                    <td style="padding: 12px 14px; font-family: monospace; color: #CBD5E1;">[${escaparHTML(av.punto)}]</td>
                    <td style="padding: 12px 14px;">
                      <span style="display: inline-flex; align-items: center; gap: 5px; color: ${colorSev}; font-weight: 700;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${colorSev};"></span>
                        ${escaparHTML(av.severidad)}
                      </span>
                    </td>
                    <td style="padding: 12px 14px; font-family: monospace; font-weight: 800; color: ${av.avisoSap ? '#facc15' : '#94A3B8'};">
                      ${escaparHTML(av.avisoSap || 'Pendiente')}
                    </td>
                    <td style="padding: 12px 14px;">
                      <span style="background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; color: ${av.prioridadSap === 'Alta' ? '#f87171' : '#facc15'};">
                        ${escaparHTML(av.prioridadSap)}
                      </span>
                    </td>
                    <td style="padding: 12px 14px;">
                      <span style="background: ${av.estadoInforme === 'Emitido' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${av.estadoInforme === 'Emitido' ? '#38bdf8' : '#f87171'}; border: 1px solid ${av.estadoInforme === 'Emitido' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                        ${escaparHTML(av.estadoInforme)}
                      </span>
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">
                      <button type="button" onclick="window.editarAvisoEspectralModal('${escaparHTML(av.id)}')" title="Editar Aviso SAP" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.72rem; font-weight: 700;">
                        Gestionar
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
};

// ============================================================================
// MODAL DE GESTIÓN RÁPIDA DE AVISO SAP
// ============================================================================
export const editarAvisoEspectralModal = (avisoId: string): void => {
  const registro = memoriaAvisos.find((a) => a.id === avisoId);
  if (!registro) return;

  let modal = document.getElementById('modal-gestionar-aviso-sap');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'modal-gestionar-aviso-sap';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 95%; max-width: 480px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
      <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
          Gestión de Aviso SAP — ${registro.tag} [${registro.componente}]
        </h3>
        <button type="button" onclick="document.getElementById('modal-gestionar-aviso-sap').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.4rem; cursor: pointer;">&times;</button>
      </header>

      <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 0.82rem; color: #E2E8F0;">
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8; display: block; margin-bottom: 4px;">Número de Aviso SAP PM *</label>
          <input type="text" id="input-aviso-sap-val" value="${registro.avisoSap}" placeholder="Ej: 10058921" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; font-family: monospace; font-size: 0.9rem; outline: none;">
        </div>

        <div>
          <label style="font-size: 0.74rem; color: #94A3B8; display: block; margin-bottom: 4px;">Prioridad de Intervención</label>
          <select id="select-aviso-prioridad-val" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; outline: none;">
            <option value="Alta" ${registro.prioridadSap === 'Alta' ? 'selected' : ''}>Alta (Parada Inmediata / Programada Próxima)</option>
            <option value="Media" ${registro.prioridadSap === 'Media' ? 'selected' : ''}>Media (Ventana Operacional Quincenal)</option>
            <option value="Baja" ${registro.prioridadSap === 'Baja' ? 'selected' : ''}>Baja (Inspección Rutinaria)</option>
          </select>
        </div>

        <div>
          <label style="font-size: 0.74rem; color: #94A3B8; display: block; margin-bottom: 4px;">Estado del Informe Espectral</label>
          <select id="select-aviso-estado-val" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; outline: none;">
            <option value="Emitido" ${registro.estadoInforme === 'Emitido' ? 'selected' : ''}>Emitido y Notificado a Planificación</option>
            <option value="Pendiente" ${registro.estadoInforme === 'Pendiente' ? 'selected' : ''}>Pendiente de Emisión SAP</option>
            <option value="Cerrado" ${registro.estadoInforme === 'Cerrado' ? 'selected' : ''}>Cerrado / Ejecutado en Terreno</option>
          </select>
        </div>
      </div>

      <footer style="padding: 12px 18px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" onclick="document.getElementById('modal-gestionar-aviso-sap').remove()" class="btn-secundario" style="background: transparent; color: #94A3B8; border: 1px solid rgba(255,255,255,0.2); padding: 7px 14px; border-radius: 6px; cursor: pointer;">Cancelar</button>
        <button type="button" onclick="window.guardarCambiosAvisoEspectral('${escaparHTML(registro.id)}')" style="background: #0284c7; color: white; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 800; cursor: pointer;">Guardar Aviso</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
};

// ============================================================================
// EXPOSICIÓN GLOBAL
// ============================================================================
if (typeof window !== 'undefined') {
  window.renderizarControlAvisosEspectrales = renderizarControlAvisosEspectrales;
  window.editarAvisoEspectralModal = editarAvisoEspectralModal;

  window.cambiarFiltroAvisosSemana = (semana: string) => {
    filtroSemanaActiva = semana;
    renderizarControlAvisosEspectrales();
  };

  window.cambiarFiltroAvisosEstado = (estado: string) => {
    filtroEstadoActivo = estado;
    renderizarControlAvisosEspectrales();
  };

  window.guardarCambiosAvisoEspectral = async (id: string) => {
    const inputNum = document.getElementById('input-aviso-sap-val') as HTMLInputElement | null;
    const selectPrio = document.getElementById('select-aviso-prioridad-val') as HTMLSelectElement | null;
    const selectEst = document.getElementById('select-aviso-estado-val') as HTMLSelectElement | null;

    const registro = memoriaAvisos.find((a) => a.id === id);
    if (!registro) return;

    if (inputNum) registro.avisoSap = inputNum.value.trim();
    if (selectPrio) registro.prioridadSap = selectPrio.value as any;
    if (selectEst) registro.estadoInforme = selectEst.value as any;

    await SyncManager.despacharOEncolar(`aviso_sap:${registro.tag}`, 'UPDATE', {
      tag: registro.tag,
      avisoSap: registro.avisoSap,
      prioridadSap: registro.prioridadSap,
      estadoInforme: registro.estadoInforme,
      timestamp: Date.now()
    });

    UI.mostrarToast(`Aviso SAP para ${registro.tag} actualizado a: ${registro.avisoSap || 'Pendiente'}`, 'exito');
    document.getElementById('modal-gestionar-aviso-sap')?.remove();
    renderizarControlAvisosEspectrales();
  };

  window.registrarNuevoAvisoManualModal = () => {
    const tag = prompt('Ingrese el TAG del activo (Ej: CV-01):');
    if (!tag) return;
    const avisoSap = prompt('Ingrese el número de Aviso SAP PM:');
    if (!avisoSap) return;

    memoriaAvisos.unshift({
      id: `AVS_MANUAL_${Date.now()}`,
      tag: tag.toUpperCase().trim(),
      componente: 'Inspección General CBM',
      punto: 'Gral',
      severidad: 'ROJO',
      avisoSap: avisoSap.trim(),
      prioridadSap: 'Alta',
      estadoInforme: 'Emitido',
      semanaSap: `S${String(obtenerSemanaISO(new Date())).padStart(2, '0')}`,
      fechaEmision: formatearFechaNomenclatura(new Date()),
      diagnosticoResumen: 'Aviso SAP ingresado manualmente por especialista CBM.'
    });

    UI.mostrarToast(`Aviso SAP ${avisoSap} vinculado a ${tag}`, 'exito');
    renderizarControlAvisosEspectrales();
  };
}