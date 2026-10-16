// ==========================================
// MÓDULO UI: PROGRAMA SEMANAL (PMS), AUDITORÍA SAP PM Y EXPORTADOR PDF CORPORATIVO
// ==========================================
import { db } from '../core/firebase-config.js';
import { renderizarExpediente } from './expediente.js';

// Generar identificador PMS personalizado (ej: "PMS42") basado en la semana ISO actual
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

// Convertidor robusto de fechas de Excel a DD/MM/YYYY
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
            <p style="margin-top: 10px; color: var(--text-muted);">Cargando Auditoría SAP y respaldos históricos...</p>
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
            <div class="panel-industrial" style="animation: fadeIn 0.3s ease; padding: 20px; display: flex; flex-direction: column; gap: 14px; height: calc(100vh - 90px); box-sizing: border-box;">
                
                <!-- CABECERA DEL MÓDULO -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.75); padding: 14px 20px; border-radius: 12px; border: 1px solid var(--border-glass); flex-wrap: wrap; gap: 12px; flex-shrink: 0;">
                    <div>
                        <h2 style="color: white; font-size: 1.3rem; margin: 0 0 2px 0; display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="color: #34d399; font-size: 1.6rem;">calendar_month</span>
                            Auditoría de Programa Semanal (PMS) — SAP PM
                        </h2>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.78rem;">
                            Respaldos históricos, control de Notificaciones, CTEC y adjuntos de SAP
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-input); padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border-glass);">
                            <label style="font-size: 0.72rem; color: #38bdf8; font-weight: 600;">PERIODO:</label>
                            <select id="select-semana-historica" style="background: transparent; border: none; color: white; font-family: inherit; font-size: 0.82rem; font-weight: 700; outline: none; cursor: pointer;">
                                ${optionsSemanasHTML}
                            </select>
                        </div>

                        ${total > 0 ? `
                            <button type="button" id="btn-exportar-pdf-pms" class="btn-topbar" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-weight: 700; padding: 6px 12px; font-size: 0.8rem;" title="Generar Informe PDF Corporativo">
                                <span class="material-symbols-outlined" style="font-size: 1rem;">picture_as_pdf</span> PDF Resumen
                            </button>
                        ` : ''}

                        <input type="file" id="input-excel-pms" accept=".xlsx,.xls,.csv" style="display: none;">
                        <button type="button" id="btn-importar-excel-pms" class="btn-topbar" style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 700; padding: 6px 12px; font-size: 0.8rem;">
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

                <!-- BARRA DE FILTROS Y REINICIO SEGURO -->
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
                            <span class="material-symbols-outlined" style="font-size: 0.95rem;">lock_reset</span> Borrar Respaldo Actual
                        </button>
                    ` : ''}
                </div>

                <!-- CONTENEDOR DE LA TABLA -->
                <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--border-glass); border-radius: 12px; overflow: hidden; flex-grow: 1; display: flex; flex-direction: column;">
                    ${ renderizarContenidoTablaPMS(ordenes, activosMap) }
                </div>
            </div>
        `;

        // Eventos
        const selectSemanaHist = document.getElementById('select-semana-historica');
        if (selectSemanaHist) {
            selectSemanaHist.addEventListener('change', (e) => {
                if (e.target.value) renderizarModuloPMS(contenedorId, e.target.value);
            });
        }

        const btnExportPDF = document.getElementById('btn-exportar-pdf-pms');
        if (btnExportPDF) {
            btnExportPDF.addEventListener('click', () => generarPDFResumenPMS(semanaActiva, ordenes, { porcCumplimiento, total, ejecutadas, pendientes, porcNotif, notificadasCount, porcTeco, tecoCount }));
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

        // REINICIO / BORRADO SEGURO
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
                            <button id="btn-cancelar-reinicio" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">Cancelar</button>
                            <button id="btn-ejecutar-reinicio" disabled style="background: #475569; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; cursor: not-allowed; font-weight: bold; font-size: 0.85rem;">Sí, Eliminar Respaldo</button>
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
        const searchString = `${item.orden} ${item.tag} ${item.descripcion} ${item.ubicacionTecnica || ''} ${fechaFormateada}`;

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
                <td style="padding: 10px 12px; color: #cbd5e1; max-width: 220px;" title="${item.descripcion}">${item.descripcion}</td>
                
                <!-- ESTADO REAL -->
                <td style="padding: 10px 12px;">
                    <select class="select-estado-pms" style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 5px 6px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; width: 100%;">
                        <option value="PENDIENTE" ${est === 'PENDIENTE' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="EJECUTADO" ${est === 'EJECUTADO' ? 'selected' : ''}>✅ Ejecutado</option>
                        <option value="DETENIDO_OPS" ${est === 'DETENIDO_OPS' ? 'selected' : ''}>🛑 Detenido Ops</option>
                        <option value="SIN_ACCESO" ${est === 'SIN_ACCESO' ? 'selected' : ''}>🚧 Sin Acceso</option>
                        <option value="REPROGRAMADO" ${est === 'REPROGRAMADO' ? 'selected' : ''}>📅 Reprogramado</option>
                    </select>
                </td>

                <!-- NOTIFICADA SAP -->
                <td style="padding: 10px 12px; text-align: center;">
                    <select class="select-notif-pms" style="background: var(--bg-input); color: ${notif === 'SI' ? '#a855f7' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 5px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: bold;">
                        <option value="NO" ${notif === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${notif === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>

                <!-- CTEC (CIERRE TÉCNICO) -->
                <td style="padding: 10px 12px; text-align: center;">
                    <select class="select-teco-pms" style="background: var(--bg-input); color: ${teco === 'SI' ? '#10b981' : '#94a3b8'}; border: 1px solid var(--border-glass); padding: 5px; border-radius: 6px; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: bold;">
                        <option value="NO" ${teco === 'NO' ? 'selected' : ''}>❌ NO</option>
                        <option value="SI" ${teco === 'SI' ? 'selected' : ''}>✔ SÍ</option>
                    </select>
                </td>

                <!-- ADJUNTOS SAP -->
                <td style="padding: 10px 12px; text-align: center; color: ${cantAdjuntos > 0 ? '#38bdf8' : 'var(--text-muted)'}; font-weight: bold; font-size: 0.8rem;" title="Archivos adjuntos en SAP">
                    📎 ${cantAdjuntos}
                </td>

                <!-- OBSERVACIÓN -->
                <td style="padding: 10px 12px;">
                    <input type="text" class="input-obs-pms" value="${item.observacionAuditor || ''}" placeholder="Nota..." style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 5px 8px; border-radius: 6px; font-size: 0.75rem; width: 100%; outline: none; box-sizing: border-box;">
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
                        <th style="padding: 10px 12px; min-width: 150px;">Observación</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasHTML}
                </tbody>
            </table>
        </div>
    `;
}

// =========================================================
// LECTOR EXPORT.XLSX (NOMENCLATURA PMS)
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
                ordenes: ordenesProcesadas
            });

            if (window.UI && UI.mostrarToast) UI.mostrarToast(`¡${contador} órdenes respaldadas para ${semanaActiva}!`, "exito");
            renderizarModuloPMS(contenedorId, semanaActiva);

        } catch (err) {
            console.error("Error leyendo EXPORT.XLSX:", err);
            if (window.UI && UI.mostrarToast) UI.mostrarToast("Error al procesar el archivo de SAP.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

// =========================================================
// GENERADOR DE PDF EJECUTIVO CON LOGO CPF Y ANCHO OPTIMIZADO
// =========================================================
async function generarPDFResumenPMS(semanaActiva, ordenes, kpis) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (window.UI && UI.mostrarToast) UI.mostrarToast("Librería jsPDF no disponible", "error");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Fondo blanco puro en toda la página
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // 2. Cabecera Corporativa con Fondo Azul Oscuro (#0f172a)
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 24, 'F');

        // Incrustar el logotipo oficial CPF de forma proporcionada
        try {
            const img = new Image();
            img.src = './assets/img/logo-cpf.png';
            await new Promise((resolve) => {
                img.onload = () => {
                    // x: 12, y: 4, width: 32, height: 16 (Proporción perfecta sin pisar texto)
                    doc.addImage(img, 'PNG', 12, 4, 32, 16);
                    resolve();
                };
                img.onerror = () => resolve();
            });
        } catch (e) { console.warn("Logo no disponible para PDF"); }

        // Textos de cabecera desplazados a la derecha del logo
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("INFORME DE AUDITORÍA PROGRAMA SEMANAL (PMS)", 48, 10);
        
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(`Mina Los Colorados (CMP)  |  Período: ${semanaActiva}  |  Fecha: ${new Date().toLocaleDateString('es-CL')}`, 48, 16.5);

        // 3. Tarjetas KPI de Resumen (Aprovechando todo el ancho de margen a margen: 14mm a 14mm)
        let startY = 30;
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, startY, pageWidth - 28, 14, 1.5, 1.5, 'F');

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        
        // Distribución equitativa de los KPIs en el espacio horizontal
        doc.text(`Cumplimiento Terreno: ${kpis.porcCumplimiento}% (${kpis.ejecutadas}/${kpis.total})`, 18, startY + 9);
        doc.text(`Pendientes: ${kpis.pendientes}`, 76, startY + 9);
        doc.text(`Notificadas SAP: ${kpis.porcNotif}% (${kpis.notificadasCount}/${kpis.total})`, 112, startY + 9);
        doc.text(`Cierre CTEC: ${kpis.porcTeco}% (${kpis.tecoCount}/${kpis.total})`, 164, startY + 9);

        // 4. Tabla Detallada Optimizada para el Ancho Total de la Página
        startY = 48;
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Detalle de Órdenes y Estatus SAP", 14, startY);

        if (typeof doc.autoTable === 'function') {
            const headers = [["#", "Fecha Prog.", "Área", "Equipo / Ubicación Técnica", "Orden (OM)", "Estado", "Notif", "CTEC", "Adj"]];
            const data = ordenes.map((o, index) => [
                index + 1,
                formatearFechaExcel(o.fechaProg),
                o.area || '',
                o.tag || '',
                o.orden || '',
                o.estadoEjecucion || '',
                o.notificadaSAP || '',
                o.tecoSAP || '',
                o.adjuntosSAP || 0
            ]);

            // Ancho útil disponible: 210mm (A4) - 28mm (márgenes) = 182 mm
            doc.autoTable({
                startY: startY + 3,
                head: headers,
                body: data,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
                bodyStyles: { fontSize: 6.5, textColor: [30, 41, 59], fillColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },   // #
                    1: { cellWidth: 20 },                  // Fecha
                    2: { cellWidth: 15 },                  // Área
                    3: { cellWidth: 50 },                  // Equipo (ampliado para que no se corte)
                    4: { cellWidth: 26 },                  // OM
                    5: { cellWidth: 30 },                  // Estado
                    6: { halign: 'center', cellWidth: 11 },// Notif
                    7: { halign: 'center', cellWidth: 11 },// CTEC
                    8: { halign: 'center', cellWidth: 11 } // Adj
                },
                margin: { left: 14, right: 14 }
            });
        }

        doc.save(`Auditoria_${semanaActiva}.pdf`);
        if (window.UI && UI.mostrarToast) UI.mostrarToast("¡Informe PDF corporativo generado con éxito!", "exito");

    } catch (err) {
        console.error("Error generando PDF:", err);
        if (window.UI && UI.mostrarToast) UI.mostrarToast("Error al exportar PDF", "error");
    }
}