// ==========================================
// MÓDULO UI: PROGRAMA SEMANAL (PMS), AUDITORÍA SAP PM Y ACTIVIDADES EMERGENTES
// ==========================================
import { db } from '../core/firebase-config.js';
import { renderizarExpediente } from './expediente.js';

function obtenerSemanaPMSActual() {
    const fecha = new Date();
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `PMS${weekNo}`;
}

function normalizarIdTag(tagRaw) {
    if (!tagRaw) return '';
    return String(tagRaw).trim().toUpperCase().replace(/\s+/g, '_');
}

function formatearFechaExcel(valFecha) {
    if (!valFecha) return '';
    const num = Number(valFecha);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        const d = new Date(Math.round((num - (25567 + 2)) * 86400 * 1000));
        const dia = String(d.getUTCDate()).padStart(2, '0');
        const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
        const anio = d.getUTCFullYear();
        return `${dia}/${mes}/${anio}`;
    }
    return String(valFecha).split('T')[0];
}

export async function renderizarModuloPMS(contenedorId = 'espacio-trabajo-dinamico', semanaSeleccionada = null) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const semanaActiva = semanaSeleccionada || obtenerSemanaPMSActual();

    contenedor.innerHTML = `
        <div style="padding: 60px; text-align: center; color: var(--primary-blue);">
            <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 40px;">autorenew</span>
            <p style="margin-top: 10px; color: var(--text-muted);">Cargando Auditoría SAP y Actividades Emergentes...</p>
        </div>
    `;

    try {
        const [snapActivos, snapPMS, snapHistorialGlobal] = await Promise.all([
            db.ref('activos_criticos').once('value'),
            db.ref(`historial_informes/pms_semanal/${semanaActiva}`).once('value'),
            db.ref('historial_informes/pms_semanal').once('value')
        ]);

        const activosMap = snapActivos.exists() ? snapActivos.val() : {};
        const pmsData = snapPMS.exists() ? snapPMS.val() : null;
        const ordenes = pmsData && pmsData.ordenes ? Object.values(pmsData.ordenes) : [];
        const emergentesMap = pmsData && pmsData.actividades_emergentes ? pmsData.actividades_emergentes : {};
        const listaEmergentes = Object.values(emergentesMap);

        const semanasGuardadas = snapHistorialGlobal.exists() ? Object.keys(snapHistorialGlobal.val()).sort().reverse() : [semanaActiva];
        if (!semanasGuardadas.includes(semanaActiva)) semanasGuardadas.unshift(semanaActiva);

        const total = ordenes.length;
        const ejecutadas = ordenes.filter(o => o.estadoEjecucion === 'EJECUTADO').length;
        const pendientes = ordenes.filter(o => o.estadoEjecucion === 'PENDIENTE').length;
        const notificadasCount = ordenes.filter(o => o.notificadaSAP === 'SI').length;
        const tecoCount = ordenes.filter(o => o.tecoSAP === 'SI').length;

        const porcCumplimiento = total > 0 ? Math.round((ejecutadas / total) * 100) : 0;
        const porcNotif = total > 0 ? Math.round((notificadasCount / total) * 100) : 0;
        const porcTeco = total > 0 ? Math.round((tecoCount / total) * 100) : 0;

        let colorCumplimiento = '#38bdf8';
        if (total > 0) {
            if (porcCumplimiento >= 85) colorCumplimiento = '#10b981';
            else if (porcCumplimiento >= 60) colorCumplimiento = '#f59e0b';
            else colorCumplimiento = '#ef4444';
        }

        let optionsSemanasHTML = '';
        semanasGuardadas.forEach(sem => {
            optionsSemanasHTML += `<option value="${sem}" ${sem === semanaActiva ? 'selected' : ''}>Respaldo: ${sem}</option>`;
        });

        contenedor.innerHTML = `
            <div class="panel-industrial" style="animation: fadeIn 0.3s ease; padding: 20px; display: flex; flex-direction: column; gap: 14px; height: calc(100vh - 90px); box-sizing: border-box; overflow-y: auto;">
                
                <!-- CABECERA DEL MÓDULO -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.75); padding: 14px 20px; border-radius: 12px; border: 1px solid var(--border-glass); flex-wrap: wrap; gap: 12px; flex-shrink: 0;">
                    <div>
                        <h2 style="color: white; font-size: 1.3rem; margin: 0 0 2px 0; display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="color: #34d399; font-size: 1.6rem;">calendar_month</span>
                            Auditoría de Programa Semanal (PMS) & Emergencias
                        </h2>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.78rem;">
                            Respaldos SAP, notificaciones, CTEC y actividades imprevistas independientes
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-input); padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border-glass);">
                            <label style="font-size: 0.72rem; color: #38bdf8; font-weight: 600;">PERIODO:</label>
                            <select id="select-semana-historica" style="background: transparent; border: none; color: white; font-family: inherit; font-size: 0.82rem; font-weight: 700; outline: none; cursor: pointer;">
                                ${optionsSemanasHTML}
                            </select>
                        </div>

                        <button type="button" id="btn-exportar-pdf-pms" class="btn-topbar" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-weight: 700; padding: 6px 12px; font-size: 0.8rem;" title="Generar Informe PDF Corporativo Legible">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">picture_as_pdf</span> Descargar PDF
                        </button>

                        <input type="file" id="input-excel-pms" accept=".xlsx,.xls,.csv" style="display: none;">
                        <button type="button" id="btn-importar-excel-pms" class="btn-topbar" style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 700; padding: 6px 12px; font-size: 0.8rem;" title="Importar EXPORT.XLSX de SAP sin perder tus emergencias">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">upload_file</span> Subir EXPORT.XLSX
                        </button>

                        <button type="button" id="btn-volver-dashboard" class="btn-topbar" style="background: rgba(255, 255, 255, 0.06); color: var(--text-main); border: 1px solid var(--border-glass); padding: 6px 12px; font-size: 0.8rem;">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">map</span> Mapa
                        </button>
                    </div>
                </div>

                <!-- 5 TARJETAS KPI -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; flex-shrink: 0;">
                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-glass); border-left: 4px solid ${colorCumplimiento}; padding: 12px 14px; border-radius: 10px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Cumplimiento Terreno</span>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
                            <strong id="kpi-porc-cumplimiento" style="font-size: 1.4rem; color: ${colorCumplimiento};">${porcCumplimiento}%</strong>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">${ejecutadas}/${total}</span>
                        </div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-glass); border-left: 4px solid #38bdf8; padding: 12px 14px; border-radius: 10px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Total Programado</span>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
                            <strong style="font-size: 1.4rem; color: white;">${total}</strong>
                            <span style="font-size: 0.7rem; color: #38bdf8;">OMs</span>
                        </div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-glass); border-left: 4px solid #eab308; padding: 12px 14px; border-radius: 10px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Pendientes Medición</span>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
                            <strong id="kpi-pendientes" style="font-size: 1.4rem; color: #eab308;">${pendientes}</strong>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">En ruta</span>
                        </div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-glass); border-left: 4px solid #a855f7; padding: 12px 14px; border-radius: 10px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Notificadas SAP (%)</span>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
                            <strong id="kpi-porc-notif" style="font-size: 1.4rem; color: #a855f7;">${porcNotif}%</strong>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">${notificadasCount}/${total}</span>
                        </div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-glass); border-left: 4px solid #10b981; padding: 12px 14px; border-radius: 10px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Cierre CTEC (%)</span>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
                            <strong id="kpi-porc-teco" style="font-size: 1.4rem; color: #10b981;">${porcTeco}%</strong>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">${tecoCount}/${total}</span>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN DE ACTIVIDADES EMERGENTES -->
                <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid var(--border-glass); border-left: 4px solid #f87171; padding: 14px 18px; border-radius: 10px; flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h3 style="margin: 0; color: #f87171; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                            ⚡ Actividades Emergentes / Imprevistos en Terreno (${listaEmergentes.length})
                        </h3>
                        <button type="button" id="btn-abrir-modal-emergente" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 0.95rem;">add</span> Registrar Emergencia
                        </button>
                    </div>
                    <div id="contenedor-tabla-emergentes-pms" style="max-height: 180px; overflow-y: auto;">
                        ${renderizarTablaEmergentesMini(listaEmergentes, semanaActiva)}
                    </div>
                </div>

                <!-- BARRA DE FILTROS -->
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; background: rgba(15, 23, 42, 0.5); padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border-glass); flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1;">
                        <span class="material-symbols-outlined" style="color: var(--text-muted); font-size: 1.1rem;">filter_alt</span>
                        <input type="text" id="filtro-texto-pms" placeholder="Filtrar por OM, Equipo, Ubicación..." style="background: var(--bg-input); border: 1px solid var(--border-glass); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; width: 280px; outline: none;">
                        
                        <select id="filtro-estado-pms" style="background: var(--bg-input); border: 1px solid var(--border-glass); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; outline: none; cursor: pointer;">
                            <option value="TODOS">Todos los Estados</option>
                            <option value="PENDIENTE">⏳ Pendientes</option>
                            <option value="EJECUTADO">✅ Ejecutados</option>
                            <option value="DETENIDO_OPS">🛑 Detenido Operaciones</option>
                            <option value="SIN_ACCESO">🚧 Sin Acceso</option>
                            <option value="REPROGRAMADO">📅 Reprogramados</option>
                        </select>
                    </div>

                    ${total > 0 ? `
                        <button type="button" id="btn-limpiar-pms" style="background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 0.95rem;">lock_reset</span> Borrar Respaldo ${semanaActiva}
                        </button>
                    ` : ''}
                </div>

                <!-- CONTENEDOR DE LA TABLA PRINCIPAL PMS -->
                <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--border-glass); border-radius: 12px; overflow: hidden; flex-grow: 1; display: flex; flex-direction: column;">
                    ${ renderizarContenidoTablaPMS(ordenes, activosMap) }
                </div>
            </div>

            <!-- MODAL CREAR EMERGENCIA -->
            <div id="modal-crear-emergencia" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 999999; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
                <div style="background: #0f172a; border: 1px solid var(--border-glass); width: 90%; max-width: 480px; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.7);">
                    <div style="padding: 16px 20px; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: white; font-size: 1rem; display: flex; align-items: center; gap: 6px;">⚡ Registrar Actividad Emergente</h3>
                        <button type="button" id="btn-cerrar-modal-em" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; font-weight: bold;">✕</button>
                    </div>
                    <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Fecha de la Actividad / Hallazgo</label>
                            <input type="date" id="em-fecha" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">TAG Equipo</label>
                            <input type="text" id="em-tag" placeholder="Ej: MH2013" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Descripción del Trabajo / Hallazgo</label>
                            <textarea id="em-desc" rows="3" placeholder="Detalle de la actividad imprevista..." style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; box-sizing: border-box; resize: none;"></textarea>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">N° OM o Aviso (Opcional)</label>
                            <input type="text" id="em-om" placeholder="Ej: 31568316" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Turno / Responsable</label>
                            <input type="text" id="em-turno" placeholder="Ej: Turno A / Elecmon" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; box-sizing: border-box;">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Notificado SAP</label>
                                <select id="em-notif" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                                    <option value="NO">❌ NO</option>
                                    <option value="SI">✔ SÍ</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Cierre CTEC</label>
                                <select id="em-teco" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                                    <option value="NO">❌ NO</option>
                                    <option value="SI">✔ SÍ</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 12px 20px; background: rgba(15, 23, 42, 0.95); border-top: 1px solid var(--border-glass); display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" id="btn-cancelar-modal-em" style="background: #334155; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">Cancelar</button>
                        <button type="button" id="btn-guardar-emergencia" style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">Guardar Emergencia</button>
                    </div>
                </div>
            </div>
        `;

        // ==========================================
        // CONFIGURACIÓN DE EVENTOS
        // ==========================================
        const selectSemanaHist = document.getElementById('select-semana-historica');
        if (selectSemanaHist) {
            selectSemanaHist.addEventListener('change', (e) => {
                if (e.target.value) renderizarModuloPMS(contenedorId, e.target.value);
            });
        }

        const modalEm = document.getElementById('modal-crear-emergencia');
        document.getElementById('btn-abrir-modal-emergente')?.addEventListener('click', () => { if (modalEm) modalEm.style.display = 'flex'; });
        document.getElementById('btn-cerrar-modal-em')?.addEventListener('click', () => { if (modalEm) modalEm.style.display = 'none'; });
        document.getElementById('btn-cancelar-modal-em')?.addEventListener('click', () => { if (modalEm) modalEm.style.display = 'none'; });

        document.getElementById('btn-guardar-emergencia')?.addEventListener('click', async () => {
            const fechaInput = document.getElementById('em-fecha').value;
            const tag = document.getElementById('em-tag').value.trim();
            const descripcion = document.getElementById('em-desc').value.trim();
            const om = document.getElementById('em-om').value.trim();
            const turno = document.getElementById('em-turno').value.trim();
            const notificadaSAP = document.getElementById('em-notif').value;
            const tecoSAP = document.getElementById('em-teco').value;

            if (!tag || !descripcion || !fechaInput) {
                if (window.UI && UI.mostrarToast) UI.mostrarToast("Debe ingresar Fecha, TAG y Descripción.", "error");
                else alert("Debe ingresar Fecha, TAG y Descripción.");
                return;
            }

            const idKey = 'EMG-' + Date.now();
            const payload = {
                idKey,
                fecha: fechaInput,
                tag,
                descripcion,
                om: om || 'S/N',
                turno: turno || 'General',
                estadoEjecucion: notificadaSAP === 'SI' ? 'EJECUTADO' : 'PENDIENTE',
                notificadaSAP,
                tecoSAP,
                observacionAuditor: 'Actividad emergente en terreno',
                fechaCreacion: new Date().toISOString()
            };

            try {
                await db.ref(`historial_informes/pms_semanal/${semanaActiva}/actividades_emergentes/${idKey}`).set(payload);
                if (modalEm) modalEm.style.display = 'none';
                document.getElementById('em-tag').value = '';
                document.getElementById('em-desc').value = '';
                document.getElementById('em-om').value = '';
                document.getElementById('em-turno').value = '';
                if (window.UI && UI.mostrarToast) UI.mostrarToast("⚡ Emergencia registrada correctamente", "exito");
                renderizarModuloPMS(contenedorId, semanaActiva);
            } catch (err) {
                console.error("Error guardando emergencia:", err);
            }
        });

        // AUTOGUARDADO EN TIEMPO REAL PARA EMERGENTES
        contenedor.querySelectorAll('.select-notif-em, .select-teco-em').forEach(elemento => {
            elemento.addEventListener('change', async (e) => {
                const fila = e.target.closest('.fila-emergente-pms');
                if (!fila) return;
                const emKey = fila.getAttribute('data-key');
                const notifVal = fila.querySelector('.select-notif-em').value;
                const tecoVal = fila.querySelector('.select-teco-em').value;

                try {
                    await db.ref(`historial_informes/pms_semanal/${semanaActiva}/actividades_emergentes/${emKey}`).update({
                        notificadaSAP: notifVal,
                        tecoSAP: tecoVal,
                        estadoEjecucion: notifVal === 'SI' ? 'EJECUTADO' : 'PENDIENTE',
                        ultimaActualizacion: new Date().toISOString()
                    });
                    if (window.UI && UI.mostrarToast) UI.mostrarToast("💾 Emergencia actualizada", "exito");
                } catch (err) {
                    console.error("Error actualizando emergencia:", err);
                }
            });
        });

        // Botón Exportar a PDF Legible con jsPDF & autoTable
        const btnExportPDF = document.getElementById('btn-exportar-pdf-pms');
        if (btnExportPDF) {
            btnExportPDF.addEventListener('click', () => {
                const filas = contenedor.querySelectorAll('.fila-orden-pms');
                filas.forEach(fila => {
                    const ordenKey = fila.getAttribute('data-key');
                    const ordenObj = ordenes.find(o => o.idKey === ordenKey);
                    if (ordenObj) {
                        ordenObj.estadoEjecucion = fila.querySelector('.select-estado-pms').value;
                        ordenObj.notificadaSAP = fila.querySelector('.select-notif-pms').value;
                        ordenObj.tecoSAP = fila.querySelector('.select-teco-pms').value;
                        ordenObj.observacionAuditor = fila.querySelector('.input-obs-pms').value.trim();
                    }
                });

                exportarPDFLegibleCorp(semanaActiva, ordenes, listaEmergentes, { porcCumplimiento, total, ejecutadas, pendientes, porcNotif, notificadasCount, porcTeco, tecoCount });
            });
        }

        const inputExcel = document.getElementById('input-excel-pms');
        const btnImportar = document.getElementById('btn-importar-excel-pms');
        const btnZonaDrop = document.getElementById('btn-zona-drop-pms');

        if (btnImportar && inputExcel) btnImportar.addEventListener('click', () => inputExcel.click());
        if (btnZonaDrop && inputExcel) btnZonaDrop.addEventListener('click', () => inputExcel.click());

        if (inputExcel) {
            inputExcel.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                await procesarArchivoExcelSAP(file, semanaActiva, activosMap, contenedorId);
            });
        }

        const inputFiltroTexto = document.getElementById('filtro-texto-pms');
        const selectFiltroEstado = document.getElementById('filtro-estado-pms');

        const aplicarFiltros = () => {
            const texto = (inputFiltroTexto?.value || '').toLowerCase().trim();
            const estado = selectFiltroEstado?.value || 'TODOS';

            document.querySelectorAll('.fila-orden-pms').forEach(fila => {
                const contenidoFila = (fila.getAttribute('data-search') || '').toLowerCase();
                const estadoFila = fila.getAttribute('data-estado') || '';
                const coincideTexto = !texto || contenidoFila.includes(texto);
                const coincideEstado = estado === 'TODOS' || estadoFila === estado;
                fila.style.display = (coincideTexto && coincideEstado) ? '' : 'none';
            });
        };

        if (inputFiltroTexto) inputFiltroTexto.addEventListener('input', aplicarFiltros);
        if (selectFiltroEstado) selectFiltroEstado.addEventListener('change', aplicarFiltros);

        // AUTOGUARDADO EN TIEMPO REAL
        contenedor.querySelectorAll('.select-estado-pms, .select-notif-pms, .select-teco-pms, .input-obs-pms').forEach(elemento => {
            const eventoTrigger = elemento.tagName === 'SELECT' ? 'change' : 'blur';

            elemento.addEventListener(eventoTrigger, async (e) => {
                const fila = e.target.closest('.fila-orden-pms');
                if (!fila) return;

                const ordenKey = fila.getAttribute('data-key');
                const nuevoEstado = fila.querySelector('.select-estado-pms').value;
                const notificada = fila.querySelector('.select-notif-pms').value;
                const teco = fila.querySelector('.select-teco-pms').value;
                const nuevaObs = fila.querySelector('.input-obs-pms').value.trim();

                fila.setAttribute('data-estado', nuevoEstado);

                try {
                    await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                        estadoEjecucion: nuevoEstado,
                        notificadaSAP: notificada,
                        tecoSAP: teco,
                        observacionAuditor: nuevaObs,
                        ultimaActualizacion: new Date().toISOString()
                    });

                    if (window.UI && UI.mostrarToast) {
                        UI.mostrarToast("💾 Respaldo actualizado en la nube", "exito");
                    }
                    actualizarKPIsEnVivo(contenedor);
                } catch (err) {
                    console.error("Error en autoguardado:", err);
                    if (window.UI && UI.mostrarToast) UI.mostrarToast("Error al sincronizar", "error");
                }
            });
        });

        contenedor.querySelectorAll('.btn-ir-expediente-pms').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idFirebase = e.currentTarget.getAttribute('data-target');
                if (idFirebase) renderizarExpediente(idFirebase, contenedorId);
            });
        });

        // REINICIO / BORRADO SEGURO CON MODAL CORPORATIVO (Sin usar confirm() nativo)
        const btnLimpiar = document.getElementById('btn-limpiar-pms');
        if (btnLimpiar) {
            btnLimpiar.addEventListener('click', async () => {
                const modalSeguridadId = 'modal-seguridad-reinicio-pms';
                let modalSeg = document.getElementById(modalSeguridadId);
                if (modalSeg) modalSeg.remove();

                modalSeg = document.createElement('div');
                modalSeg.id = modalSeguridadId;
                modalSeg.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: sans-serif;";
                
                modalSeg.innerHTML = `
                    <div style="background: #0f172a; border: 1px solid #ef4444; border-radius: 12px; width: 450px; max-width: 90%; padding: 25px; color: #f8fafc; box-shadow: 0 25px 50px rgba(0,0,0,0.8);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                            <span class="material-symbols-outlined" style="color: #ef4444; font-size: 32px;">warning</span>
                            <h3 style="margin: 0; color: #f8fafc; font-size: 1.1rem;">⚠️ Eliminar Respaldo ${semanaActiva}</h3>
                        </div>
                        <p style="color: #94a3b8; font-size: 0.88rem; line-height: 1.5; margin-bottom: 20px;">
                            Estás a punto de borrar el respaldo de esta semana. Escribe <b style="color: #ef4444;">BORRAR</b> para confirmar:
                        </p>
                        <input type="text" id="input-confirmar-borrar" placeholder="Escribe BORRAR aquí..." style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: white; font-size: 0.9rem; outline: none; box-sizing: border-box; margin-bottom: 20px; text-align: center; font-weight: bold; letter-spacing: 1px;">
                        
                        <div style="display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" id="btn-cancelar-reinicio" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">Cancelar</button>
                            <button type="button" id="btn-ejecutar-reinicio" disabled style="background: #475569; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; cursor: not-allowed; font-weight: bold; font-size: 0.85rem;">Sí, Eliminar Respaldo</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modalSeg);

                const inputConf = document.getElementById('input-confirmar-borrar');
                const btnEjecutar = document.getElementById('btn-ejecutar-reinicio');

                inputConf.addEventListener('input', (ev) => {
                    if (ev.target.value.trim() === 'BORRAR') {
                        btnEjecutar.disabled = false;
                        btnEjecutar.style.background = '#ef4444';
                        btnEjecutar.style.color = 'white';
                        btnEjecutar.style.cursor = 'pointer';
                    } else {
                        btnEjecutar.disabled = true;
                        btnEjecutar.style.background = '#475569';
                        btnEjecutar.style.color = '#94a3b8';
                        btnEjecutar.style.cursor = 'not-allowed';
                    }
                });

                document.getElementById('btn-cancelar-reinicio').addEventListener('click', () => modalSeg.remove());
                btnEjecutar.addEventListener('click', async () => {
                    await db.ref(`historial_informes/pms_semanal/${semanaActiva}`).remove();
                    if (window.UI && UI.mostrarToast) UI.mostrarToast("Respaldo eliminado.", "exito");
                    modalSeg.remove();
                    renderizarModuloPMS(contenedorId);
                });
            });
        }

    } catch (error) {
        console.error("Error cargando módulo PMS:", error);
        contenedor.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error al cargar: ${error.message}</div>`;
    }
}

function renderizarTablaEmergentesMini(lista, semanaActiva) {
    if (!lista || lista.length === 0) {
        return `<p style="color: var(--text-muted); font-size: 0.8rem; margin: 0; font-style: italic;">No hay actividades emergentes registradas para este periodo.</p>`;
    }

    let rows = '';
    lista.forEach((em) => {
        const fechaFormateada = formatearFechaExcel(em.fecha) || em.fecha || '-';
        const notif = em.notificadaSAP || 'NO';
        const teco = em.tecoSAP || 'NO';

        rows += `
            <tr class="fila-emergente-pms" data-key="${em.idKey}" style="border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.78rem;">
                <td style="padding: 6px 8px; color: #cbd5e1; font-weight: 600; white-space: nowrap;">${fechaFormateada}</td>
                <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: #f87171;">${em.tag}</td>
                <td style="padding: 6px 8px; color: #e2e8f0;">${em.descripcion}</td>
                <td style="padding: 6px 8px; color: #cbd5e1; font-family: monospace;">${em.om}</td>
                <td style="padding: 6px 8px; color: #cbd5e1;">${em.turno}</td>
                <td style="padding: 6px 8px; text-align: center;">
                    <select class="select-notif-em" style="background: var(--bg-input); color: ${notif === 'SI' ? '#a855f7' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 3px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; outline: none; cursor: pointer;">
                        <option value="NO" ${notif === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${notif === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                    <select class="select-teco-em" style="background: var(--bg-input); color: teco === 'SI' ? '#10b981' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 3px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; outline: none; cursor: pointer;">
                        <option value="NO" ${teco === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${teco === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                    <button type="button" onclick="window.eliminarEmergentePMS('${em.idKey}', '${semanaActiva}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.7rem;">Eliminar</button>
                </td>
            </tr>
        `;
    });

    return `
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="color: #94a3b8; font-size: 0.7rem; border-bottom: 1px solid var(--border-glass);">
                    <th style="padding: 6px 8px;">Fecha</th>
                    <th style="padding: 6px 8px;">TAG</th>
                    <th style="padding: 6px 8px;">Descripción del Imprevisto</th>
                    <th style="padding: 6px 8px;">OM</th>
                    <th style="padding: 6px 8px;">Turno</th>
                    <th style="padding: 6px 8px; text-align: center;">Notif. SAP</th>
                    <th style="padding: 6px 8px; text-align: center;">CTEC</th>
                    <th style="padding: 6px 8px; text-align: center;">Acción</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.eliminarEmergentePMS = async function(idKey, semanaActiva) {
    // MODAL CORPORATIVO DE CONFIRMACIÓN (En lugar de confirm() nativo)
    const modalId = 'modal-confirm-borrar-emg';
    let modalC = document.getElementById(modalId);
    if (modalC) modalC.remove();

    modalC = document.createElement('div');
    modalC.id = modalId;
    modalC.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: sans-serif;";
    
    modalC.innerHTML = `
        <div style="background: #0f172a; border: 1px solid var(--border-glass); border-radius: 12px; width: 400px; max-width: 90%; padding: 25px; color: #f8fafc; box-shadow: 0 25px 50px rgba(0,0,0,0.8);">
            <h3 style="margin: 0 0 10px 0; color: #f87171; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-outlined">warning</span> Eliminar Actividad
            </h3>
            <p style="color: #94a3b8; font-size: 0.88rem; margin-bottom: 20px;">¿Estás seguro de eliminar esta actividad emergente del registro?</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" id="btn-no-emg" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancelar</button>
                <button type="button" id="btn-si-emg" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">Sí, Eliminar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalC);

    document.getElementById('btn-no-emg').addEventListener('click', () => modalC.remove());
    document.getElementById('btn-si-emg').addEventListener('click', async () => {
        await db.ref(`historial_informes/pms_semanal/${semanaActiva}/actividades_emergentes/${idKey}`).remove();
        if (window.UI && UI.mostrarToast) UI.mostrarToast("Actividad emergente eliminada.", "exito");
        modalC.remove();
        renderizarModuloPMS(undefined, semanaActiva);
    });
};

function actualizarKPIsEnVivo(contenedor) {
    const filas = contenedor.querySelectorAll('.fila-orden-pms');
    const total = filas.length;
    let ejecutadas = 0;
    let pendientes = 0;
    let notificadas = 0;
    let teco = 0;

    filas.forEach(f => {
        const est = f.querySelector('.select-estado-pms').value;
        const notifVal = f.querySelector('.select-notif-pms').value;
        const tecoVal = f.querySelector('.select-teco-pms').value;

        if (est === 'EJECUTADO') ejecutadas++;
        else if (est === 'PENDIENTE') pendientes++;
        
        if (notifVal === 'SI') notificadas++;
        if (tecoVal === 'SI') teco++;
    });

    const porcCumplimiento = total > 0 ? Math.round((ejecutadas / total) * 100) : 0;
    const porcNotif = total > 0 ? Math.round((notificadas / total) * 100) : 0;
    const porcTeco = total > 0 ? Math.round((teco / total) * 100) : 0;

    const elCumplimiento = contenedor.querySelector('#kpi-porc-cumplimiento');
    const elPendientes = contenedor.querySelector('#kpi-pendientes');
    const elNotif = contenedor.querySelector('#kpi-porc-notif');
    const elTeco = contenedor.querySelector('#kpi-porc-teco');

    if (elCumplimiento) elCumplimiento.textContent = `${porcCumplimiento}%`;
    if (elPendientes) elPendientes.textContent = pendientes;
    if (elNotif) elNotif.textContent = `${porcNotif}%`;
    if (elTeco) elTeco.textContent = `${porcTeco}%`;
}

function renderizarContenidoTablaPMS(ordenes, activosMap) {
    if (!ordenes || ordenes.length === 0) {
        return `
            <div id="btn-zona-drop-pms" style="padding: 60px 20px; text-align: center; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(56, 189, 248, 0.04)'" onmouseout="this.style.background='transparent'">
                <span class="material-symbols-outlined" style="font-size: 56px; color: #34d399; margin-bottom: 10px;">upload_file</span>
                <h3 style="color: white; margin: 0 0 8px 0; font-size: 1.15rem;">Sube tu archivo EXPORT.XLSX de SAP</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 520px; margin: 0 auto 18px auto; line-height: 1.5;">
                    El sistema detectará automáticamente las OMs, equipos, notificaciones, CTEC y adjuntos, guardando el respaldo.
                </p>
                <span style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 8px 16px; border-radius: 6px; font-size: 0.82rem; font-weight: 600;">
                    <span class="material-symbols-outlined" style="font-size: 1rem;">add_chart</span> Seleccionar EXPORT.XLSX
                </span>
            </div>
        `;
    }

    let filasHTML = '';
    ordenes.forEach((item, idx) => {
        const tagKey = normalizarIdTag(item.tag);
        const activoFirebase = activosMap[tagKey] || null;
        const existeEnCatastro = Boolean(activoFirebase);

        const sev = existeEnCatastro ? (activoFirebase.severidad || activoFirebase.estado || 'verde').toLowerCase() : 'sin_catastro';
        let badgeCatastro = `<span style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">No Catastrado</span>`;
        if (existeEnCatastro) {
            let colorSev = '#10b981';
            let textoSev = 'Zona A/B';
            if (sev === 'rojo' || sev === 'critico') { colorSev = '#ef4444'; textoSev = 'Crítico (D)'; }
            else if (sev === 'naranja' || sev === 'amarillo') { colorSev = '#f97316'; textoSev = 'Alerta (C)'; }

            badgeCatastro = `
                <button type="button" class="btn-ir-expediente-pms" data-target="${tagKey}" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; font-weight: 600;" title="Abrir Expediente">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${colorSev}; display: inline-block;"></span>
                    ${textoSev} ↗
                </button>
            `;
        }

        const est = item.estadoEjecucion || 'PENDIENTE';
        const notif = item.notificadaSAP || 'NO';
        const teco = item.tecoSAP || 'NO';
        const cantAdjuntos = item.adjuntosSAP || 0;
        const fechaFormateada = formatearFechaExcel(item.fechaProg);
        const searchString = `${item.orden} ${item.tag} ${item.descripcion} ${item.ubicacionTecnica || ''} ${fechaFormateada} ${item.observacionAuditor || ''}`;

        filasHTML += `
            <tr class="fila-orden-pms" data-key="${item.idKey}" data-estado="${est}" data-search="${searchString}" style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.8rem;">
                <td style="padding: 10px 12px; color: var(--text-muted); font-weight: 600;">${idx + 1}</td>
                <td style="padding: 10px 12px; color: #cbd5e1; font-weight: 600;">${fechaFormateada}</td>
                <td style="padding: 10px 12px; color: #94a3b8; font-weight: 700;">${item.area || ''}</td>
                <td style="padding: 10px 12px;">
                    <div style="font-weight: 700; color: #38bdf8; font-family: monospace;">${item.tag}</div>
                    <div style="font-size: 0.68rem; color: var(--text-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis;" title="${item.ubicacionTecnica}">${item.ubicacionTecnica || ''}</div>
                </td>
                <td style="padding: 10px 12px; color: #f8fafc; font-weight: 700; font-family: monospace;">${item.orden}</td>
                <td style="padding: 10px 12px;">${badgeCatastro}</td>
                <td style="padding: 10px 12px; color: #cbd5e1; max-width: 200px;" title="${item.descripcion}">${item.descripcion}</td>
                
                <td style="padding: 10px 12px;">
                    <select class="select-estado-pms" style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 5px 6px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; width: 100%;">
                        <option value="PENDIENTE" ${est === 'PENDIENTE' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="EJECUTADO" ${est === 'EJECUTADO' ? 'selected' : ''}>✅ Ejecutado</option>
                        <option value="DETENIDO_OPS" ${est === 'DETENIDO_OPS' ? 'selected' : ''}>🛑 Detenido Ops</option>
                        <option value="SIN_ACCESO" ${est === 'SIN_ACCESO' ? 'selected' : ''}>🚧 Sin Acceso</option>
                        <option value="REPROGRAMADO" ${est === 'REPROGRAMADO' ? 'selected' : ''}>📅 Reprogramado</option>
                    </select>
                </td>

                <td style="padding: 10px 12px; text-align: center;">
                    <select class="select-notif-pms" style="background: var(--bg-input); color: ${notif === 'SI' ? '#a855f7' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 5px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: bold;">
                        <option value="NO" ${notif === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${notif === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>

                <td style="padding: 10px 12px; text-align: center;">
                    <select class="select-teco-pms" style="background: var(--bg-input); color: ${teco === 'SI' ? '#10b981' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 5px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: bold;">
                        <option value="NO" ${teco === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${teco === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>

                <td style="padding: 10px 12px; text-align: center; color: ${cantAdjuntos > 0 ? '#38bdf8' : 'var(--text-muted)'}; font-weight: bold; font-size: 0.8rem;" title="Archivos adjuntos en SAP">
                    📎 ${cantAdjuntos}
                </td>

                <td style="padding: 10px 12px;">
                    <input type="text" class="input-obs-pms" value="${item.observacionAuditor || ''}" placeholder="Motivo o nota..." style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 5px 8px; border-radius: 6px; font-size: 0.75rem; width: 100%; outline: none; box-sizing: border-box;">
                </td>
            </tr>
        `;
    });

    return `
        <div style="overflow-y: auto; max-height: calc(100vh - 350px); width: 100%;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead style="position: sticky; top: 0; background: #030712; z-index: 10;">
                    <tr style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-glass);">
                        <th style="padding: 10px 12px;">#</th>
                        <th style="padding: 10px 12px;">Fecha</th>
                        <th style="padding: 10px 12px;">Área</th>
                        <th style="padding: 10px 12px;">Equipo / Ubic. Técnica</th>
                        <th style="padding: 10px 12px;">OM</th>
                        <th style="padding: 10px 12px;">Cruce</th>
                        <th style="padding: 10px 12px;">Actividad / Objeto</th>
                        <th style="padding: 10px 12px; min-width: 140px;">Estado Real</th>
                        <th style="padding: 10px 12px; text-align: center;">Notif. SAP</th>
                        <th style="padding: 10px 12px; text-align: center;">CTEC</th>
                        <th style="padding: 10px 12px; text-align: center;">Adjuntos</th>
                        <th style="padding: 10px 12px; min-width: 180px;">Observación / Justificación</th>
                    </tr>
                </thead>
                <tbody>${filasHTML}</tbody>
            </table>
        </div>
    `;
}

// =========================================================
// LECTOR EXPORT.XLSX (CON PRESERVACIÓN DE EMERGENTES)
// =========================================================
async function procesarArchivoExcelSAP(file, semanaActiva, activosMap, contenedorId) {
    if (!window.XLSX) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const filasRaw = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (!filasRaw || filasRaw.length === 0) return;

            const snapExistente = await db.ref(`historial_informes/pms_semanal/${semanaActiva}`).once('value');
            let emergentesPrevias = {};
            if (snapExistente.exists() && snapExistente.val().actividades_emergentes) {
                emergentesPrevias = snapExistente.val().actividades_emergentes;
            }

            const ordenesProcesadas = {};
            let contador = 0;

            filasRaw.forEach((fila, idx) => {
                const mapaClaves = {};
                Object.keys(fila).forEach(k => {
                    const kNorm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    mapaClaves[kNorm] = fila[k];
                });

                const orden = String(mapaClaves['orden'] || '').trim();
                const rawFecha = mapaClaves['fecha de inicio extrema'] || mapaClaves['fecha prog'] || semanaActiva;
                const fechaProg = formatearFechaExcel(rawFecha);

                const ubicacionTecnica = String(mapaClaves['ubicacion tecnica'] || '').trim();
                const equipo = String(mapaClaves['equipo'] || '').trim();
                const tagColumna = equipo !== '' && equipo !== 'NaN' ? equipo : ubicacionTecnica;
                
                const descripcion = String(mapaClaves['denominacion de objeto tecnico'] || mapaClaves['denominacion de la ubicacion tecnica'] || mapaClaves['texto breve'] || 'MONITORING VIB').trim();
                const estadoSistema = String(mapaClaves['estado de sistema'] || '').toUpperCase();
                const cantAdj = parseInt(mapaClaves['cant adj.'] || mapaClaves['cant adjuntos'] || 0) || 0;

                const notificadaSAP = (estadoSistema.includes('NOTI') || estadoSistema.includes('NOTP')) ? 'SI' : 'NO';
                const tecoSAP = estadoSistema.includes('CTEC') ? 'SI' : 'NO';

                if (!tagColumna && !orden) return;

                const idKey = `ORD_${ String(idx + 1).padStart(3, '0') }_${ normalizarIdTag(orden) }`;
                const tagNorm = normalizarIdTag(tagColumna);
                const existeActivo = Boolean(activosMap[tagNorm]);

                let areaMatch = ubicacionTecnica.match(/AR\d+/i);
                let areaDetectada = areaMatch ? areaMatch[0].toUpperCase() : 'PLANTA';

                ordenesProcesadas[idKey] = {
                    idKey,
                    orden,
                    tag: tagColumna || orden,
                    tagFirebase: tagNorm,
                    vinculadoCatastro: existeActivo,
                    descripcion,
                    fechaProg,
                    area: areaDetectada,
                    ubicacionTecnica,
                    notificadaSAP,
                    tecoSAP,
                    adjuntosSAP: cantAdj,
                    estadoEjecucion: notificadaSAP === 'SI' ? 'EJECUTADO' : 'PENDIENTE',
                    observacionAuditor: '',
                    importadoEn: new Date().toISOString()
                };
                contador++;
            });

            await db.ref(`historial_informes/pms_semanal/${semanaActiva}`).set({
                semana: semanaActiva,
                fechaCarga: new Date().toISOString(),
                nombreArchivo: file.name,
                totalOrdenes: contador,
                ordenes: ordenesProcesadas,
                actividades_emergentes: emergentesPrevias
            });

            if (window.UI && UI.mostrarToast) UI.mostrarToast(`¡${contador} órdenes respaldadas para ${semanaActiva} (Emergencias intactas)!`, "exito");
            renderizarModuloPMS(contenedorId, semanaActiva);

        } catch (err) {
            console.error("Error leyendo EXPORT.XLSX:", err);
            if (window.UI && UI.mostrarToast) UI.mostrarToast("Error al procesar el archivo de SAP.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

// =========================================================
// EXPORTADOR A PDF LEGIBLE CON jspdf & autoTable (Soluciona el bloqueo al imprimir)
// =========================================================
async function exportarPDFLegibleCorp(semanaActiva, ordenes, listaEmergentes, kpis) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Librería jsPDF no cargada.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Cabecera del documento
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("CIO Predictivo - Informe de Auditoría Programa Semanal (PMS) & Emergencias", 14, 12);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Mina Los Colorados (CMP) | Período: ${semanaActiva} | Emitido: ${new Date().toLocaleDateString()}`, 14, 18);

    // Resumen de KPIs
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Cumplimiento Terreno: ${kpis.porcCumplimiento}% (${kpis.ejecutadas}/${kpis.total})   |   Pendientes: ${kpis.pendientes}   |   Notificadas SAP: ${kpis.porcNotif}% (${kpis.notificadasCount}/${kpis.total})   |   Cierre CTEC: ${kpis.porcTeco}% (${kpis.tecoCount}/${kpis.total})   |   Emergencias: ${listaEmergentes.length}`, 14, 24);

    let bodyData = [];

    ordenes.forEach((o, idx) => {
        bodyData.push([
            idx + 1,
            formatearFechaExcel(o.fechaProg),
            o.area || '',
            o.tag || '',
            o.orden || '',
            o.estadoEjecucion || '',
            o.notificadaSAP || 'NO',
            o.tecoSAP || 'NO',
            o.adjuntosSAP || 0,
            o.observacionAuditor || '-'
        ]);
    });

    if (listaEmergentes.length > 0) {
        bodyData.push(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']);
        listaEmergentes.forEach((em, idxEm) => {
            bodyData.push([
                `EMG-${idxEm + 1}`,
                formatearFechaExcel(em.fecha) || em.fecha || 'Terreno',
                'EMG',
                em.tag,
                em.om,
                em.estadoEjecucion || 'PENDIENTE',
                em.notificadaSAP || 'NO',
                em.tecoSAP || 'NO',
                '0',
                `[${em.turno}] ${em.descripcion}`
            ]);
        });
    }

    doc.autoTable({
        startY: 28,
        head: [['#', 'Fecha', 'Área', 'Equipo', 'OM', 'Estado', 'Notif', 'CTEC', 'Adj', 'Observación / Justificación']],
        body: bodyData,
        styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 3,
            textColor: [30, 41, 59]
        },
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5
        },
        didParseCell: function (data) {
            if (data.section === 'body' && String(data.row.raw[0]).includes('EMG')) {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = 'bold';
            }
        },
        margin: { top: 26, right: 14, bottom: 15, left: 14 }
    });

    doc.save(`Auditoria_PMS_${semanaActiva}_${new Date().toISOString().split('T')[0]}.pdf`);
    if (typeof UI !== 'undefined' && UI.mostrarToast) {
        UI.mostrarToast("PDF corporativo generado y descargado con éxito.", "exito");
    }
}