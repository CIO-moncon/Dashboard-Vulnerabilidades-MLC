// ============================================================================
// MÓDULO UI: JS/UI/PMS.JS
// CIO PREDICTIVO 2.0 — Auditoría PMS, Control de Espectrales y Reporte PDF SAP
// ============================================================================

import { auth, db } from '../core/firebase-config.js';
import {
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    obtenerSemanaISO,
    formatearFechaNomenclatura
} from '../core/pdf-plantilla.js';

// ----------------------------------------------------------------------------
// ESTADO INTERNO DEL MÓDULO PMS
// ----------------------------------------------------------------------------
let semanaSeleccionada = 'PMS42';
let listaSemanasDisponibles = [];
let datosSemanaActual = {
    ordenes: {},
    actividades_emergentes: {}
};
let datosEspectralesSemana = {};
let filtroTexto = '';
let filtroEstado = 'TODOS';
let filtroEspectralesEstado = 'PENDIENTES'; // 'TODOS' | 'PENDIENTES' | 'EMITIDOS'
let filtroEspectralesFecha = 'TODAS';
let debounceGuardado = {};

const dbPMS = db.ref('historial_informes/pms_semanal');
const dbEspectrales = db.ref('control_informes_espectrales');

// ----------------------------------------------------------------------------
// UTILIDADES PURAS
// ----------------------------------------------------------------------------
const escaparHTML = (texto = '') =>
    String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// ----------------------------------------------------------------------------
// RENDERIZADO PRINCIPAL DEL CONTENEDOR PMS
// ----------------------------------------------------------------------------
export const renderizarModuloPMS = (idContenedor = 'espacio-trabajo-dinamico') => {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    contenedor.innerHTML = `
        <section class="seccion-pms-industrial" style="padding: 1.25rem; height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.25s ease;">
            
            <!-- ENCABEZADO Y CONTROLES SUPERIORES -->
            <header style="background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h2 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: #38bdf8;" aria-hidden="true">calendar_month</span>
                        Auditoría de Programa Semanal (PMS) & Auditoría CBM
                    </h2>
                    <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted, #94a3b8);">
                        Control de OMs SAP PM, gestión de emergencias y trazabilidad de Informes Espectrales requeridos.
                    </p>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                        <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 700;">PERIODO:</span>
                        <select id="pms-selector-periodo" onchange="window.cambiarPeriodoPMS(this.value)" style="background: #0f172a; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); padding: 5px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; outline: none; cursor: pointer;">
                            <option value="PMS42">Respaldo: PMS42 (Activa)</option>
                        </select>
                    </div>

                    <button type="button" onclick="window.descargarReportePDF_PMS()" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 7px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">picture_as_pdf</span>
                        Descargar PDF
                    </button>

                    <button type="button" onclick="document.getElementById('input-excel-pms').click()" style="background: #0284c7; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">upload_file</span>
                        Subir EXPORT.XLSX
                    </button>
                    <input type="file" id="input-excel-pms" accept=".xlsx, .xls, .csv" style="display: none;" onchange="window.procesarArchivoExcelPMS(event)">

                    <button type="button" id="btn-volver-dashboard" style="background: rgba(255, 255, 255, 0.08); color: #e2e8f0; border: 1px solid var(--border-glass, rgba(255,255,255,0.15)); padding: 7px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">map</span>
                        Mapa
                    </button>
                </div>
            </header>

            <!-- KPIS GENERALES PMS -->
            <div id="pms-kpis-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;"></div>

            <!-- SECCIÓN: CONTROL DE INFORMES ESPECTRALES -->
            <section style="background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h3 style="margin: 0; font-size: 1rem; color: #f87171; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="color: #ef4444;" aria-hidden="true">assignment_late</span>
                            Control de Informes Espectrales Requeridos (RMS &ge; 7.1 mm/s en Motor o Reductor)
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 0.75rem; color: var(--text-muted, #94a3b8);">
                            Generados automáticamente desde las rutas de terreno. Usa el switch para confirmar la subida del informe a SAP.
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 5px; background: #0f172a; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);">
                            <span style="font-size: 0.72rem; color: #94a3b8;">Día:</span>
                            <select id="pms-filtro-fecha-espectral" onchange="window.filtrarEspectralesPorFecha(this.value)" style="background: transparent; border: none; color: white; font-size: 0.75rem; font-weight: 700; outline: none; cursor: pointer;">
                                <option value="TODAS">Toda la Semana</option>
                            </select>
                        </div>

                        <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.3); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                            <button type="button" id="btn-filtro-esp-pendientes" onclick="window.filtrarEspectralesPorEstado('PENDIENTES')" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
                                Solo Pendientes (<span id="lbl-esp-pendientes-count">0</span>)
                            </button>
                            <button type="button" id="btn-filtro-esp-emitidos" onclick="window.filtrarEspectralesPorEstado('EMITIDOS')" style="background: transparent; color: #94a3b8; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                                En SAP (<span id="lbl-esp-emitidos-count">0</span>)
                            </button>
                            <button type="button" id="btn-filtro-esp-todos" onclick="window.filtrarEspectralesPorEstado('TODOS')" style="background: transparent; color: #94a3b8; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                                Todos (<span id="lbl-esp-total-count">0</span>)
                            </button>
                        </div>
                    </div>
                </div>

                <div id="pms-tabla-espectrales-container" style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;"></div>
            </section>

            <!-- SECCIÓN: ACTIVIDADES EMERGENTES / IMPREVISTOS EN TERRENO -->
            <section style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); border-radius: 12px; padding: 14px 18px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 0.95rem; color: #f59e0b; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
                        Actividades Emergentes / Imprevistos en Terreno (<span id="pms-total-emergencias">0</span>)
                    </h3>
                    <button type="button" onclick="window.abrirModalNuevaEmergencia()" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;" aria-hidden="true">add</span>
                        Registrar Emergencia
                    </button>
                </div>
                <div id="pms-tabla-emergencias-container" style="overflow-x: auto;"></div>
            </section>

            <!-- SECCIÓN: ÓRDENES SAP PM -->
            <section style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass, rgba(255,255,255,0.1)); border-radius: 12px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 280px;">
                        <div style="position: relative; flex: 1;">
                            <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: var(--text-muted); pointer-events: none;" aria-hidden="true">search</span>
                            <input type="search" id="pms-busqueda-input" placeholder="Filtrar por OM, Equipo, Ubicación..." oninput="window.filtrarOrdenesTexto(this.value)" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px 8px 34px; border-radius: 6px; font-size: 0.82rem; outline: none; box-sizing: border-box;">
                        </div>
                        <select id="pms-filtro-estado" onchange="window.filtrarOrdenesEstado(this.value)" style="background: #0f172a; color: white; border: 1px solid rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 6px; font-size: 0.82rem; outline: none; cursor: pointer;">
                            <option value="TODOS">Todos los Estados</option>
                            <option value="Ejecutado">Solo Ejecutados</option>
                            <option value="Pendiente">Solo Pendientes</option>
                            <option value="No Ejecutado">Solo No Ejecutados</option>
                        </select>
                    </div>

                    <button type="button" onclick="window.eliminarRespaldoSemanaActual()" style="background: transparent; border: none; color: #ef4444; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">delete</span>
                        Borrar Respaldo <span id="pms-lbl-semana-borrar">PMS42</span>
                    </button>
                </div>

                <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.4); color: var(--text-muted, #94a3b8); border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="padding: 10px; width: 35px; text-align: center;">#</th>
                                <th style="padding: 10px; min-width: 90px;">FECHA</th>
                                <th style="padding: 10px; min-width: 65px;">ÁREA</th>
                                <th style="padding: 10px; min-width: 170px;">EQUIPO / UBIC. TÉCNICA</th>
                                <th style="padding: 10px; min-width: 95px;">OM</th>
                                <th style="padding: 10px; min-width: 90px; text-align: center;">CRUCE</th>
                                <th style="padding: 10px; min-width: 180px;">ACTIVIDAD / OBJETO</th>
                                <th style="padding: 10px; min-width: 130px;">ESTADO REAL</th>
                                <th style="padding: 10px; min-width: 80px; text-align: center;">NOTIF. SAP</th>
                                <th style="padding: 10px; min-width: 75px; text-align: center;">CTEC</th>
                                <th style="padding: 10px; min-width: 60px; text-align: center;">FOTOS</th>
                                <th style="padding: 10px; min-width: 190px;">OBSERVACIÓN / JUSTIFICACIÓN</th>
                            </tr>
                        </thead>
                        <tbody id="pms-tabla-ordenes-body"></tbody>
                    </table>
                </div>
            </section>
        </section>
    `;

    inicializarListenersPMS();
};

// ----------------------------------------------------------------------------
// SINCRONIZACIÓN Y ESCUCHA EN FIREBASE
// ----------------------------------------------------------------------------
const inicializarListenersPMS = () => {
    dbPMS.on('value', (snapshot) => {
        const val = snapshot.val() || {};
        listaSemanasDisponibles = Object.keys(val).sort().reverse();

        if (listaSemanasDisponibles.length === 0) {
            listaSemanasDisponibles = ['PMS42'];
        }

        if (!listaSemanasDisponibles.includes(semanaSeleccionada)) {
            semanaSeleccionada = listaSemanasDisponibles[0];
        }

        actualizarSelectorSemanas();
        cargarDatosSemana(semanaSeleccionada);
    });

    escucharInformesEspectrales();
};

const actualizarSelectorSemanas = () => {
    const sel = document.getElementById('pms-selector-periodo');
    const lblBorrar = document.getElementById('pms-lbl-semana-borrar');
    if (!sel) return;

    if (lblBorrar) lblBorrar.textContent = semanaSeleccionada;

    sel.innerHTML = listaSemanasDisponibles.map((sem, idx) => `
        <option value="${sem}" ${sem === semanaSeleccionada ? 'selected' : ''}>
            ${idx === 0 ? '🟢 ' : '📁 '}Respaldo: ${sem} ${idx === 0 ? '(Semana Activa)' : ''}
        </option>
    `).join('');
};

const cargarDatosSemana = (nombreSemana) => {
    dbPMS.child(nombreSemana).on('value', (snap) => {
        const data = snap.val() || {};
        datosSemanaActual = {
            ordenes: data.ordenes || {},
            actividades_emergentes: data.actividades_emergentes || {}
        };
        renderizarKPIsYTablas();
    });
};

const escucharInformesEspectrales = () => {
    const semanaNorm = semanaSeleccionada.replace('PMS', 'S');

    dbEspectrales.child(semanaNorm).on('value', (snap) => {
        datosEspectralesSemana = snap.val() || {};
        actualizarSelectFechasEspectrales();
        renderizarTablaEspectrales();
    });
};

window.cambiarPeriodoPMS = (nuevaSemana) => {
    semanaSeleccionada = nuevaSemana;
    const lblBorrar = document.getElementById('pms-lbl-semana-borrar');
    if (lblBorrar) lblBorrar.textContent = semanaSeleccionada;
    cargarDatosSemana(semanaSeleccionada);
    escucharInformesEspectrales();
};

// ----------------------------------------------------------------------------
// RENDERIZADO DE TABLA DE INFORMES ESPECTRALES CON SWITCH DE CONTROL
// ----------------------------------------------------------------------------
const actualizarSelectFechasEspectrales = () => {
    const selFecha = document.getElementById('pms-filtro-fecha-espectral');
    if (!selFecha) return;

    const items = Object.values(datosEspectralesSemana);
    const fechasSet = new Set();
    items.forEach((item) => {
        if (item.fechaCorta) fechasSet.add(item.fechaCorta);
    });

    const fechasArr = Array.from(fechasSet).sort().reverse();
    const optPrevias = selFecha.value;

    selFecha.innerHTML = `
        <option value="TODAS">Toda la Semana (${items.length})</option>
        ${fechasArr.map((f) => `<option value="${f}">${f}</option>`).join('')}
    `;

    if (fechasArr.includes(optPrevias)) {
        selFecha.value = optPrevias;
    }
};

const renderizarTablaEspectrales = () => {
    const cont = document.getElementById('pms-tabla-espectrales-container');
    const lblPendientes = document.getElementById('lbl-esp-pendientes-count');
    const lblEmitidos = document.getElementById('lbl-esp-emitidos-count');
    const lblTotal = document.getElementById('lbl-esp-total-count');

    if (!cont) return;

    const items = Object.entries(datosEspectralesSemana);
    let cantPendientes = 0;
    let cantEmitidos = 0;

    items.forEach(([, esp]) => {
        if (esp.estado === 'Emitido') cantEmitidos++;
        else cantPendientes++;
    });

    if (lblPendientes) lblPendientes.textContent = String(cantPendientes);
    if (lblEmitidos) lblEmitidos.textContent = String(cantEmitidos);
    if (lblTotal) lblTotal.textContent = String(items.length);

    const filtrados = items.filter(([, esp]) => {
        const coincideFecha = filtroEspectralesFecha === 'TODAS' || esp.fechaCorta === filtroEspectralesFecha;
        let coincideEstado = true;

        if (filtroEspectralesEstado === 'PENDIENTES') {
            coincideEstado = esp.estado !== 'Emitido';
        } else if (filtroEspectralesEstado === 'EMITIDOS') {
            coincideEstado = esp.estado === 'Emitido';
        }

        return coincideFecha && coincideEstado;
    });

    if (filtrados.length === 0) {
        cont.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                <span class="material-symbols-outlined" style="font-size: 2rem; color: #00e676; margin-bottom: 6px;" aria-hidden="true">check_circle</span>
                <p style="margin: 0;">No hay informes espectrales pendientes bajo los filtros seleccionados.</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.78rem;">
            <thead>
                <tr style="background: rgba(0,0,0,0.5); color: var(--text-muted, #94a3b8); border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <th style="padding: 9px 8px; width: 30px; text-align: center;">#</th>
                    <th style="padding: 9px 8px; min-width: 85px;">FECHA DETECCIÓN</th>
                    <th style="padding: 9px 8px; min-width: 90px;">TAG / EQUIPO</th>
                    <th style="padding: 9px 8px; min-width: 160px;">COMPONENTE & PTO. CRÍTICO</th>
                    <th style="padding: 9px 8px; min-width: 85px; text-align: center;">RMS DETECTADO</th>
                    <th style="padding: 9px 8px; min-width: 120px;">N° AVISO SAP</th>
                    <th style="padding: 9px 8px; min-width: 150px; text-align: center;">SWITCH DE CONTROL</th>
                    <th style="padding: 9px 8px; min-width: 90px; text-align: center;">EXPEDIENTE</th>
                </tr>
            </thead>
            <tbody>
                ${filtrados.map(([idKey, esp], idx) => {
                    const esEmitido = esp.estado === 'Emitido';
                    const semanaNorm = semanaSeleccionada.replace('PMS', 'S');

                    return `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); background: ${esEmitido ? 'rgba(0, 230, 118, 0.02)' : 'rgba(239, 68, 68, 0.04)'}; transition: background 0.15s ease;">
                            <td style="padding: 8px; text-align: center; color: var(--text-muted);">${idx + 1}</td>
                            <td style="padding: 8px; font-family: monospace; white-space: nowrap;">${escaparHTML(esp.fechaDeteccion || esp.fechaCorta || 'Hoy')}</td>
                            
                            <td style="padding: 8px;">
                                <div style="font-weight: 800; color: #ffffff; font-family: monospace;">${escaparHTML(esp.tag || 'TAG')}</div>
                                <div style="font-size: 0.68rem; color: #38bdf8;">${escaparHTML(esp.area || 'General')}</div>
                            </td>

                            <td style="padding: 8px;">
                                <div style="color: #f8fafc; font-weight: 700;">${escaparHTML(esp.componente || 'Punto')}</div>
                                <div style="font-size: 0.68rem; color: #f87171; font-family: monospace; font-weight: 800;">Punto: ${escaparHTML(esp.punto || '')}</div>
                            </td>

                            <td style="padding: 8px; text-align: center;">
                                <span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 900; font-family: monospace;">
                                    ${parseFloat(esp.rms || 0).toFixed(2)} mm/s
                                </span>
                            </td>

                            <td style="padding: 8px;">
                                <input type="text" 
                                       value="${escaparHTML(esp.avisoSap || '')}" 
                                       placeholder="Ej: 10052341" 
                                       oninput="window.autoGuardarAvisoSapEspectral('${semanaNorm}', '${idKey}', this.value)"
                                       style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); color: white; padding: 5px 8px; border-radius: 4px; font-size: 0.74rem; font-family: monospace; outline: none; box-sizing: border-box;">
                            </td>

                            <td style="padding: 8px; text-align: center;">
                                <button type="button" 
                                        onclick="window.alternarSwitchEspectral('${semanaNorm}', '${idKey}', '${esp.estado || 'Pendiente'}')"
                                        title="${esEmitido ? 'Clic para reactivar a Pendiente' : 'Clic para marcar como Realizado y Subido a SAP'}"
                                        style="background: ${esEmitido ? 'rgba(0, 230, 118, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${esEmitido ? '#00e676' : '#f87171'}; border: 1px solid ${esEmitido ? '#00e676' : '#ef4444'}; padding: 5px 12px; border-radius: 20px; font-size: 0.74rem; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px ${esEmitido ? 'rgba(0,230,118,0.25)' : 'rgba(239,68,68,0.25)'}; transition: all 0.18s ease;">
                                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${esEmitido ? '#00e676' : '#ef4444'}; display: inline-block;"></span>
                                    <span>${esEmitido ? '✅ EN SAP / REALIZADO' : '⏳ PENDIENTE'}</span>
                                </button>
                            </td>

                            <td style="padding: 8px; text-align: center;">
                                <button type="button" 
                                        onclick="window.irAExpedienteDesdeAlerta?.('${esp.tag}')"
                                        style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                                    Ver Ficha
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
};

// ----------------------------------------------------------------------------
// ACCIONES DEL SWITCH Y FILTROS ESPECTRALES
// ----------------------------------------------------------------------------
window.alternarSwitchEspectral = async (semanaKey, idRegistro, estadoActual) => {
    const nuevoEstado = estadoActual === 'Emitido' ? 'Pendiente' : 'Emitido';

    try {
        await dbEspectrales.child(semanaKey).child(idRegistro).update({
            estado: nuevoEstado,
            fechaCierre: nuevoEstado === 'Emitido' ? new Date().toLocaleString() : null,
            usuarioCierre: nuevoEstado === 'Emitido' ? (auth.currentUser?.email || 'Analista CBM') : null
        });

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            if (nuevoEstado === 'Emitido') {
                UI.mostrarToast('✅ Informe Espectral marcado como Realizado y Subido a SAP.', 'exito');
            } else {
                UI.mostrarToast('⏳ Informe reactivado como Pendiente.', 'alerta');
            }
        }
    } catch (err) {
        console.error('Error al alternar estado del informe espectral:', err);
    }
};

window.autoGuardarAvisoSapEspectral = (semanaKey, idRegistro, valor) => {
    clearTimeout(debounceGuardado[`sap_${idRegistro}`]);
    debounceGuardado[`sap_${idRegistro}`] = setTimeout(async () => {
        try {
            await dbEspectrales.child(semanaKey).child(idRegistro).child('avisoSap').set(valor.trim());
        } catch (err) {
            console.error('Error guardando aviso SAP:', err);
        }
    }, 500);
};

window.filtrarEspectralesPorEstado = (estado) => {
    filtroEspectralesEstado = estado;

    const btnPendientes = document.getElementById('btn-filtro-esp-pendientes');
    const btnEmitidos = document.getElementById('btn-filtro-esp-emitidos');
    const btnTodos = document.getElementById('btn-filtro-esp-todos');

    if (btnPendientes) {
        btnPendientes.style.background = estado === 'PENDIENTES' ? '#ef4444' : 'transparent';
        btnPendientes.style.color = estado === 'PENDIENTES' ? 'white' : '#94a3b8';
    }
    if (btnEmitidos) {
        btnEmitidos.style.background = estado === 'EMITIDOS' ? '#00e676' : 'transparent';
        btnEmitidos.style.color = estado === 'EMITIDOS' ? '#0f172a' : '#94a3b8';
    }
    if (btnTodos) {
        btnTodos.style.background = estado === 'TODOS' ? '#38bdf8' : 'transparent';
        btnTodos.style.color = estado === 'TODOS' ? '#0f172a' : '#94a3b8';
    }

    renderizarTablaEspectrales();
};

window.filtrarEspectralesPorFecha = (fecha) => {
    filtroEspectralesFecha = fecha;
    renderizarTablaEspectrales();
};

// ----------------------------------------------------------------------------
// CÁLCULO DE KPIS GENERALES PMS
// ----------------------------------------------------------------------------
const renderizarKPIsYTablas = () => {
    const ordenesArray = Object.values(datosSemanaActual.ordenes || {});
    const totalProgramadas = ordenesArray.length;

    let ejecutadas = 0;
    let notifSAP = 0;
    let ctecCerradas = 0;

    ordenesArray.forEach((o) => {
        const est = String(o.estadoReal || 'Ejecutado').toLowerCase();
        if (est === 'ejecutado') ejecutadas++;
        if (o.notifSap === true || String(o.notifSap) === 'true') notifSAP++;
        if (o.ctec === true || String(o.ctec) === 'true') ctecCerradas++;
    });

    const pendientes = totalProgramadas - ejecutadas;
    const pctCumplimiento = totalProgramadas > 0 ? Math.round((ejecutadas / totalProgramadas) * 100) : 0;
    const pctNotif = totalProgramadas > 0 ? Math.round((notifSAP / totalProgramadas) * 100) : 0;
    const pctCtec = totalProgramadas > 0 ? Math.round((ctecCerradas / totalProgramadas) * 100) : 0;

    const kpisContainer = document.getElementById('pms-kpis-container');
    if (kpisContainer) {
        kpisContainer.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 10px; padding: 12px 16px;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Cumplimiento Terreno</span>
                <div style="font-size: 1.8rem; font-weight: 900; color: #00e676; margin: 4px 0;">${pctCumplimiento}%</div>
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 5px; overflow: hidden; margin-top: 6px;">
                    <div style="background: #00e676; width: ${pctCumplimiento}%; height: 100%;"></div>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; display: block;">${ejecutadas} de ${totalProgramadas} OMs</span>
            </div>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 12px 16px;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Programado</span>
                <div style="font-size: 1.8rem; font-weight: 900; color: #38bdf8; margin: 4px 0;">${totalProgramadas}</div>
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 11px; display: block;">Órdenes de Trabajo SAP PM</span>
            </div>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 10px; padding: 12px 16px;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Pendientes Medición</span>
                <div style="font-size: 1.8rem; font-weight: 900; color: #eab308; margin: 4px 0;">${pendientes}</div>
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 11px; display: block;">${pendientes === 0 ? 'Sin atrasos en ruta' : 'En proceso de ejecución'}</span>
            </div>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 12px 16px;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Notificadas SAP (%)</span>
                <div style="font-size: 1.8rem; font-weight: 900; color: #c084fc; margin: 4px 0;">${pctNotif}%</div>
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 5px; overflow: hidden; margin-top: 6px;">
                    <div style="background: #c084fc; width: ${pctNotif}%; height: 100%;"></div>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; display: block;">${notifSAP} de ${totalProgramadas} OMs</span>
            </div>

            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(45, 212, 191, 0.3); border-radius: 10px; padding: 12px 16px;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Cierre CTEC (%)</span>
                <div style="font-size: 1.8rem; font-weight: 900; color: #2dd4bf; margin: 4px 0;">${pctCtec}%</div>
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 5px; overflow: hidden; margin-top: 6px;">
                    <div style="background: #2dd4bf; width: ${pctCtec}%; height: 100%;"></div>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; display: block;">${ctecCerradas} de ${totalProgramadas} cerradas</span>
            </div>
        `;
    }

    renderizarTablaOrdenes();
    renderizarTablaEmergencias();
};

// ----------------------------------------------------------------------------
// TABLA DE ÓRDENES Y TABLA DE EMERGENCIAS
// ----------------------------------------------------------------------------
const renderizarTablaOrdenes = () => {
    const tbody = document.getElementById('pms-tabla-ordenes-body');
    if (!tbody) return;

    const entries = Object.entries(datosSemanaActual.ordenes || {});

    const filtradas = entries.filter(([, ord]) => {
        if (!ord) return false;
        const textoBusqueda = filtroTexto.toLowerCase();
        const coincideTexto = !textoBusqueda ||
            String(ord.numero || '').toLowerCase().includes(textoBusqueda) ||
            String(ord.equipo || '').toLowerCase().includes(textoBusqueda) ||
            String(ord.tag || '').toLowerCase().includes(textoBusqueda) ||
            String(ord.area || '').toLowerCase().includes(textoBusqueda);

        const coincideEstado = filtroEstado === 'TODOS' || ord.estadoReal === filtroEstado;
        return coincideTexto && coincideEstado;
    });

    if (filtradas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                    No se encontraron órdenes registradas para los filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtradas.map(([idKey, ord], idx) => {
        const esNotif = ord.notifSap === true || String(ord.notifSap) === 'true';
        const esCtec = ord.ctec === true || String(ord.ctec) === 'true';
        const estadoReal = ord.estadoReal || 'Ejecutado';

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 8px 10px; text-align: center; color: var(--text-muted);">${idx + 1}</td>
                <td style="padding: 8px 10px; font-family: monospace; white-space: nowrap;">${escaparHTML(ord.fecha || '13/10/2026')}</td>
                <td style="padding: 8px 10px; font-weight: 700; color: #38bdf8;">${escaparHTML(ord.area || 'AR54')}</td>
                
                <td style="padding: 8px 10px;">
                    <div style="font-weight: 700; color: #ffffff; font-family: monospace;">${escaparHTML(ord.tag || ord.equipo || 'EQUIPO')}</div>
                    <div style="font-size: 0.68rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                        ${escaparHTML(ord.ubicacion || ord.equipo || '')}
                    </div>
                </td>

                <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: #cbd5e1;">${escaparHTML(ord.numero || idKey)}</td>
                
                <td style="padding: 8px 10px; text-align: center;">
                    <span style="background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 4px; font-size: 0.68rem;">
                        ${escaparHTML(ord.cruce || 'No Catastrado')}
                    </span>
                </td>

                <td style="padding: 8px 10px; font-size: 0.74rem; color: #e2e8f0; max-width: 190px; line-height: 1.25;">
                    ${escaparHTML(ord.actividad || 'Inspección Predictiva')}
                </td>

                <td style="padding: 8px 10px;">
                    <select onchange="window.actualizarCampoOrden('${idKey}', 'estadoReal', this.value)" style="background: #0f172a; color: ${estadoReal === 'Ejecutado' ? '#00e676' : '#f59e0b'}; border: 1px solid rgba(255,255,255,0.15); padding: 4px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; outline: none; cursor: pointer;">
                        <option value="Ejecutado" ${estadoReal === 'Ejecutado' ? 'selected' : ''}>✅ Ejecutado</option>
                        <option value="Pendiente" ${estadoReal === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="No Ejecutado" ${estadoReal === 'No Ejecutado' ? 'selected' : ''}>❌ No Ejecutado</option>
                    </select>
                </td>

                <td style="padding: 8px 10px; text-align: center;">
                    <button type="button" onclick="window.actualizarCampoOrden('${idKey}', 'notifSap', ${!esNotif})" style="background: ${esNotif ? 'rgba(0, 230, 118, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${esNotif ? '#00e676' : '#f87171'}; border: 1px solid ${esNotif ? 'rgba(0, 230, 118, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer; transition: all 0.15s ease;">
                        ${esNotif ? '✓ SÍ' : '✕ NO'}
                    </button>
                </td>

                <td style="padding: 8px 10px; text-align: center;">
                    <button type="button" onclick="window.actualizarCampoOrden('${idKey}', 'ctec', ${!esCtec})" style="background: ${esCtec ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${esCtec ? '#2dd4bf' : '#94a3b8'}; border: 1px solid ${esCtec ? 'rgba(45, 212, 191, 0.4)' : 'rgba(255, 255, 255, 0.15)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer; transition: all 0.15s ease;">
                        ${esCtec ? '✓ SÍ' : '✕ NO'}
                    </button>
                </td>

                <td style="padding: 8px 10px; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
                    <span class="material-symbols-outlined" style="font-size: 0.95rem; vertical-align: middle;" aria-hidden="true">attach_file</span>
                    <span>${ord.adjuntos || 0}</span>
                </td>

                <td style="padding: 8px 10px;">
                    <input type="text" value="${escaparHTML(ord.observacion || '')}" placeholder="Motivo o justificación..." oninput="window.autoGuardarObservacion('${idKey}', this.value)" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.74rem; outline: none; box-sizing: border-box;">
                </td>
            </tr>
        `;
    }).join('');
};

const renderizarTablaEmergencias = () => {
    const cont = document.getElementById('pms-tabla-emergencias-container');
    const badgeTotal = document.getElementById('pms-total-emergencias');
    if (!cont) return;

    const items = Object.entries(datosSemanaActual.actividades_emergentes || {});
    if (badgeTotal) badgeTotal.textContent = String(items.length);

    if (items.length === 0) {
        cont.innerHTML = `
            <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
                No se han registrado actividades emergentes o imprevistos en esta semana.
            </div>
        `;
        return;
    }

    cont.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; text-align: left;">
            <thead>
                <tr style="color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <th style="padding: 8px 6px;">Fecha</th>
                    <th style="padding: 8px 6px;">TAG</th>
                    <th style="padding: 8px 6px;">Descripción del Imprevisto</th>
                    <th style="padding: 8px 6px;">OM / Aviso</th>
                    <th style="padding: 8px 6px;">Turno</th>
                    <th style="padding: 8px 6px; text-align: center;">Notif. SAP</th>
                    <th style="padding: 8px 6px; text-align: center;">CTEC</th>
                    <th style="padding: 8px 6px; text-align: center;">Acción</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(([key, em]) => {
                    const esNotif = em.notifSap === true || String(em.notifSap) === 'true';
                    const esCtec = em.ctec === true || String(em.ctec) === 'true';

                    return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 8px 6px; font-family: monospace; white-space: nowrap;">${escaparHTML(em.fecha || '2026-10-17')}</td>
                        <td style="padding: 8px 6px; font-weight: 700; color: #f87171; font-family: monospace;">${escaparHTML(em.tag || 'MH3323')}</td>
                        <td style="padding: 8px 6px; color: #e2e8f0; line-height: 1.3;">${escaparHTML(em.descripcion || 'Sin descripción')}</td>
                        <td style="padding: 8px 6px; font-family: monospace; color: #cbd5e1;">${escaparHTML(em.om || 'S/N')}</td>
                        <td style="padding: 8px 6px; color: var(--text-muted);">${escaparHTML(em.turno || 'CPF')}</td>
                        
                        <td style="padding: 8px 6px; text-align: center;">
                            <button type="button" 
                                    onclick="window.actualizarCampoEmergencia('${key}', 'notifSap',${!esNotif})" 
                                    style="background: ${esNotif ? 'rgba(0, 230, 118, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${esNotif ? '#00e676' : '#f87171'}; border: 1px solid ${esNotif ? 'rgba(0, 230, 118, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
                                ${esNotif ? '✓ SÍ' : '✕ NO'}
                            </button>
                        </td>

                        <td style="padding: 8px 6px; text-align: center;">
                            <button type="button" 
                                    onclick="window.actualizarCampoEmergencia('${key}', 'ctec',${!esCtec})" 
                                    style="background: ${esCtec ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${esCtec ? '#2dd4bf' : '#94a3b8'}; border: 1px solid ${esCtec ? 'rgba(45, 212, 191, 0.4)' : 'rgba(255, 255, 255, 0.15)'}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
                                ${esCtec ? '✓ SÍ' : '✕ NO'}
                            </button>
                        </td>

                        <td style="padding: 8px 6px; text-align: center;">
                            <button type="button" onclick="window.eliminarEmergencia('${key}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">
                                <span class="material-symbols-outlined" style="font-size: 0.95rem; vertical-align: middle;">delete</span>
                            </button>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
};

// ----------------------------------------------------------------------------
// INTERACCIÓN Y PERSISTENCIA
// ----------------------------------------------------------------------------
window.actualizarCampoOrden = async (idOrden, campo, valor) => {
    try {
        await dbPMS.child(semanaSeleccionada).child('ordenes').child(idOrden).child(campo).set(valor);
    } catch (err) {
        console.error('[PMS] Error al actualizar orden:', err);
    }
};

window.actualizarCampoEmergencia = async (idEmergencia, campo, valor) => {
    try {
        await dbPMS.child(semanaSeleccionada).child('actividades_emergentes').child(idEmergencia).child(campo).set(valor);
    } catch (err) {
        console.error('[PMS] Error al actualizar emergencia:', err);
    }
};

window.autoGuardarObservacion = (idOrden, valor) => {
    clearTimeout(debounceGuardado[idOrden]);
    debounceGuardado[idOrden] = setTimeout(() => {
        window.actualizarCampoOrden(idOrden, 'observacion', valor);
    }, 600);
};

window.filtrarOrdenesTexto = (txt) => {
    filtroTexto = txt;
    renderizarTablaOrdenes();
};

window.filtrarOrdenesEstado = (estado) => {
    filtroEstado = estado;
    renderizarTablaOrdenes();
};

window.eliminarEmergencia = async (key) => {
    if (confirm('¿Eliminar esta actividad emergente?')) {
        await dbPMS.child(semanaSeleccionada).child('actividades_emergentes').child(key).remove();
    }
};

window.eliminarRespaldoSemanaActual = async () => {
    if (confirm(`¿Estás seguro de eliminar completamente el respaldo ${semanaSeleccionada}? Esta acción no se puede deshacer.`)) {
        await dbPMS.child(semanaSeleccionada).remove();
        semanaSeleccionada = listaSemanasDisponibles.find((s) => s !== semanaSeleccionada) || 'PMS42';
        window.cambiarPeriodoPMS(semanaSeleccionada);
    }
};

window.procesarArchivoExcelPMS = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (jsonData.length === 0) {
                alert('El archivo Excel no contiene filas de datos.');
                return;
            }

            let semanaDetectada = 'PMS43';
            for (const fila of jsonData) {
                const fechaRaw = fila.Fecha || fila.FECHA || fila['Fecha inicio'] || fila['Fecha extrema'];
                if (fechaRaw) {
                    const parsedDate = new Date(fechaRaw);
                    if (!isNaN(parsedDate.getTime())) {
                        const numSemana = obtenerSemanaISO(parsedDate);
                        semanaDetectada = `PMS${numSemana}`;
                        break;
                    }
                }
            }

            const confirmarSemana = prompt(
                `📊 Archivo analizado (${jsonData.length} órdenes).\n` +
                `Semana detectada: ${semanaDetectada}.\n\n` +
                `Ingresa el identificador de semana a crear o actualizar:`,
                semanaDetectada
            );

            if (!confirmarSemana) return;

            const nuevaSemanaId = confirmarSemana.trim().toUpperCase();
            const nuevasOrdenes = {};

            jsonData.forEach((row, i) => {
                const idFila = `ORD_${String(row.Orden || row.OM || row['Nº orden'] || i + 1).replace(/\D/g, '')}`;
                nuevasOrdenes[idFila] = {
                    numero: String(row.Orden || row.OM || row['Nº orden'] || idFila),
                    fecha: String(row.Fecha || row.FECHA || new Date().toLocaleDateString()),
                    area: String(row.Area || row.Área || row['Ubicac.técnica']?.substring(0, 4) || 'General'),
                    equipo: String(row.Equipo || row.TAG || row.Denominación || 'Equipo General'),
                    tag: String(row.TAG || row.Tag || row.Equipo || 'SIN-TAG'),
                    actividad: String(row.Texto || row.Operación || row.Actividad || 'Inspección CBM'),
                    cruce: 'No Catastrado',
                    estadoReal: 'Ejecutado',
                    notifSap: true,
                    ctec: false,
                    adjuntos: 0,
                    observacion: ''
                };
            });

            await dbPMS.child(nuevaSemanaId).set({
                semana: nuevaSemanaId,
                fechaCarga: new Date().toISOString(),
                ordenes: nuevasOrdenes,
                actividades_emergentes: {}
            });

            alert(`✅ ¡Semana ${nuevaSemanaId} cargada con éxito!`);
            window.cambiarPeriodoPMS(nuevaSemanaId);
        } catch (err) {
            console.error('[PMS] Error procesando Excel:', err);
            alert('Error al leer el archivo Excel.');
        } finally {
            event.target.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
};

window.abrirModalNuevaEmergencia = () => {
    const tag = prompt('Ingrese el TAG del equipo con imprevisto (Ej: MH3323):');
    if (!tag) return;
    const desc = prompt('Descripción del imprevisto técnico:');
    if (!desc) return;
    const om = prompt('Número de OM provisional o aviso SAP (opcional):') || 'S/N';

    const nuevaRef = dbPMS.child(semanaSeleccionada).child('actividades_emergentes').push();
    nuevaRef.set({
        tag: tag.trim().toUpperCase(),
        descripcion: desc.trim(),
        om: om.trim(),
        fecha: new Date().toISOString().split('T')[0],
        turno: 'CPF',
        notifSap: false,
        ctec: false
    });
};

// ----------------------------------------------------------------------------
// REPORTE AUDITABLE PDF DIARIO (CENTRALIZADO CON PDF-PLANTILLA.JS)
// Nomenclatura solicitada: auditoria_Sxx_(dd-mm-aaaa).pdf
// ----------------------------------------------------------------------------
window.descargarReportePDF_PMS = async () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert('Cargando librería de PDF. Intente nuevamente en unos instantes.');
        return;
    }

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast('Generando reporte diario de auditoría PMS...', 'info');
    }

    const fechaActual = new Date();
    const fechaImpresion = formatearFechaNomenclatura(fechaActual);

    let semCodigo = String(semanaSeleccionada || 'PMS42').toUpperCase();
    semCodigo = semCodigo.replace('PMS', 'S');
    if (!semCodigo.startsWith('S')) semCodigo = `S${semCodigo}`;

    const nombreArchivoPDF = `auditoria_${semCodigo}_(${fechaImpresion}).pdf`;

    const ordenes = Object.values(datosSemanaActual.ordenes || {});
    const totalProgramadas = ordenes.length;
    let ejecutadas = 0;
    let notifSAP = 0;
    let ctecCerradas = 0;

    ordenes.forEach((o) => {
        const est = String(o.estadoReal || 'Ejecutado').toLowerCase();
        if (est === 'ejecutado') ejecutadas++;
        if (o.notifSap === true || String(o.notifSap) === 'true') notifSAP++;
        if (o.ctec === true || String(o.ctec) === 'true') ctecCerradas++;
    });

    const pendientes = totalProgramadas - ejecutadas;
    const pctCumplimiento = totalProgramadas > 0 ? Math.round((ejecutadas / totalProgramadas) * 100) : 0;
    const pctNotif = totalProgramadas > 0 ? Math.round((notifSAP / totalProgramadas) * 100) : 0;
    const pctCtec = totalProgramadas > 0 ? Math.round((ctecCerradas / totalProgramadas) * 100) : 0;

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    const margenX = 14;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);

    const dibujarCabecera = async () => {
        await dibujarCabeceraCorporativa(doc, {
            titulo: `AUDITORÍA DE PROGRAMA SEMANAL & TRAZABILIDAD CBM — ${semCodigo}`,
            subtitulo: 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda. | Respaldo Oficial Auditoría SAP PM',
            referencia: `Control Diario de Órdenes | Emisión: ${fechaImpresion} a las ${fechaActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            margenX
        });
    };

    // 1. Cabecera inicial corporativa
    await dibujarCabecera();

    // 2. BLOQUE DE TARJETAS KPIS
    let posY = 32;
    const anchoCard = (anchoContenido - (4 * 3.5)) / 5;
    const altoCard = 18;

    const listaKpisPDF = [
        {
            titulo: 'CUMPLIMIENTO TERRENO',
            valor: `${pctCumplimiento}%`,
            sub: `${ejecutadas} de ${totalProgramadas} OMs`,
            color: [22, 163, 74],
            bg: [240, 253, 244],
            border: [34, 197, 94]
        },
        {
            titulo: 'TOTAL PROGRAMADO',
            valor: `${totalProgramadas}`,
            sub: 'Órdenes de Trabajo',
            color: [2, 132, 199],
            bg: [240, 249, 255],
            border: [56, 189, 248]
        },
        {
            titulo: 'PENDIENTES MEDICIÓN',
            valor: `${pendientes}`,
            sub: pendientes === 0 ? 'Sin atrasos en ruta' : 'En proceso de ruta',
            color: [202, 138, 4],
            bg: [254, 252, 232],
            border: [234, 179, 8]
        },
        {
            titulo: 'NOTIFICADAS SAP (%)',
            valor: `${pctNotif}%`,
            sub: `${notifSAP} de ${totalProgramadas} OMs`,
            color: [147, 51, 234],
            bg: [250, 245, 255],
            border: [192, 132, 252]
        },
        {
            titulo: 'CIERRE TÉCNICO CTEC',
            valor: `${pctCtec}%`,
            sub: `${ctecCerradas} de ${totalProgramadas} cerradas`,
            color: [13, 148, 136],
            bg: [240, 253, 250],
            border: [45, 212, 191]
        }
    ];

    listaKpisPDF.forEach((k, idx) => {
        const xCard = margenX + (idx * (anchoCard + 3.5));

        doc.setFillColor(...k.bg);
        doc.setDrawColor(...k.border);
        doc.setLineWidth(0.4);
        doc.roundedRect(xCard, posY, anchoCard, altoCard, 2, 2, 'FD');

        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(k.titulo, xCard + (anchoCard / 2), posY + 4.5, { align: 'center' });

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...k.color);
        doc.text(k.valor, xCard + (anchoCard / 2), posY + 11.5, { align: 'center' });

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(k.sub, xCard + (anchoCard / 2), posY + 15.5, { align: 'center' });
    });

    posY += altoCard + 7;

    // 3. ENCABEZADO DE TABLA
    const colWidths = {
        num: 8,
        fecha: 22,
        area: 16,
        tag: 48,
        om: 22,
        estado: 26,
        notif: 18,
        ctec: 16,
        obs: 93
    };

    const dibujarEncabezadoTabla = (yTop) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margenX, yTop, anchoContenido, 7.5, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);

        let curX = margenX;
        doc.text('#', curX + 2, yTop + 5); curX += colWidths.num;
        doc.text('FECHA', curX + 2, yTop + 5); curX += colWidths.fecha;
        doc.text('ÁREA', curX + 2, yTop + 5); curX += colWidths.area;
        doc.text('TAG / EQUIPO', curX + 2, yTop + 5); curX += colWidths.tag;
        doc.text('OM', curX + 2, yTop + 5); curX += colWidths.om;
        doc.text('ESTADO REAL', curX + 2, yTop + 5); curX += colWidths.estado;
        doc.text('NOTIF. SAP', curX + 1, yTop + 5); curX += colWidths.notif;
        doc.text('CTEC', curX + 2, yTop + 5); curX += colWidths.ctec;
        doc.text('OBSERVACIÓN / JUSTIFICACIÓN', curX + 2, yTop + 5);
    };

    dibujarEncabezadoTabla(posY);
    posY += 7.5;

    // 4. FILAS CON ALTO DINÁMICO
    if (ordenes.length === 0) {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margenX, posY, anchoContenido, 12, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('No hay órdenes registradas en este periodo semanal.', margenX + 85, posY + 7.5);
    } else {
        for (let idx = 0; idx < ordenes.length; idx++) {
            const o = ordenes[idx];
            const fechaTxt = String(o.fecha || '-');
            const areaTxt = String(o.area || '-');
            const tagTxt = String(o.tag || o.equipo || '-');
            const omTxt = String(o.numero || '-');
            const estadoTxt = String(o.estadoReal || 'Ejecutado');
            const notifTxt = (o.notifSap === true || String(o.notifSap) === 'true') ? 'SÍ' : 'NO';
            const ctecTxt = (o.ctec === true || String(o.ctec) === 'true') ? 'SÍ' : 'NO';
            const obsTxt = String(o.observacion || '-').trim();

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            const lineasObs = doc.splitTextToSize(obsTxt, colWidths.obs - 4);
            const lineasTag = doc.splitTextToSize(tagTxt, colWidths.tag - 4);

            const cantLineasMax = Math.max(lineasObs.length, lineasTag.length, 1);
            const altoFila = Math.max(7.5, (cantLineasMax * 4.2) + 3.2);

            if (posY + altoFila > altoPagina - 16) {
                doc.addPage();
                await dibujarCabecera();
                posY = 32;
                dibujarEncabezadoTabla(posY);
                posY += 7.5;
            }

            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margenX, posY, anchoContenido, altoFila, 'F');
            }

            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(margenX, posY + altoFila, margenX + anchoContenido, posY + altoFila);

            let xPos = margenX;

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(String(idx + 1), xPos + 2, posY + 5);
            xPos += colWidths.num;

            doc.setTextColor(51, 65, 85);
            doc.setFont('helvetica', 'normal');
            doc.text(fechaTxt, xPos + 2, posY + 5);
            xPos += colWidths.fecha;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(2, 132, 199);
            doc.text(areaTxt, xPos + 2, posY + 5);
            xPos += colWidths.area;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(lineasTag, xPos + 2, posY + 5);
            xPos += colWidths.tag;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text(omTxt, xPos + 2, posY + 5);
            xPos += colWidths.om;

            let colEstado = [22, 163, 74];
            if (estadoTxt.toLowerCase().includes('pendiente')) colEstado = [202, 138, 4];
            if (estadoTxt.toLowerCase().includes('no ejecutado')) colEstado = [220, 38, 38];

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colEstado);
            doc.text(estadoTxt, xPos + 2, posY + 5);
            xPos += colWidths.estado;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(notifTxt === 'SÍ' ? 22 : 153, notifTxt === 'SÍ' ? 163 : 27, notifTxt === 'SÍ' ? 74 : 27);
            doc.text(notifTxt, xPos + 6, posY + 5);
            xPos += colWidths.notif;

            doc.setTextColor(ctecTxt === 'SÍ' ? 13 : 100, ctecTxt === 'SÍ' ? 148 : 116, ctecTxt === 'SÍ' ? 136 : 139);
            doc.text(ctecTxt, xPos + 4, posY + 5);
            xPos += colWidths.ctec;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text(lineasObs, xPos + 2, posY + 5);

            posY += altoFila;
        }
    }

    // 5. PIE DE PÁGINA CORPORATIVO REUTILIZABLE
    dibujarPiePaginaCorporativo(doc, {
        fechaImpresion,
        textoCentro: `Documento de Control Diario | Fecha: ${fechaImpresion}`,
        margenX
    });

    doc.save(nombreArchivoPDF);

    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast(`✅ PDF emitido: ${nombreArchivoPDF}`, 'exito');
    }
};

export default {
    renderizarModuloPMS
};