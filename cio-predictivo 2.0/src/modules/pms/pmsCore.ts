import { AuthService } from '../../core/auth/authService';
import { SyncManager } from '../../core/offline/syncManager';

declare const XLSX: any;

export interface OrdenTrabajoPMS {
  id: string;
  numero: string;
  fecha: string;
  area: string;
  equipo: string;
  tag: string;
  actividad: string;
  cruce: string;
  estadoReal: 'Ejecutado' | 'Pendiente' | 'No Ejecutado';
  notifSap: boolean;
  ctec: boolean;
  adjuntos: number;
  observacion?: string;
}

export interface ActividadEmergente {
  id: string;
  tag: string;
  descripcion: string;
  om: string;
  fecha: string;
  turno: string;
  notifSap: boolean;
  ctec: boolean;
}

export interface AvisoEspectralCBM {
  id: string;
  tag: string;
  area: string;
  componente: string;
  punto: string;
  rms: number | string;
  avisoSap?: string;
  otSap?: string;
  estado: 'Pendiente' | 'Emitido' | 'CERRADO_EJECUTADO' | 'CERRADO_OBSOLETO' | 'Obsoleto';
  evaluacionCondicion?: string;
  detalleTarea?: string;
  motivoObsolescencia?: string;
  avisoSustituto?: string;
  fechaDeteccion?: string;
  fechaCorta?: string;
  timestamp?: number;
}

export interface DatosSemanaPMS {
  semana: string;
  ordenes: Record<string, OrdenTrabajoPMS>;
  actividades_emergentes: Record<string, ActividadEmergente>;
}

// Variables de estado del módulo
let semanaSeleccionada: string = '2026-W43';
let listaSemanasDisponibles: string[] = ['2026-W43', '2026-W42'];
let datosSemanaActual: DatosSemanaPMS = {
  semana: '2026-W43',
  ordenes: {},
  actividades_emergentes: {}
};
let datosEspectralesSemana: Record<string, AvisoEspectralCBM> = {};

let filtroTexto = '';
let filtroEstado = 'TODOS';
let filtroEspectralesEstado: 'PENDIENTES' | 'EMITIDOS' | 'OBSOLETOS' | 'TODOS' = 'PENDIENTES';
let filtroEspectralesFecha = 'TODAS';
const debounceGuardado: Record<string, number> = {};

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const formatearFechaDDMMAAAA = (fechaInput = ''): string => {
  if (!fechaInput) return '-';

  if (!isNaN(Number(fechaInput)) && Number(fechaInput) > 10000) {
    const diasExcel = parseInt(String(fechaInput), 10);
    const fechaEpoch = new Date(1899, 11, 30);
    fechaEpoch.setDate(fechaEpoch.getDate() + diasExcel);
    if (!isNaN(fechaEpoch.getTime())) {
      const dd = String(fechaEpoch.getDate()).padStart(2, '0');
      const mm = String(fechaEpoch.getMonth() + 1).padStart(2, '0');
      const yyyy = fechaEpoch.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
  }

  const str = String(fechaInput).trim();
  const matchYMD = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchYMD) {
    return `${matchYMD[3].padStart(2, '0')}-${matchYMD[2].padStart(2, '0')}-${matchYMD[1]}`;
  }
  return str;
};

export const obtenerObjetoFecha = (fechaInput: any): Date => {
  if (!fechaInput) return new Date(2099, 0, 1);
  if (!isNaN(Number(fechaInput)) && Number(fechaInput) > 10000) {
    const fechaEpoch = new Date(1899, 11, 30);
    fechaEpoch.setDate(fechaEpoch.getDate() + parseInt(String(fechaInput), 10));
    return fechaEpoch;
  }
  const str = String(fechaInput).trim();
  const matchYMD = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchYMD) {
    return new Date(parseInt(matchYMD[1], 10), parseInt(matchYMD[2], 10) - 1, parseInt(matchYMD[3], 10));
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(2099, 0, 1) : parsed;
};

export const extraerAreaLimpia = (ubicacionTecnica = ''): string => {
  const str = String(ubicacionTecnica).trim();
  const matchArea = str.match(/(AR\d+)/i);
  if (matchArea) return matchArea[1].toUpperCase();
  return str.split('-')[3] || str.substring(0, 10) || 'General';
};

const mostrarModalIndustrial = ({
  titulo,
  icono,
  colorBase,
  htmlCuerpo,
  textoConfirmar = 'Aceptar',
  textoCancelar = 'Cancelar',
  mostrarCancelar = true
}: {
  titulo: string;
  icono: string;
  colorBase: string;
  htmlCuerpo: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  mostrarCancelar?: boolean;
}): Promise<any> => {
  return new Promise((resolve) => {
    const idModal = 'modal-dinamico-' + Date.now();
    const overlay = document.createElement('div');
    overlay.id = idModal;
    overlay.className = 'modal-overlay';
    overlay.style.cssText =
      'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; animation: fadeIn 0.2s ease;';

    overlay.innerHTML = `
      <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 24px 40px rgba(0,0,0,0.5); border-radius: 12px; width: 100%; max-width: 480px; overflow: hidden;">
        <header style="background: rgba(${colorBase}, 0.15); border-bottom: 1px solid rgba(${colorBase}, 0.3); padding: 16px 20px; display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-outlined" style="color: rgb(${colorBase}); font-size: 1.5rem;" aria-hidden="true">${icono}</span>
          <h3 style="margin: 0; color: white; font-size: 1.05rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif;">${titulo}</h3>
        </header>
        <div style="padding: 20px; color: #e2e8f0; font-size: 0.82rem; line-height: 1.5;">
          ${htmlCuerpo}
        </div>
        <footer style="padding: 14px 20px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: flex-end; gap: 10px;">
          ${mostrarCancelar ? `<button id="btn-cancel-${idModal}" style="background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">${textoCancelar}</button>` : ''}
          <button id="btn-ok-${idModal}" style="background: rgb(${colorBase}); color: #0E1B1F; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 800;">${textoConfirmar}</button>
        </footer>
      </div>
    `;

    document.body.appendChild(overlay);

    const cerrar = (valor: any) => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
      resolve(valor);
    };

    const btnOk = document.getElementById(`btn-ok-${idModal}`);
    if (btnOk) {
      btnOk.onclick = () => {
        const formInputs = overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
        if (formInputs.length > 0) {
          const data: Record<string, any> = {};
          formInputs.forEach((inp) => {
            if (inp instanceof HTMLInputElement && inp.type === 'checkbox') data[inp.name] = inp.checked;
            else data[inp.name] = inp.value;
          });
          cerrar(data);
        } else {
          cerrar(true);
        }
      };
    }

    const btnCancel = document.getElementById(`btn-cancel-${idModal}`);
    if (btnCancel) btnCancel.onclick = () => cerrar(false);
  });
};

// ============================================================================
// CARGA Y SINCRONIZACIÓN DE DATOS DESDE FASTAPI
// ============================================================================
export const cargarDatosSemanaActual = async (): Promise<void> => {
  try {
    const sesion = AuthService.getSesion();
    if (!sesion) return;

    const response = await fetch(`/api/cbm/registros?limit=200`, {
      headers: AuthService.getHeadersTenant()
    });

    if (response.ok) {
      const data = await response.json();
      const registros = data.registros || [];

      const mapaOrdenes: Record<string, OrdenTrabajoPMS> = {};
      const mapaEmergencias: Record<string, ActividadEmergente> = {};
      const mapaEspectrales: Record<string, AvisoEspectralCBM> = {};

      registros.forEach((r: any) => {
        const payload = r.payload || {};
        if (r.resource.startsWith('om_pms:')) {
          mapaOrdenes[r.id] = {
            id: r.id,
            numero: payload.numero || r.id,
            fecha: payload.fecha || new Date().toISOString(),
            area: payload.area || 'General',
            equipo: payload.equipo || 'Equipo',
            tag: payload.tag || 'TAG',
            actividad: payload.actividad || 'Inspección CBM',
            cruce: payload.cruce || 'Catastrado',
            estadoReal: payload.estadoReal || 'Pendiente',
            notifSap: Boolean(payload.notifSap),
            ctec: Boolean(payload.ctec),
            adjuntos: payload.adjuntos || 0,
            observacion: payload.observacion || ''
          };
        } else if (r.resource.startsWith('emergencia_pms:')) {
          mapaEmergencias[r.id] = {
            id: r.id,
            tag: payload.tag || 'TAG',
            descripcion: payload.descripcion || '',
            om: payload.om || 'S/N',
            fecha: payload.fecha || new Date().toISOString(),
            turno: payload.turno || 'CPF',
            notifSap: Boolean(payload.notifSap),
            ctec: Boolean(payload.ctec)
          };
        } else if (r.resource.startsWith('aviso_espectral:')) {
          mapaEspectrales[r.id] = {
            id: r.id,
            tag: payload.tag || 'TAG',
            area: payload.area || 'General',
            componente: payload.componente || 'Punto',
            punto: payload.punto || '',
            rms: payload.rms || 0,
            avisoSap: payload.avisoSap || '',
            otSap: payload.otSap,
            estado: payload.estado || 'Pendiente',
            evaluacionCondicion: payload.evaluacionCondicion,
            detalleTarea: payload.detalleTarea,
            motivoObsolescencia: payload.motivoObsolescencia,
            avisoSustituto: payload.avisoSustituto,
            fechaDeteccion: payload.fechaDeteccion || payload.fecha,
            fechaCorta: payload.fechaCorta,
            timestamp: payload.timestamp || r.creado_en * 1000
          };
        }
      });

      datosSemanaActual.ordenes = mapaOrdenes;
      datosSemanaActual.actividades_emergentes = mapaEmergencias;
      datosEspectralesSemana = mapaEspectrales;

      renderizarKPIsYTablas();
      renderizarTablaEspectrales();
    }
  } catch (err) {
    console.warn('[PMS] Error al cargar datos del backend:', err);
  }
};

// ============================================================================
// RENDERIZADO DEL MÓDULO PMS
// ============================================================================
export const renderizarModuloPMS = (idContenedor = 'espacio-trabajo-dinamico'): void => {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  contenedor.innerHTML = `
    <section class="seccion-pms-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.25s ease;">
      <header style="background: rgba(14, 27, 31, 0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif;">
            <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">calendar_month</span>
            Auditoría de Programa Semanal (PMS) & Control Espectral
          </h2>
          <p style="margin: 0; font-size: 0.78rem; color: #94A3B8;">
            Control de OMs SAP PM, gestión de emergencias y ciclo de vida de avisos con SLA.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 700;">SEMANA:</span>
            <select id="pms-selector-periodo" onchange="window.cambiarPeriodoPMS(this.value)" style="background: #0E1B1F; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); padding: 5px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; outline: none; cursor: pointer;">
              ${listaSemanasDisponibles.map((sem) => `<option value="${sem}" ${sem === semanaSeleccionada ? 'selected' : ''}>${sem}</option>`).join('')}
            </select>
          </div>

          <button type="button" onclick="document.getElementById('input-excel-pms').click()" style="background: #0284c7; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">upload_file</span>
            Subir EXPORT.XLSX
          </button>
          <input type="file" id="input-excel-pms" accept=".xlsx, .xls, .csv" style="display: none;" onchange="window.procesarArchivoExcelPMS(event)">
        </div>
      </header>

      <div id="pms-kpis-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;"></div>

      <!-- SECCIÓN: CONTROL DE AVISOS ESPECTRALES -->
      <section style="background: rgba(22, 40, 45, 0.88); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 1rem; color: #f87171; font-weight: 800; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif;">
              <span class="material-symbols-outlined" style="color: #ef4444;" aria-hidden="true">assignment_late</span>
              Control de Avisos SAP Espectrales (Ciclo de Vida y SLA)
            </h3>
            <p style="margin: 3px 0 0 0; font-size: 0.75rem; color: #94A3B8;">
              Control de días transcurridos. Cierre técnico por ejecución o marcado como obsoleto.
            </p>
          </div>

          <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.3); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <button type="button" id="btn-filtro-esp-pendientes" onclick="window.filtrarEspectralesPorEstado('PENDIENTES')" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              Pendientes (<span id="lbl-esp-pendientes-count">0</span>)
            </button>
            <button type="button" id="btn-filtro-esp-emitidos" onclick="window.filtrarEspectralesPorEstado('EMITIDOS')" style="background: transparent; color: #94A3B8; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
              Ejecutados (<span id="lbl-esp-emitidos-count">0</span>)
            </button>
            <button type="button" id="btn-filtro-esp-obsoletos" onclick="window.filtrarEspectralesPorEstado('OBSOLETOS')" style="background: transparent; color: #94A3B8; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
              Obsoletos (<span id="lbl-esp-obsoletos-count">0</span>)
            </button>
          </div>
        </div>

        <div id="pms-tabla-espectrales-container" style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;"></div>
      </section>

      <!-- SECCIÓN: ACTIVIDADES EMERGENTES -->
      <section style="background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 0.95rem; color: #F5A623; font-weight: 800; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif;">
            <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
            Actividades Emergentes / Imprevistos (<span id="pms-total-emergencias">0</span>)
          </h3>
          <button type="button" onclick="window.abrirModalNuevaEmergencia()" style="background: rgba(245, 166, 35, 0.15); color: #F5A623; border: 1px solid rgba(245, 166, 35, 0.4); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 0.95rem;" aria-hidden="true">add</span>
            Registrar Emergencia
          </button>
        </div>
        <div id="pms-tabla-emergencias-container" style="overflow-x: auto;"></div>
      </section>

      <!-- SECCIÓN: ÓRDENES PLANIFICADAS PMS -->
      <section style="background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="position: relative; flex: 1; max-width: 320px;">
            <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: #94A3B8; pointer-events: none;" aria-hidden="true">search</span>
            <input type="search" id="pms-busqueda-input" placeholder="Filtrar por OM, TAG, Área..." oninput="window.filtrarOrdenesTexto(this.value)" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px 8px 34px; border-radius: 6px; font-size: 0.82rem; outline: none; box-sizing: border-box;">
          </div>
        </div>

        <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem;">
            <thead>
              <tr style="background: rgba(0,0,0,0.4); color: #94A3B8; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <th style="padding: 10px; width: 35px; text-align: center;">#</th>
                <th style="padding: 10px; min-width: 90px;">FECHA</th>
                <th style="padding: 10px; min-width: 65px;">ÁREA</th>
                <th style="padding: 10px; min-width: 170px;">EQUIPO / TAG</th>
                <th style="padding: 10px; min-width: 95px;">OM SAP</th>
                <th style="padding: 10px; min-width: 180px;">ACTIVIDAD</th>
                <th style="padding: 10px; min-width: 120px;">ESTADO REAL</th>
                <th style="padding: 10px; min-width: 75px; text-align: center;">NOTIF.</th>
                <th style="padding: 10px; min-width: 75px; text-align: center;">CTEC</th>
                <th style="padding: 10px; min-width: 180px;">OBSERVACIÓN</th>
              </tr>
            </thead>
            <tbody id="pms-tabla-ordenes-body"></tbody>
          </table>
        </div>
      </section>
    </section>
  `;

  cargarDatosSemanaActual();
};

const renderizarKPIsYTablas = (): void => {
  const ordenesArray = Object.values(datosSemanaActual.ordenes || {});
  const totalProgramadas = ordenesArray.length;
  const emergentesArray = Object.values(datosSemanaActual.actividades_emergentes || {});
  const totalEmergentes = emergentesArray.length;

  let ejecutadasPlan = 0;
  let notifSAPCount = 0;
  let ctecCerradasCount = 0;

  ordenesArray.forEach((o) => {
    if (o.estadoReal === 'Ejecutado') ejecutadasPlan++;
    if (o.notifSap) notifSAPCount++;
    if (o.ctec) ctecCerradasCount++;
  });

  emergentesArray.forEach((em) => {
    if (em.notifSap) notifSAPCount++;
    if (em.ctec) ctecCerradasCount++;
  });

  const totalTrabajosGlobal = totalProgramadas + totalEmergentes;
  const totalEjecutadasGlobal = ejecutadasPlan + totalEmergentes;
  const pctCumplimientoPlan = totalProgramadas > 0 ? Math.round((ejecutadasPlan / totalProgramadas) * 100) : 0;
  const pctNotif = totalTrabajosGlobal > 0 ? Math.round((notifSAPCount / totalTrabajosGlobal) * 100) : 0;
  const pctCtec = totalTrabajosGlobal > 0 ? Math.round((ctecCerradasCount / totalTrabajosGlobal) * 100) : 0;

  const kpisContainer = document.getElementById('pms-kpis-container');
  if (kpisContainer) {
    kpisContainer.innerHTML = `
      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">Cumplimiento Plan</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: #00e676; margin: 4px 0;">${pctCumplimientoPlan}%</div>
        <span style="font-size: 0.72rem; color: #94A3B8;">${ejecutadasPlan} de ${totalProgramadas} OMs</span>
      </div>

      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">Esfuerzo Terreno</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: #38bdf8; margin: 4px 0;">${totalEjecutadasGlobal}</div>
        <span style="font-size: 0.72rem; color: #94A3B8;">Plan + Emergentes</span>
      </div>

      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(245, 166, 35, 0.3); border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">Emergencias</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: #F5A623; margin: 4px 0;">${totalEmergentes}</div>
        <span style="font-size: 0.72rem; color: #94A3B8;">Imprevistos faena</span>
      </div>

      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">Notificadas SAP</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: #c084fc; margin: 4px 0;">${pctNotif}%</div>
        <span style="font-size: 0.72rem; color: #94A3B8;">${notifSAPCount} de ${totalTrabajosGlobal}</span>
      </div>

      <div style="background: rgba(14, 27, 31, 0.85); border: 1px solid rgba(45, 212, 191, 0.3); border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700; text-transform: uppercase;">Cierre CTEC</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: #2dd4bf; margin: 4px 0;">${pctCtec}%</div>
        <span style="font-size: 0.72rem; color: #94A3B8;">${ctecCerradasCount} de ${totalTrabajosGlobal}</span>
      </div>
    `;
  }

  renderizarTablaOrdenes();
  renderizarTablaEmergencias();
};

const renderizarTablaOrdenes = (): void => {
  const tbody = document.getElementById('pms-tabla-ordenes-body');
  if (!tbody) return;

  const entries = Object.entries(datosSemanaActual.ordenes || {});

  entries.sort(([, a], [, b]) => {
    return obtenerObjetoFecha(a.fecha).getTime() - obtenerObjetoFecha(b.fecha).getTime();
  });

  const filtradas = entries.filter(([, ord]) => {
    if (!ord) return false;
    const txt = filtroTexto.toLowerCase();
    const coincideTexto =
      !txt ||
      String(ord.numero || '').toLowerCase().includes(txt) ||
      String(ord.tag || '').toLowerCase().includes(txt) ||
      String(ord.area || '').toLowerCase().includes(txt);

    let coincideEstado = true;
    if (filtroEstado !== 'TODOS') coincideEstado = ord.estadoReal === filtroEstado;

    return coincideTexto && coincideEstado;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding: 2rem; text-align: center; color: #94A3B8;">No se encontraron órdenes registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas
    .map(([idKey, ord], idx) => {
      const esNotif = ord.notifSap;
      const esCtec = ord.ctec;

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 8px 10px; text-align: center; color: #94A3B8;">${idx + 1}</td>
          <td style="padding: 8px 10px; font-family: monospace;">${escaparHTML(formatearFechaDDMMAAAA(ord.fecha))}</td>
          <td style="padding: 8px 10px; font-weight: 700; color: #38bdf8;">${escaparHTML(ord.area)}</td>
          <td style="padding: 8px 10px; font-weight: 700; color: #ffffff; font-family: monospace;">${escaparHTML(ord.tag)}</td>
          <td style="padding: 8px 10px; font-family: monospace; color: #CBD5E1;">${escaparHTML(ord.numero)}</td>
          <td style="padding: 8px 10px; font-size: 0.74rem; color: #E2E8F0;">${escaparHTML(ord.actividad)}</td>
          <td style="padding: 8px 10px;">
            <select onchange="window.actualizarCampoOrden('${escaparHTML(idKey)}', 'estadoReal', this.value)" style="background: #0E1B1F; color: ${ord.estadoReal === 'Ejecutado' ? '#00e676' : '#F5A623'}; border: 1px solid rgba(255,255,255,0.15); padding: 4px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; outline: none;">
              <option value="Ejecutado" ${ord.estadoReal === 'Ejecutado' ? 'selected' : ''}>✅ Ejecutado</option>
              <option value="Pendiente" ${ord.estadoReal === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
              <option value="No Ejecutado" ${ord.estadoReal === 'No Ejecutado' ? 'selected' : ''}>❌ No Ejecutado</option>
            </select>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <button type="button" onclick="window.actualizarCampoOrden('${escaparHTML(idKey)}', 'notifSap', ${!esNotif})" style="background: ${esNotif ? 'rgba(0, 230, 118, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${esNotif ? '#00e676' : '#f87171'}; border: 1px solid ${esNotif ? 'rgba(0, 230, 118, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              ${esNotif ? '✓ SÍ' : '✕ NO'}
            </button>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <button type="button" onclick="window.actualizarCampoOrden('${escaparHTML(idKey)}', 'ctec', ${!esCtec})" style="background: ${esCtec ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${esCtec ? '#2dd4bf' : '#94A3B8'}; border: 1px solid ${esCtec ? 'rgba(45, 212, 191, 0.4)' : 'rgba(255, 255, 255, 0.15)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              ${esCtec ? '✓ SÍ' : '✕ NO'}
            </button>
          </td>
          <td style="padding: 8px 10px;">
            <input type="text" value="${escaparHTML(ord.observacion || '')}" placeholder="Observación..." oninput="window.autoGuardarObservacion('${escaparHTML(idKey)}', this.value)" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.74rem; outline: none; box-sizing: border-box;">
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderizarTablaEmergencias = (): void => {
  const cont = document.getElementById('pms-tabla-emergencias-container');
  const badgeTotal = document.getElementById('pms-total-emergencias');
  if (!cont) return;

  const items = Object.entries(datosSemanaActual.actividades_emergentes || {});
  if (badgeTotal) badgeTotal.textContent = String(items.length);

  if (items.length === 0) {
    cont.innerHTML = `<div style="padding: 1rem; text-align: center; color: #94A3B8; font-size: 0.8rem;">No se registran actividades emergentes en este periodo.</div>`;
    return;
  }

  cont.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; text-align: left;">
      <thead>
        <tr style="color: #94A3B8; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <th style="padding: 8px 6px;">Fecha</th>
          <th style="padding: 8px 6px;">TAG</th>
          <th style="padding: 8px 6px;">Descripción</th>
          <th style="padding: 8px 6px;">OM / Aviso</th>
          <th style="padding: 8px 6px; text-align: center;">Notif.</th>
          <th style="padding: 8px 6px; text-align: center;">CTEC</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(([key, em]) => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
              <td style="padding: 8px 6px; font-family: monospace;">${escaparHTML(formatearFechaDDMMAAAA(em.fecha))}</td>
              <td style="padding: 8px 6px; font-weight: 700; color: #f87171; font-family: monospace;">${escaparHTML(em.tag)}</td>
              <td style="padding: 8px 6px; color: #E2E8F0;">${escaparHTML(em.descripcion)}</td>
              <td style="padding: 8px 6px; font-family: monospace; color: #CBD5E1;">${escaparHTML(em.om)}</td>
              <td style="padding: 8px 6px; text-align: center;">
                <button type="button" onclick="window.actualizarCampoEmergencia('${escaparHTML(key)}', 'notifSap', ${!em.notifSap})" style="background: ${em.notifSap ? 'rgba(0, 230, 118, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${em.notifSap ? '#00e676' : '#f87171'}; border: none; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
                  ${em.notifSap ? 'SÍ' : 'NO'}
                </button>
              </td>
              <td style="padding: 8px 6px; text-align: center;">
                <button type="button" onclick="window.actualizarCampoEmergencia('${escaparHTML(key)}', 'ctec', ${!em.ctec})" style="background: ${em.ctec ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${em.ctec ? '#2dd4bf' : '#94A3B8'}; border: none; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
                  ${em.ctec ? 'SÍ' : 'NO'}
                </button>
              </td>
            </tr>
          `)
          .join('')}
      </tbody>
    </table>
  `;
};

// ============================================================================
// TABLA DE AVISOS ESPECTRALES CON CONTROL DE DÍAS (SLA)
// ============================================================================
const renderizarTablaEspectrales = (): void => {
  const cont = document.getElementById('pms-tabla-espectrales-container');
  const lblPendientes = document.getElementById('lbl-esp-pendientes-count');
  const lblEmitidos = document.getElementById('lbl-esp-emitidos-count');
  const lblObsoletos = document.getElementById('lbl-esp-obsoletos-count');

  if (!cont) return;

  const items = Object.entries(datosEspectralesSemana);
  let cantPendientes = 0;
  let cantEmitidos = 0;
  let cantObsoletos = 0;

  items.forEach(([, esp]) => {
    const est = esp.estado || 'Pendiente';
    if (est === 'Emitido' || est === 'CERRADO_EJECUTADO') cantEmitidos++;
    else if (est === 'CERRADO_OBSOLETO' || est === 'Obsoleto') cantObsoletos++;
    else cantPendientes++;
  });

  if (lblPendientes) lblPendientes.textContent = String(cantPendientes);
  if (lblEmitidos) lblEmitidos.textContent = String(cantEmitidos);
  if (lblObsoletos) lblObsoletos.textContent = String(cantObsoletos);

  const filtrados = items.filter(([, esp]) => {
    const est = esp.estado || 'Pendiente';
    if (filtroEspectralesEstado === 'PENDIENTES') return est !== 'Emitido' && est !== 'CERRADO_EJECUTADO' && est !== 'CERRADO_OBSOLETO';
    if (filtroEspectralesEstado === 'EMITIDOS') return est === 'Emitido' || est === 'CERRADO_EJECUTADO';
    if (filtroEspectralesEstado === 'OBSOLETOS') return est === 'CERRADO_OBSOLETO' || est === 'Obsoleto';
    return true;
  });

  if (filtrados.length === 0) {
    cont.innerHTML = `<div style="padding: 2rem; text-align: center; color: #94A3B8; font-size: 0.85rem;">No hay avisos espectrales bajo este filtro.</div>`;
    return;
  }

  const ahora = Date.now();

  cont.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.78rem;">
      <thead>
        <tr style="background: rgba(0,0,0,0.5); color: #94A3B8; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <th style="padding: 9px 8px; width: 30px; text-align: center;">#</th>
          <th style="padding: 9px 8px; min-width: 80px;">DETECCIÓN</th>
          <th style="padding: 9px 8px; min-width: 75px; text-align: center;">SLA (DÍAS)</th>
          <th style="padding: 9px 8px; min-width: 90px;">TAG / ÁREA</th>
          <th style="padding: 9px 8px; min-width: 150px;">COMPONENTE & PUNTO</th>
          <th style="padding: 9px 8px; min-width: 80px; text-align: center;">RMS</th>
          <th style="padding: 9px 8px; min-width: 110px;">AVISO SAP</th>
          <th style="padding: 9px 8px; min-width: 150px; text-align: center;">ACCIONES DE CIERRE</th>
        </tr>
      </thead>
      <tbody>
        ${filtrados
          .map(([idKey, esp], idx) => {
            const fechaObj = obtenerObjetoFecha(esp.fechaDeteccion || esp.fechaCorta);
            const timestampDetect = fechaObj.getTime() < ahora ? fechaObj.getTime() : ahora;
            const diasTranscurridos = Math.max(0, Math.floor((ahora - timestampDetect) / 86400000));

            let colorDias = '#00e676';
            if (diasTranscurridos > 7) colorDias = '#ef4444';
            else if (diasTranscurridos > 3) colorDias = '#F5A623';

            return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 8px; text-align: center; color: #94A3B8;">${idx + 1}</td>
                <td style="padding: 8px; font-family: monospace;">${escaparHTML(formatearFechaDDMMAAAA(esp.fechaDeteccion || esp.fechaCorta))}</td>
                <td style="padding: 8px; text-align: center;">
                  <span style="background: rgba(0,0,0,0.3); color: ${colorDias}; border: 1px solid ${colorDias}40; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-family: monospace;">
                    ${diasTranscurridos} d
                  </span>
                </td>
                <td style="padding: 8px; font-weight: 800; color: #ffffff; font-family: monospace;">${escaparHTML(esp.tag)}</td>
                <td style="padding: 8px; color: #f8fafc;">${escaparHTML(esp.componente)} (${escaparHTML(esp.punto)})</td>
                <td style="padding: 8px; text-align: center; font-weight: 900; color: #f87171;">${Number(esp.rms).toFixed(2)}</td>
                <td style="padding: 8px; font-family: monospace; color: #38bdf8;">${escaparHTML(esp.avisoSap || 'S/A')}</td>
                <td style="padding: 8px; text-align: center;">
                  <button type="button" onclick="window.abrirModalCierreEjecucion('${escaparHTML(idKey)}')" style="background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.4); padding: 4px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 800; cursor: pointer;">
                    Ejecutar
                  </button>
                  <button type="button" onclick="window.abrirModalCierreObsolescencia('${escaparHTML(idKey)}')" style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 4px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 800; cursor: pointer; margin-left: 4px;">
                    Obsoleto
                  </button>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
};

// ============================================================================
// ACTUALIZACIÓN DE CAMPOS Y DESPACHO CON AUDITORÍA
// ============================================================================
export const actualizarCampoOrden = async (idOrden: string, campo: string, valor: any): Promise<void> => {
  if (datosSemanaActual.ordenes[idOrden]) {
    (datosSemanaActual.ordenes[idOrden] as any)[campo] = valor;
  }
  renderizarKPIsYTablas();

  await SyncManager.despacharOEncolar(`om_pms:${idOrden}`, 'UPDATE', {
    idOrden,
    semana: semanaSeleccionada,
    campo,
    valor,
    timestamp: Date.now()
  });
};

export const actualizarCampoEmergencia = async (idEmergencia: string, campo: string, valor: any): Promise<void> => {
  if (datosSemanaActual.actividades_emergentes[idEmergencia]) {
    (datosSemanaActual.actividades_emergentes[idEmergencia] as any)[campo] = valor;
  }
  renderizarKPIsYTablas();

  await SyncManager.despacharOEncolar(`emergencia_pms:${idEmergencia}`, 'UPDATE', {
    idEmergencia,
    semana: semanaSeleccionada,
    campo,
    valor,
    timestamp: Date.now()
  });
};

export const abrirModalCierreEjecucion = async (idKey: string): Promise<void> => {
  const esp = datosEspectralesSemana[idKey];
  if (!esp) return;

  const res = await mostrarModalIndustrial({
    titulo: 'Cierre Técnico de Aviso & Impacto en Bitácora',
    icono: 'task_alt',
    colorBase: '0, 230, 118',
    htmlCuerpo: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">N° Orden de Trabajo (OT SAP) *</label>
          <input type="text" name="otSap" placeholder="Ej: 40058912" required style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">Detalle de la Tarea Ejecutada *</label>
          <textarea name="detalle" rows="3" placeholder="Ej: Se ejecutó cambio de rodamientos..." required style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; resize: none; outline: none;"></textarea>
        </div>
      </div>
    `,
    textoConfirmar: 'Guardar Cierre'
  });

  if (!res || !res.otSap || !res.detalle) return;

  esp.estado = 'CERRADO_EJECUTADO';
  esp.otSap = res.otSap.trim();
  esp.detalleTarea = res.detalle.trim();
  renderizarTablaEspectrales();

  await SyncManager.despacharOEncolar(`aviso_espectral:${idKey}`, 'UPDATE', {
    ...esp,
    timestampCierre: Date.now()
  });
};

export const abrirModalCierreObsolescencia = async (idKey: string): Promise<void> => {
  const esp = datosEspectralesSemana[idKey];
  if (!esp) return;

  const res = await mostrarModalIndustrial({
    titulo: 'Marcar Aviso como Obsoleto',
    icono: 'block',
    colorBase: '239, 68, 68',
    htmlCuerpo: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">Motivo de Obsolescencia *</label>
          <input type="text" name="motivo" placeholder="Ej: Componente sustituido en otra parada" required style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none;">
        </div>
      </div>
    `,
    textoConfirmar: 'Confirmar Obsolescencia'
  });

  if (!res || !res.motivo) return;

  esp.estado = 'CERRADO_OBSOLETO';
  esp.motivoObsolescencia = res.motivo.trim();
  renderizarTablaEspectrales();

  await SyncManager.despacharOEncolar(`aviso_espectral:${idKey}`, 'UPDATE', {
    ...esp,
    timestampCierre: Date.now()
  });
};

export const procesarArchivoExcelPMS = (event: Event): void => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet);

      if (jsonData.length === 0) {
        alert('El archivo no contiene registros válidos.');
        return;
      }

      const ordenesImportadas: Record<string, OrdenTrabajoPMS> = {};

      jsonData.forEach((row, i) => {
        const numOm = String(row.Orden || row.OM || row['Nº orden'] || i + 1).trim();
        const rawEstatus = String(row['Estado de sistema'] || row['Status'] || '').toUpperCase();
        const esNotif = rawEstatus.includes('NOTI');
        const esCtec = rawEstatus.includes('CTEC') || rawEstatus.includes('CERR');

        ordenesImportadas[`ORD_${numOm}`] = {
          id: `ORD_${numOm}`,
          numero: numOm,
          fecha: String(row['Fecha fin extrema'] || row.Fecha || new Date().toISOString()),
          area: extraerAreaLimpia(row['Ubicación técnica'] || 'General'),
          equipo: String(row['Denominación de objeto técnico'] || row.Equipo || 'Equipo'),
          tag: String(row.Equipo || row.TAG || 'SIN-TAG'),
          actividad: String(row['Texto de mensaje'] || row.Operación || 'Inspección CBM'),
          cruce: 'Catastrado',
          estadoReal: esNotif || esCtec ? 'Ejecutado' : 'Pendiente',
          notifSap: esNotif,
          ctec: esCtec,
          adjuntos: parseInt(String(row['Cant Adj.'] || 0), 10) || 0,
          observacion: rawEstatus
        };
      });

      datosSemanaActual.ordenes = ordenesImportadas;
      renderizarKPIsYTablas();

      // Despachar lote importado hacia el backend con trazabilidad
      await SyncManager.despacharOEncolar(`carga_masiva_pms:${semanaSeleccionada}`, 'CREATE', {
        semana: semanaSeleccionada,
        totalOrdenes: jsonData.length,
        ordenes: ordenesImportadas
      });

      alert(`✅ Sincronizadas ${jsonData.length} órdenes de trabajo de SAP PM.`);
    } catch (err) {
      console.error('[PMS] Error procesando archivo Excel:', err);
      alert('Error al leer el archivo Excel.');
    } finally {
      target.value = '';
    }
  };

  reader.readAsArrayBuffer(file);
};

export const abrirModalNuevaEmergencia = async (): Promise<void> => {
  const res = await mostrarModalIndustrial({
    titulo: 'Registrar Actividad Emergente',
    icono: 'bolt',
    colorBase: '245, 166, 35',
    htmlCuerpo: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">TAG del Equipo *</label>
          <input type="text" name="tag" placeholder="Ej: MH3323" required style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none; font-family: monospace;">
        </div>
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">Descripción del Imprevisto *</label>
          <textarea name="desc" rows="3" placeholder="Detalle la falla o atención requerida..." required style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; resize: none; outline: none;"></textarea>
        </div>
        <div>
          <label style="font-size: 0.74rem; color: #94A3B8;">OM / Aviso SAP (Opcional)</label>
          <input type="text" name="om" placeholder="Ej: 31662428" style="width: 100%; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px; border-radius: 6px; box-sizing: border-box; outline: none; font-family: monospace;">
        </div>
      </div>
    `,
    textoConfirmar: 'Registrar'
  });

  if (!res || !res.tag || !res.desc) return;

  const idEmergencia = `EMG_${Date.now()}`;
  const nuevaEmergencia: ActividadEmergente = {
    id: idEmergencia,
    tag: res.tag.trim().toUpperCase(),
    descripcion: res.desc.trim(),
    om: res.om?.trim() || 'S/N',
    fecha: new Date().toISOString().split('T')[0],
    turno: 'CPF',
    notifSap: false,
    ctec: false
  };

  datosSemanaActual.actividades_emergentes[idEmergencia] = nuevaEmergencia;
  renderizarKPIsYTablas();

  await SyncManager.despacharOEncolar(`emergencia_pms:${idEmergencia}`, 'CREATE', nuevaEmergencia);
};

// Exposición global para el DOM
if (typeof window !== 'undefined') {
  const w = window as any;
  w.renderizarModuloPMS = renderizarModuloPMS;
  w.actualizarCampoOrden = actualizarCampoOrden;
  w.actualizarCampoEmergencia = actualizarCampoEmergencia;
  w.abrirModalCierreEjecucion = abrirModalCierreEjecucion;
  w.abrirModalCierreObsolescencia = abrirModalCierreObsolescencia;
  w.abrirModalNuevaEmergencia = abrirModalNuevaEmergencia;
  w.procesarArchivoExcelPMS = procesarArchivoExcelPMS;
  w.filtrarOrdenesTexto = (txt: string) => {
    filtroTexto = txt;
    renderizarTablaOrdenes();
  };
  w.filtrarEspectralesPorEstado = (st: any) => {
    filtroEspectralesEstado = st;
    renderizarTablaEspectrales();
  };
  w.cambiarPeriodoPMS = (sem: string) => {
    semanaSeleccionada = sem;
    cargarDatosSemanaActual();
  };
}