// ==========================================
// MÓDULO UI: APP DE TERRENO (RUTA SECUENCIAL + FUSE.JS + ASISTENTE VISUAL DE FALLAS)
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

export async function renderizarModuloTerreno(contenedorId = 'espacio-trabajo-dinamico', semanaSeleccionada = null) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const semanaActiva = semanaSeleccionada || obtenerSemanaPMSActual();

    contenedor.innerHTML = `
        <div style="padding: 60px; text-align: center; color: var(--primary-blue);">
            <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 40px;">autorenew</span>
            <p style="margin-top: 10px; color: var(--text-muted);">Cargando Ruta de Terreno y Asistente Táctil...</p>
        </div>
    `;

    try {
        const [snapActivos, snapPMS] = await Promise.all([
            db.ref('activos_criticos').once('value'),
            db.ref(`historial_informes/pms_semanal/${semanaActiva}`).once('value')
        ]);

        const activosMap = snapActivos.exists() ? snapActivos.val() : {};
        const pmsData = snapPMS.exists() ? snapPMS.val() : null;
        let ordenes = pmsData && pmsData.ordenes ? Object.values(pmsData.ordenes) : [];

        // Ordenar secuencialmente por Área y luego por TAG
        ordenes.sort((a, b) => {
            const areaA = (a.area || '').localeCompare(b.area || '');
            if (areaA !== 0) return areaA;
            return (a.tag || '').localeCompare(b.tag || '', undefined, { numeric: true });
        });

        contenedor.innerHTML = `
            <div class="panel-industrial" style="animation: fadeIn 0.3s ease; padding: 16px; display: flex; flex-direction: column; gap: 14px; height: calc(100vh - 90px); box-sizing: border-box; max-width: 900px; margin: 0 auto;">
                
                <!-- CABECERA TÁCTIL DE TERRENO -->
                <div style="background: rgba(15, 23, 42, 0.9); padding: 14px 18px; border-radius: 12px; border: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; flex-shrink: 0;">
                    <div>
                        <h2 style="color: white; font-size: 1.2rem; margin: 0 0 2px 0; display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="color: #f59e0b; font-size: 1.5rem;">smartphone</span>
                            Modo Terreno — Ruta Secuencial
                        </h2>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.75rem;">
                            Período: <b style="color: #38bdf8;">${semanaActiva}</b> | Total OMs en Ruta: <b>${ordenes.length}</b>
                        </p>
                    </div>

                    <button type="button" id="btn-volver-dashboard" class="btn-topbar" style="background: rgba(255, 255, 255, 0.06); color: var(--text-main); border: 1px solid var(--border-glass); padding: 6px 12px; font-size: 0.8rem;" onclick="window.location.href='index.html'">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">arrow_back</span> Salir a Dashboard
                    </button>
                </div>

                <!-- PAD DE BÚSQUEDA RÁPIDA CON FUSE.JS -->
                <div style="background: rgba(15, 23, 42, 0.7); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-glass); display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.4rem;">search</span>
                    <input type="text" id="buscador-fuse-terreno" placeholder="Búsqueda rápida por TAG, Equipo, OM o Actividad..." style="background: var(--bg-input); border: 1px solid var(--border-glass); color: white; padding: 10px 14px; border-radius: 8px; font-size: 0.88rem; width: 100%; outline: none; font-family: inherit;">
                </div>

                <!-- LISTA TÁCTICA SECUENCIAL DE TERRENO -->
                <div id="contenedor-cards-terreno" style="overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;">
                    ${ renderizarCardsSecuenciales(ordenes, activosMap) }
                </div>
            </div>
        `;

        const optionsFuse = {
            keys: ['tag', 'orden', 'descripcion', 'area'],
            threshold: 0.35,
            distance: 100
        };
        const fuse = window.Fuse ? new window.Fuse(ordenes, optionsFuse) : null;

        const inputBuscador = document.getElementById('buscador-fuse-terreno');
        const contenedorCards = document.getElementById('contenedor-cards-terreno');

        if (inputBuscador) {
            inputBuscador.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (!query) {
                    contenedorCards.innerHTML = renderizarCardsSecuenciales(ordenes, activosMap);
                } else if (fuse) {
                    const resultados = fuse.search(query).map(res => res.item);
                    contenedorCards.innerHTML = renderizarCardsSecuenciales(resultados, activosMap);
                } else {
                    const qLower = query.toLowerCase();
                    const filtradas = ordenes.filter(o => 
                        (o.tag || '').toLowerCase().includes(qLower) || 
                        (o.orden || '').toLowerCase().includes(qLower) || 
                        (o.descripcion || '').toLowerCase().includes(qLower)
                    );
                    contenedorCards.innerHTML = renderizarCardsSecuenciales(filtradas, activosMap);
                }
                vincularEventosCards(contenedor, semanaActiva, contenedorId);
            });
        }

        vincularEventosCards(contenedor, semanaActiva, contenedorId);

    } catch (error) {
        console.error("Error en App de Terreno:", error);
        contenedor.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error al cargar la ruta de terreno: ${error.message}</div>`;
    }
}

// =========================================================
// RENDERIZADO DE TARJETAS TÁCTILES SECUENCIALES + ASISTENTE VISUAL
// =========================================================
function renderizarCardsSecuenciales(ordenes, activosMap) {
    if (!ordenes || ordenes.length === 0) {
        return `
            <div style="padding: 50px; text-align: center; color: var(--text-muted); background: rgba(15, 23, 42, 0.4); border-radius: 10px;">
                <span class="material-symbols-outlined" style="font-size: 42px; color: #f59e0b; margin-bottom: 8px;">search_off</span>
                <p style="margin: 0; font-size: 0.9rem;">No se encontraron órdenes coincidentes en la ruta actual.</p>
            </div>
        `;
    }

    let html = '';
    ordenes.forEach((item, idx) => {
        const tagKey = (item.tag || '').trim().toUpperCase().replace(/\s+/g, '_');
        const activoFirebase = activosMap[tagKey] || null;
        const existeEnCatastro = Boolean(activoFirebase);

        const sev = existeEnCatastro ? (activoFirebase.severidad || activoFirebase.estado || 'verde').toLowerCase() : 'verde';
        let colorBorde = '#10b981';
        let textoSev = 'Zona A/B (Normal)';
        if (sev === 'rojo' || sev === 'critico') { colorBorde = '#ef4444'; textoSev = 'Crítico (Zona D)'; }
        else if (sev === 'naranja' || sev === 'amarillo') { colorBorde = '#f97316'; textoSev = 'Alerta (Zona C)'; }

        const est = item.estadoEjecucion || 'PENDIENTE';

        html += `
            <div class="card-orden-terreno" data-key="${item.idKey}" style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass); border-left: 5px solid ${colorBorde}; border-radius: 10px; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 4px;">#${idx + 1} • Área: ${item.area || 'Planta'}</span>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">Fecha: ${item.fechaProg || 'Programa'}</span>
                        </div>
                        <h3 style="margin: 0; color: white; font-size: 1.1rem; font-family: monospace;">${item.tag}</h3>
                        <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: #cbd5e1;">${item.descripcion}</p>
                    </div>

                    <div style="text-align: right; flex-shrink: 0;">
                        <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">OM SAP</span>
                        <strong style="color: #38bdf8; font-family: monospace; font-size: 0.95rem;">${item.orden}</strong>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${colorBorde}; display: inline-block;"></span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${textoSev}</span>
                        ${existeEnCatastro ? `
                            <button type="button" class="btn-ver-expediente-terreno" data-target="${tagKey}" style="background: transparent; border: none; color: #38bdf8; cursor: pointer; font-size: 0.75rem; font-weight: bold; text-decoration: underline; margin-left: 5px;">Ver Expediente ↗</button>
                        ` : ''}
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <select class="select-estado-terreno" data-key="${item.idKey}" style="background: var(--bg-input); color: white; border: 1px solid var(--border-glass); padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; outline: none; cursor: pointer; font-weight: 600;">
                            <option value="PENDIENTE" ${est === 'PENDIENTE' ? 'selected' : ''}>⏳ Pendiente</option>
                            <option value="EJECUTADO" ${est === 'EJECUTADO' ? 'selected' : ''}>✅ Ejecutado</option>
                            <option value="DETENIDO_OPS" ${est === 'DETENIDO_OPS' ? 'selected' : ''}>🛑 Detenido Ops</option>
                            <option value="SIN_ACCESO" ${est === 'SIN_ACCESO' ? 'selected' : ''}>🚧 Sin Acceso</option>
                            <option value="REPROGRAMADO" ${est === 'REPROGRAMADO' ? 'selected' : ''}>📅 Reprogramado</option>
                        </select>
                    </div>
                </div>

                <!-- ASISTENTE VISUAL TÁCTIL DE FALLAS (BOTONES GRANDES) -->
                <div style="background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 6px; font-weight: bold;">Asistente Táctil de Síntomas (Clic para autocompletar):</span>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px;">
                        <button type="button" class="btn-sintoma-tactil" data-key="${item.idKey}" data-texto="Fuga de aceite visible en sellos o descansos." style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 6px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: bold; text-align: center;">
                            🛢️ Fuga de Aceite
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${item.idKey}" data-texto="Vibración anómala o armónicos elevados detectados." style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: bold; text-align: center;">
                            🔊 Vibración Alta
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${item.idKey}" data-texto="Elevación de temperatura anormal por fricción o falta de lubricación." style="background: rgba(249, 115, 22, 0.12); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); padding: 6px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: bold; text-align: center;">
                            🌡️ Temp. Elevada
                        </button>
                        <button type="button" class="btn-sintoma-tactil" data-key="${item.idKey}" data-texto="Holgura mecánica o desgaste avanzado en componentes." style="background: rgba(168, 85, 247, 0.12); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 6px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: bold; text-align: center;">
                            ⚙️ Holgura / Desgaste
                        </button>
                    </div>
                </div>

                <div>
                    <input type="text" class="input-obs-terreno" data-key="${item.idKey}" value="${item.observacionAuditor || ''}" placeholder="Escribir motivo o nota de terreno..." style="background: rgba(0,0,0,0.25); color: white; border: 1px solid var(--border-glass); padding: 7px 10px; border-radius: 6px; font-size: 0.78rem; width: 100%; outline: none; box-sizing: border-box;">
                </div>
            </div>
        `;
    });

    return html;
}

// =========================================================
// VINCULACIÓN DE EVENTOS EN TARJETAS DE TERRENO
// =========================================================
function vincularEventosCards(contenedor, semanaActiva, contenedorId) {
    // 1. Autoguardado al cambiar estado u observación
    contenedor.querySelectorAll('.select-estado-terreno, .input-obs-terreno').forEach(elemento => {
        const eventoTrigger = elemento.tagName === 'SELECT' ? 'change' : 'blur';

        elemento.addEventListener(eventoTrigger, async (e) => {
            const card = e.target.closest('.card-orden-terreno');
            if (!card) return;

            const ordenKey = card.getAttribute('data-key');
            const nuevoEstado = card.querySelector('.select-estado-terreno').value;
            const nuevaObs = card.querySelector('.input-obs-terreno').value.trim();

            try {
                await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                    estadoEjecucion: nuevoEstado,
                    observacionAuditor: nuevaObs,
                    ultimaActualizacion: new Date().toISOString()
                });

                if (window.UI && UI.mostrarToast) {
                    UI.mostrarToast("💾 Lectura de terreno guardada", "exito");
                }
            } catch (err) {
                console.error("Error guardando en terreno:", err);
                if (window.UI && UI.mostrarToast) UI.mostrarToast("Error al sincronizar con Firebase", "error");
            }
        });
    });

    // 2. Asistente táctil de botones grandes para autocompletar síntomas
    contenedor.querySelectorAll('.btn-sintoma-tactil').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.card-orden-terreno');
            if (!card) return;

            const ordenKey = card.getAttribute('data-key');
            const textoSintoma = e.currentTarget.getAttribute('data-texto');
            const inputObs = card.querySelector('.input-obs-terreno');
            const selectEstado = card.querySelector('.select-estado-terreno');

            // Autocompletar texto en el input y cambiar estado a ejecutado automáticamente
            inputObs.value = textoSintoma;
            selectEstado.value = 'EJECUTADO';

            const nuevaObs = textoSintoma;
            const nuevoEstado = 'EJECUTADO';

            try {
                await db.ref(`historial_informes/pms_semanal/${semanaActiva}/ordenes/${ordenKey}`).update({
                    estadoEjecucion: nuevoEstado,
                    observacionAuditor: nuevaObs,
                    ultimaActualizacion: new Date().toISOString()
                });

                if (window.UI && UI.mostrarToast) {
                    UI.mostrarToast("⚡ Síntoma registrado y guardado", "exito");
                }
            } catch (err) {
                console.error("Error en síntoma táctil:", err);
            }
        });
    });

    // 3. Ver expediente
    contenedor.querySelectorAll('.btn-ver-expediente-terreno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idFirebase = e.currentTarget.getAttribute('data-target');
            if (idFirebase) {
                renderizarExpediente(idFirebase, contenedorId);
            }
        });
    });
}