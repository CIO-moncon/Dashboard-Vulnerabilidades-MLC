// ==========================================
// MÓDULO UI: ANÁLISIS EXPERTO, WEBP, BITÁCORA, PROYECCIÓN P-F, BACKLOG, TIMELINE Y GRÁFICAS COLAPSIBLES
// ==========================================
import { db } from '../core/firebase-config.js';
import { renderizarExpediente } from './expediente.js';

function asegurarChartJS() {
    return new Promise((resolve) => {
        if (window.Chart) {
            resolve(window.Chart);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
    });
}

function comprimirImagenWebP(file, maxWidth = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const webpBase64 = canvas.toDataURL('image/webp', quality);
                resolve(webpBase64);
            };
            img.onerror = (err) => reject(err);
            img.src = event.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

function calcularProyeccionDiasAlarma(historialObj, umbralCritico = 7.1) {
    if (!historialObj) return null;
    
    const historialArray = Object.values(historialObj).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));
    if (historialArray.length < 2) return null;

    const ultimas = historialArray.slice(-10);
    const n = ultimas.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const tiempoBase = new Date(ultimas[0].fechaHora).getTime();

    ultimas.forEach(h => {
        const tDias = (new Date(h.fechaHora).getTime() - tiempoBase) / (1000 * 60 * 60 * 24);
        const val = parseFloat(h.valor ?? h.rms ?? 0);
        sumX += tDias;
        sumY += val;
        sumXY += tDias * val;
        sumXX += tDias * tDias;
    });

    const pendiente = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercepto = (sumY - pendiente * sumX) / n;
    const valorActual = parseFloat(ultimas[n - 1].valor ?? ultimas[n - 1].rms ?? 0);

    if (pendiente <= 0 || valorActual >= umbralCritico) {
        return { dias: null, pendiente: 0, estado: "estable" };
    }

    const ultimoTDias = (new Date(ultimas[n - 1].fechaHora).getTime() - tiempoBase) / (1000 * 60 * 60 * 24);
    const diasFaltantes = (umbralCritico - intercepto) / pendiente - ultimoTDias;

    if (diasFaltantes <= 0 || isNaN(diasFaltantes) || diasFaltantes > 3650) return null;

    return {
        dias: Math.ceil(diasFaltantes),
        pendiente: pendiente.toFixed(3),
        estado: "alerta"
    };
}

export async function renderizarModuloAnalisis(idFirebase, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div style="padding: 60px; text-align: center; color: var(--primary-blue);">
            <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 40px;">autorenew</span>
            <p style="margin-top: 10px; color: var(--text-muted);">Iniciando motor de inferencia experto...</p>
        </div>
    `;

    await asegurarChartJS();

    db.ref(`activos_criticos/${idFirebase}`).once('value').then(snapshot => {
        if (!snapshot.exists()) {
            contenedor.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No se encontró información para este equipo.</div>';
            return;
        }

        const eq = snapshot.val();
        const spots = eq.spots || {};
        let htmlDiagnosticos = '';
        let totalCriticos = 0;

        Object.keys(spots).forEach(spotKey => {
            const s = spots[spotKey];
            const rms = parseFloat(s.rms || 0);
            const temp = parseFloat(s.temp || 0);
            const fc = parseFloat(s.fc || 0);

            const proyeccionPF = calcularProyeccionDiasAlarma(s.historial, 7.1);
            let badgeProyeccionHTML = '';
            if (proyeccionPF && proyeccionPF.dias !== null) {
                badgeProyeccionHTML = `
                    <div style="margin-top: 5px; font-size: 0.75rem; background: rgba(249, 115, 22, 0.12); border: 1px solid rgba(249, 115, 22, 0.3); color: #f97316; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">trending_up</span>
                        <b>Curva P-F:</b> Umbral crítico en aprox. <b>${proyeccionPF.dias} día(s)</b> (+${proyeccionPF.pendiente} mm/s/día)
                    </div>
                `;
            }

            const backlogEstado = s.backlogEstado || null;
            let badgeBacklogHTML = '';
            if (backlogEstado === 'efectivo') {
                badgeBacklogHTML = `
                    <div style="margin-top: 5px; font-size: 0.75rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">task_alt</span>
                        <b>Ciclo SAP Cerrado:</b> Intervención Efectiva (RMS Post-Trabajo: ${s.rmsPostIntervencion || 'N/A'} mm/s)
                    </div>
                `;
            }

            let sugerenciaFalla = "Condición estable. Espectro de velocidad plano, sin armónicos destacados ni modulación en alta frecuencia.";
            let sugerenciaRec = "Continuar con la rutera predictiva programada.";
            let colorBorde = 'var(--iso-zona-a)';

            if (fc >= 5.0 && rms >= 4.5) {
                sugerenciaFalla = "Falla Avanzada en Elemento Rodante (Pista o Perfil / Kurtosis Alta). Presencia de frecuencias de falla (BPFO/BPFI).";
                sugerenciaRec = "Inspección estroboscópica inmediata. Programar reemplazo de rodamiento en próxima ventana.";
                colorBorde = 'var(--iso-zona-d)';
                totalCriticos++;
            } else if (temp >= 80) {
                sugerenciaFalla = "Degradación Térmica Severa / Falla de Lubricación. Elevación del piso térmico por fricción seca.";
                sugerenciaRec = "Análisis tribológico de aceite (FDM) y revisión de sistema de lubricación.";
                colorBorde = 'var(--iso-zona-d)';
                totalCriticos++;
            } else if (rms >= 7.1) {
                sugerenciaFalla = "Severa Vibración Global (Zona D ISO). Dominio de frecuencia 1x RPM con armónicos.";
                sugerenciaRec = "Detención operativa para control dimensional de acoples y torqueo de pernos.";
                colorBorde = 'var(--iso-zona-d)';
                totalCriticos++;
            } else if (rms >= 4.5 || temp >= 65 || fc >= 3.0) {
                sugerenciaFalla = "Alerta Temprana / Tendencia Alcista Moderada. Desgaste inicial o condición incipiente.";
                sugerenciaRec = "Aumentar frecuencia de monitoreo a quincenal.";
                colorBorde = 'var(--iso-zona-c)';
            } else if (fc >= 5.0 || temp >= 80) {
                colorBorde = 'var(--iso-zona-d)';
                totalCriticos++;
            }

            const analisisActual = s.analisisAnalista !== undefined && s.analisisAnalista !== '' ? s.analisisAnalista : sugerenciaFalla;
            const recomendacionActual = s.recomendacionAnalista !== undefined && s.recomendacionAnalista !== '' ? s.recomendacionAnalista : sugerenciaRec;
            const avisosTexto = s.avisosTexto || '';
            const numeroOM = s.numeroOM || '';

            const espectrosArray = Array.isArray(s.espectrogramas) ? s.espectrogramas : (s.espectrogramaBase64 ? [s.espectrogramaBase64] : []);
            let galeriaHtml = '';
            espectrosArray.forEach((imgBase64, index) => {
                galeriaHtml += `
                    <div style="position: relative; display: inline-block; margin-right: 5px; margin-bottom: 5px;">
                        <img src="${imgBase64}" style="width: 50px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                        <button type="button" class="btn-eliminar-espectro" data-spot="${spotKey}" data-index="${index}" style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Eliminar imagen">×</button>
                    </div>
                `;
            });

            htmlDiagnosticos += `
                <div style="background: var(--bg-input); border-left: 4px solid ${colorBorde}; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 20px;" data-spot-card="${spotKey}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <div>
                            <h4 style="color: var(--text-main); margin: 0; font-size: 1rem;">Componente: ${s.componente} <span style="color: var(--primary-blue);">[Punto: ${s.punto}]</span></h4>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 3px 0 0 0;">RMS: <b>${rms.toFixed(2)} mm/s</b> | Temp: <b>${temp.toFixed(1)} °C</b> | FC+: <b>${fc.toFixed(2)}</b></p>
                            ${badgeProyeccionHTML}
                            ${badgeBacklogHTML}
                        </div>
                        <div>
                            <button type="button" class="btn-toggle-grafico" data-spot="${spotKey}" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.78rem; font-weight: bold; display: flex; align-items: center; gap: 5px;" title="Ver/Ocultar Gráfica de Tendencia">
                                <span class="material-symbols-outlined" style="font-size: 1rem;">show_chart</span> Gráfica Histórica
                            </button>
                        </div>
                    </div>

                    <!-- CONTENEDOR COLAPSIBLE DE LA GRÁFICA DE TENDENCIA -->
                    <div id="contenedor-grafico-${spotKey}" style="display: none; background: rgba(15, 23, 42, 0.8); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border-glass);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 0.78rem; color: #38bdf8; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                                <span class="material-symbols-outlined" style="font-size: 1rem;">monitoring</span> Evolución Histórica RMS (mm/s)
                            </span>
                            <span style="font-size: 0.7rem; color: var(--text-muted);">Umbral ISO Zona D: 7.1 mm/s</span>
                        </div>
                        <div style="height: 140px; width: 100%; position: relative;">
                            <canvas id="chart-tendencia-${spotKey}"></canvas>
                        </div>
                    </div>

                    <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; margin-bottom: 15px; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; align-items: center;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Avisos Múltiples (Descripción libre para SAP):</label>
                            <input type="text" class="input-avisos-multiples" data-spot="${spotKey}" value="${avisosTexto}" placeholder="Ej. Lubricación de descansos..." style="width: 100%; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size: 0.85rem; outline: none;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 3px;">Orden de Mantenimiento (OM):</label>
                            <input type="text" class="input-om-sap" data-spot="${spotKey}" value="${numeroOM}" placeholder="Ej. OM-409" style="width: 100%; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size: 0.85rem; outline: none;">
                        </div>
                        <div style="text-align: right; padding-top: 15px;">
                            <button type="button" class="btn-cerrar-backlog" data-spot="${spotKey}" data-rms="${rms}" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 7px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span class="material-symbols-outlined" style="font-size: 0.95rem;">task_alt</span> Validar Cierre OM
                            </button>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap: 15px; margin-bottom: 12px;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--primary-blue); font-weight: bold; display: block; margin-bottom: 4px;">📝 Análisis del Especialista:</label>
                            <textarea class="input-analisis-analista" data-spot="${spotKey}" rows="3" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size: 0.85rem; outline: none; resize: vertical;">${analisisActual}</textarea>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: #4ade80; font-weight: bold; display: block; margin-bottom: 4px;">💡 Recomendación Técnica:</label>
                            <textarea class="input-rec-analista" data-spot="${spotKey}" rows="3" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size: 0.85rem; outline: none; resize: vertical;">${recomendacionActual}</textarea>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: #eab308; font-weight: bold; display: block; margin-bottom: 4px;">📊 Imágenes Espectrales (Auto-WebP):</label>
                            <input type="file" class="input-file-espectro" data-spot="${spotKey}" accept="image/*" multiple style="display: none;">
                            <button type="button" class="btn-subir-espectro" data-spot="${spotKey}" style="width: 100%; padding: 8px; background: rgba(56, 189, 248, 0.08); border: 1px dashed rgba(56, 189, 248, 0.4); border-radius: 4px; color: var(--primary-blue); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 0.75rem; font-weight: 600;">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">add_photo_alternate</span> Adjuntar Espectros
                            </button>
                            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
                                ${galeriaHtml}
                            </div>
                        </div>
                    </div>

                    <div style="text-align: right;">
                        <button type="button" class="btn-guardar-analisis-spot" data-spot="${spotKey}" style="background: rgba(56, 189, 248, 0.15); color: var(--primary-blue); border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 15px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                            Guardar Componente
                        </button>
                    </div>
                </div>
            `;
        });

        contenedor.innerHTML = `
            <div class="panel-industrial" style="animation: fadeIn 0.3s ease; padding: 20px; overflow-y: auto; height: 100%; max-height: calc(100vh - 120px);">
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-glass); padding-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h2 style="color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="color: var(--primary-blue);">assignment</span> Gestión de Avisos y Espectros: ${eq.tag}
                        </h2>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 5px 0 0 0;">${eq.nombre} | Área: ${eq.area || 'Planta'} | Alertas Críticas: ${totalCriticos}</p>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button type="button" id="btn-timeline-eventos" class="btn-topbar" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-color: rgba(59, 130, 246, 0.4);">
                            <span class="material-symbols-outlined">timeline</span> Línea de Tiempo
                        </button>
                        <button type="button" id="btn-bitacora-historica" class="btn-topbar" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border-color: rgba(168, 85, 247, 0.4);">
                            <span class="material-symbols-outlined">history</span> Bitácora Histórica
                        </button>
                        <button type="button" id="btn-nuevo-informe" class="btn-topbar" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);">
                            <span class="material-symbols-outlined">post_add</span> Nuevo Informe
                        </button>
                        <button type="button" id="btn-generar-resumen-sap" class="btn-topbar" style="background: rgba(16, 185, 129, 0.15); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.4);">
                            <span class="material-symbols-outlined">description</span> Informe Espectral (SAP)
                        </button>
                        <button type="button" id="btn-volver-inspeccion" class="btn-topbar" style="background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border-color: rgba(56, 189, 248, 0.3);">
                            <span class="material-symbols-outlined">arrow_back</span> Volver
                        </button>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${htmlDiagnosticos}
                </div>
            </div>
        `;

        // -------------------------------------------------------------
        // CONTROLADOR DE APERTURA / CIERRE DE GRÁFICAS (BAJO DEMANDA)
        // -------------------------------------------------------------
        const graficosInstanciados = {};

        contenedor.querySelectorAll('.btn-toggle-grafico').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const sKey = e.currentTarget.getAttribute('data-spot');
                const contenedorGrafico = document.getElementById(`contenedor-grafico-${sKey}`);
                if (!contenedorGrafico) return;

                const estaOculto = contenedorGrafico.style.display === 'none' || contenedorGrafico.style.display === '';
                
                if (estaOculto) {
                    contenedorGrafico.style.display = 'block';
                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)';
                    
                    if (!graficosInstanciados[sKey] && window.Chart) {
                        const canvasEl = document.getElementById(`chart-tendencia-${sKey}`);
                        const sData = spots[sKey];
                        if (canvasEl && sData && sData.historial) {
                            const histArray = Object.values(sData.historial).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));
                            const labels = histArray.map(h => {
                                const d = new Date(h.fechaHora);
                                return `${d.getDate()}/${d.getMonth() + 1}`;
                            });
                            const valores = histArray.map(h => parseFloat(h.valor ?? h.rms ?? 0));

                            graficosInstanciados[sKey] = new window.Chart(canvasEl, {
                                type: 'line',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: 'RMS (mm/s)',
                                        data: valores,
                                        borderColor: '#38bdf8',
                                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                        borderWidth: 2,
                                        fill: true,
                                        tension: 0.2,
                                        pointRadius: 3
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                                        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, suggestedMax: 8 }
                                    }
                                }
                            });
                        }
                    }
                } else {
                    contenedorGrafico.style.display = 'none';
                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                }
            });
        });

        document.getElementById('btn-volver-inspeccion').addEventListener('click', () => {
            renderizarExpediente(idFirebase, contenedorId, false);
        });

        document.getElementById('btn-timeline-eventos').addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalTimeline(idFirebase, eq);
        });

        document.getElementById('btn-bitacora-historica').addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalBitacoraHistorica(idFirebase, eq);
        });

        // -------------------------------------------------------------
        // RESTO DE EVENTOS (BACKLOG, NUEVO INFORME, ESPECTROS, SAP)
        // -------------------------------------------------------------
        contenedor.querySelectorAll('.btn-cerrar-backlog').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const sKey = e.currentTarget.getAttribute('data-spot');
                const rmsActual = parseFloat(e.currentTarget.getAttribute('data-rms'));
                const inputOmCard = contenedor.querySelector(`.input-om-sap[data-spot="${sKey}"]`);
                const omVal = inputOmCard ? inputOmCard.value.trim() : '';

                if (!omVal || omVal === '') {
                    if (window.UI && UI.mostrarToast) UI.mostrarToast("Debes ingresar un número de OM antes de cerrar el ciclo.", "alerta");
                    return;
                }

                const modalId = 'modal-backlog-cierre';
                let modal = document.getElementById(modalId);
                if (modal) modal.remove();

                modal = document.createElement('div');
                modal.id = modalId;
                modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: sans-serif;";
                
                modal.innerHTML = `
                    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; width: 480px; max-width: 90%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); overflow: hidden;">
                        <div style="background: rgba(16, 185, 129, 0.1); border-bottom: 1px solid rgba(16, 185, 129, 0.2); padding: 20px; display: flex; align-items: center; gap: 15px;">
                            <span class="material-symbols-outlined" style="color: #34d399; font-size: 34px;">task_alt</span>
                            <div>
                                <h3 style="margin: 0; color: #f8fafc; font-size: 1.05rem;">Validar Cierre de Orden: ${omVal}</h3>
                                <p style="margin: 3px 0 0 0; color: #94a3b8; font-size: 0.8rem;">Comparación de efectividad</p>
                            </div>
                        </div>
                        <div style="padding: 20px; color: #cbd5e1; font-size: 0.88rem;">
                            <p style="margin-top: 0;">Vibración actual: <b style="color: ${rmsActual >= 4.5 ? '#f87171' : '#34d399'};">${rmsActual} mm/s RMS</b></p>
                            <label style="display: block; margin-bottom: 6px; color: #94a3b8; font-size: 0.78rem;">Comentarios de la intervención:</label>
                            <textarea id="input-comentario-backlog" rows="3" placeholder="Ej. Reemplazo de rodamiento..." style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: white; font-size: 0.85rem; outline: none; resize: vertical;"></textarea>
                        </div>
                        <div style="padding: 15px 20px; background: #1e293b; border-top: 1px solid #334155; display: flex; justify-content: flex-end; gap: 10px;">
                            <button id="btn-cancelar-backlog" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">Cancelar</button>
                            <button id="btn-confirmar-backlog" style="background: #10b981; color: #0f172a; border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.85rem;">Confirmar Cierre Exitoso</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                document.getElementById('btn-cancelar-backlog').addEventListener('click', () => modal.remove());
                document.getElementById('btn-confirmar-backlog').addEventListener('click', async () => {
                    const comentario = document.getElementById('input-comentario-backlog').value.trim();
                    try {
                        await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}`).update({
                            numeroOM: omVal,
                            backlogEstado: 'efectivo',
                            rmsPostIntervencion: rmsActual,
                            comentarioBacklog: comentario,
                            fechaCierreBacklog: new Date().toISOString()
                        });
                        if (window.UI && UI.mostrarToast) UI.mostrarToast("¡Orden de trabajo cerrada con éxito!", "exito");
                        modal.remove();
                        renderizarModuloAnalisis(idFirebase, contenedorId);
                    } catch (err) { console.error(err); }
                });
            });
        });

        document.getElementById('btn-nuevo-informe').addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = 'modal-confirmacion-nuevo-informe';
            let modalConfirm = document.getElementById(modalId);
            if (modalConfirm) modalConfirm.remove();

            modalConfirm = document.createElement('div');
            modalConfirm.id = modalId;
            modalConfirm.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center;";
            modalConfirm.innerHTML = `
                <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; width: 500px; max-width: 90%; padding: 25px; color: #f8fafc; font-family: sans-serif;">
                    <h3 style="margin-top: 0; color: #f59e0b;">¿Iniciar un Nuevo Informe de Ciclo?</h3>
                    <p style="color: #94a3b8; font-size: 0.9rem;">Se archivará una copia congelada y se limpiarán los espectros actuales.</p>
                    <div style="text-align: right; margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="btn-cancelar-nuevo" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 7px 14px; border-radius: 6px; cursor: pointer;">Cancelar</button>
                        <button id="btn-confirmar-nuevo" style="background: #f59e0b; color: #0f172a; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">Sí, Archivar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalConfirm);

            document.getElementById('btn-cancelar-nuevo').addEventListener('click', () => modalConfirm.remove());
            document.getElementById('btn-confirmar-nuevo').addEventListener('click', async () => {
                const snapActual = await db.ref(`activos_criticos/${idFirebase}`).once('value');
                const equipoData = snapActual.val();
                if (equipoData) {
                    await db.ref(`historial_informes/${idFirebase}`).push({ fechaCierre: new Date().toISOString(), datos: equipoData });
                    const spotsLimpios = equipoData.spots || {};
                    Object.keys(spotsLimpios).forEach(sKey => {
                        spotsLimpios[sKey].espectrogramas = null;
                        spotsLimpios[sKey].espectrogramaBase64 = null;
                    });
                    await db.ref(`activos_criticos/${idFirebase}/spots`).set(spotsLimpios);
                    if (window.UI && UI.mostrarToast) UI.mostrarToast("¡Informe archivado!", "exito");
                    modalConfirm.remove();
                    renderizarModuloAnalisis(idFirebase, contenedorId);
                }
            });
        });

        // SUBIR ESPECTROS
        document.querySelectorAll('.btn-subir-espectro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const sKey = e.currentTarget.getAttribute('data-spot');
                const inputFile = contenedor.querySelector(`.input-file-espectro[data-spot="${sKey}"]`);
                if (!inputFile) return;

                inputFile.click();
                inputFile.onchange = async (evt) => {
                    const files = Array.from(evt.target.files);
                    if (files.length === 0) return;

                    const modalCargaId = 'modal-cargando-espectro';
                    let modalCarga = document.getElementById(modalCargaId);
                    if (modalCarga) modalCarga.remove();

                    modalCarga = document.createElement('div');
                    modalCarga.id = modalCargaId;
                    modalCarga.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px); font-family: sans-serif;";
                    modalCarga.innerHTML = `<div style="background: #0f172a; padding: 30px; border-radius: 12px; color: white; text-align: center;"><h3 style="color: #38bdf8;">Procesando WebP...</h3></div>`;
                    document.body.appendChild(modalCarga);

                    try {
                        const snapshotRef = await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}/espectrogramas`).once('value');
                        let espectrosActuales = snapshotRef.val() || [];
                        if (!Array.isArray(espectrosActuales)) espectrosActuales = [espectrosActuales];

                        for (const file of files) {
                            const webpBase64 = await comprimirImagenWebP(file, 1280, 0.82);
                            espectrosActuales.push(webpBase64);
                        }

                        await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}/espectrogramas`).set(espectrosActuales);
                        modalCarga.remove();
                        renderizarModuloAnalisis(idFirebase, contenedorId);
                    } catch (err) { if (modalCarga) modalCarga.remove(); }
                };
            });
        });

        document.querySelectorAll('.btn-eliminar-espectro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const sKey = e.currentTarget.getAttribute('data-spot');
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                const snapshotRef = await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}/espectrogramas`).once('value');
                let espectrosActuales = snapshotRef.val() || [];
                if (Array.isArray(espectrosActuales)) {
                    espectrosActuales.splice(index, 1);
                    await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}/espectrogramas`).set(espectrosActuales);
                    renderizarModuloAnalisis(idFirebase, contenedorId);
                }
            });
        });

        document.querySelectorAll('.btn-guardar-analisis-spot').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const sKey = e.currentTarget.getAttribute('data-spot');
                await db.ref(`activos_criticos/${idFirebase}/spots/${sKey}`).update({
                    analisisAnalista: contenedor.querySelector(`.input-analisis-analista[data-spot="${sKey}"]`).value.trim(),
                    recomendacionAnalista: contenedor.querySelector(`.input-rec-analista[data-spot="${sKey}"]`).value.trim(),
                    avisosTexto: contenedor.querySelector(`.input-avisos-multiples[data-spot="${sKey}"]`).value.trim(),
                    numeroOM: contenedor.querySelector(`.input-om-sap[data-spot="${sKey}"]`).value.trim()
                });
                if (window.UI && UI.mostrarToast) UI.mostrarToast("Guardado.", "exito");
            });
        });

        document.getElementById('btn-generar-resumen-sap').addEventListener('click', async (e) => {
            e.preventDefault();
            const snap = await db.ref(`activos_criticos/${idFirebase}`).once('value');
            if (snap.exists()) mostrarInformeEspectralCPF(snap.val());
        });
    });
}

// ---------------------------------------------------------
// MODAL: LÍNEA DE TIEMPO
// ---------------------------------------------------------
async function abrirModalTimeline(idFirebase, eqActual) {
    const modalId = 'modal-timeline-eventos';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center;";
    document.body.appendChild(modal);

    modal.innerHTML = `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; width: 800px; max-width: 94%; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; font-family: sans-serif;">
            <div style="background: #1e293b; padding: 18px 25px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #f8fafc; font-size: 1.05rem;">Línea de Tiempo - ${eqActual.tag}</h3>
                <button type="button" id="cerrar-modal-timeline" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1.4rem;">×</button>
            </div>
            <div id="cuerpo-timeline-lista" style="padding: 25px; overflow-y: auto; flex-grow: 1;">
                <p style="color: #94a3b8; text-align: center;">Cargando...</p>
            </div>
        </div>
    `;

    document.getElementById('cerrar-modal-timeline').addEventListener('click', () => modal.remove());

    const eventos = [];
    const snapHist = await db.ref(`historial_informes/${idFirebase}`).once('value');
    if (snapHist.exists()) {
        Object.values(snapHist.val()).forEach(item => {
            eventos.push({ fecha: new Date(item.fechaCierre), titulo: 'Cierre de Ciclo', detalle: 'Informe archivado.', badgeColor: '#c084fc', icono: 'history_edu' });
        });
    }

    const spots = eqActual.spots || {};
    Object.values(spots).forEach(s => {
        if (s.backlogEstado === 'efectivo' && s.fechaCierreBacklog) {
            eventos.push({ fecha: new Date(s.fechaCierreBacklog), titulo: `OM Validada: ${s.numeroOM}`, detalle: `Componente [${s.punto}] ${s.componente}. RMS post: ${s.rmsPostIntervencion} mm/s`, badgeColor: '#34d399', icono: 'task_alt' });
        }
    });

    eventos.sort((a, b) => b.fecha - a.fecha);
    const cuerpo = document.getElementById('cuerpo-timeline-lista');
    if (eventos.length === 0) {
        cuerpo.innerHTML = `<p style="color: #64748b; text-align: center;">Sin eventos.</p>`;
        return;
    }

    let html = `<div style="position: relative; padding-left: 30px; border-left: 2px solid #334155;">`;
    eventos.forEach(ev => {
        html += `
            <div style="position: relative; margin-bottom: 20px;">
                <div style="position: absolute; left: -43px; top: 0; background: ${ev.badgeColor}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #0f172a; font-size: 12px;">✓</div>
                <div style="background: #1e293b; padding: 12px; border-radius: 8px;">
                    <strong style="color: white; font-size: 0.9rem;">${ev.titulo}</strong>
                    <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 0.8rem;">${ev.detalle}</p>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    cuerpo.innerHTML = html;
}

// ---------------------------------------------------------
// MODAL: BITÁCORA HISTÓRICA DE INFORMES (SNAPSHOTS)
// ---------------------------------------------------------
async function abrirModalBitacoraHistorica(idFirebase, eqActual) {
    const modalId = 'modal-bitacora-historica';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99998; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px);";
    document.body.appendChild(modal);

    modal.innerHTML = `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; width: 780px; max-width: 94%; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); overflow: hidden; font-family: sans-serif;">
            <div style="background: #1e293b; padding: 18px 25px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="material-symbols-outlined" style="color: #c084fc; font-size: 30px;">history_edu</span>
                    <div>
                        <h3 style="margin: 0; color: #f8fafc; font-size: 1.05rem;">Bitácora Histórica de Informes Espectrales</h3>
                        <p style="margin: 3px 0 0 0; color: #94a3b8; font-size: 0.8rem;">Activo: <b style="color: #38bdf8;">${eqActual.tag}</b> - ${eqActual.nombre}</p>
                    </div>
                </div>
                <button type="button" id="cerrar-modal-bitacora" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1.4rem;"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div id="cuerpo-bitacora-lista" style="padding: 20px 25px; overflow-y: auto; flex-grow: 1;">
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 32px; color: #c084fc;">autorenew</span>
                    <p style="margin-top: 10px;">Consultando archivo histórico en Firebase...</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('cerrar-modal-bitacora').addEventListener('click', () => modal.remove());

    try {
        const snapHist = await db.ref(`historial_informes/${idFirebase}`).once('value');
        const cuerpo = document.getElementById('cuerpo-bitacora-lista');
        if (!cuerpo) return;

        if (!snapHist.exists()) {
            cuerpo.innerHTML = `
                <div style="text-align: center; padding: 45px 20px; color: #64748b;">
                    <span class="material-symbols-outlined" style="font-size: 48px; color: #475569;">folder_off</span>
                    <h4 style="color: #cbd5e1; margin: 12px 0 5px 0;">Sin Informes Históricos Archivados</h4>
                    <p style="font-size: 0.85rem; margin: 0;">Cuando presiones el botón <b>"Nuevo Informe"</b>, se guardará aquí una copia congelada con sus espectros y diagnósticos.</p>
                </div>
            `;
            return;
        }

        const registrosObj = snapHist.val();
        const listaInformes = Object.keys(registrosObj).map(key => ({
            idSnapshot: key,
            ...registrosObj[key]
        })).sort((a, b) => new Date(b.fechaCierre) - new Date(a.fechaCierre));

        let filasHtml = '';
        listaInformes.forEach((item, idx) => {
            const fechaObj = new Date(item.fechaCierre);
            const fechaFormateada = fechaObj.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const horaFormateada = fechaObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
            const numInforme = listaInformes.length - idx;

            filasHtml += `
                <div style="background: #1e293b; border: 1px solid #334155; border-left: 4px solid #c084fc; border-radius: 8px; padding: 14px 18px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="background: #334155; color: #e2e8f0; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 4px;">Ciclo #${numInforme}</span>
                            <strong style="color: #f8fafc; font-size: 0.95rem;">📅 ${fechaFormateada} — ${horaFormateada} hrs</strong>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button type="button" class="btn-ver-snapshot-sap" data-snap-id="${item.idSnapshot}" style="background: #0284c7; color: white; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">Abrir PDF Histórico</button>
                    </div>
                </div>
            `;
        });

        cuerpo.innerHTML = filasHtml;

        cuerpo.querySelectorAll('.btn-ver-snapshot-sap').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const snapId = e.currentTarget.getAttribute('data-snap-id');
                const registro = registrosObj[snapId];
                if (registro && registro.datos) {
                    mostrarInformeEspectralCPF(registro.datos, `Histórico`);
                }
            });
        });
    } catch (err) {
        console.error(err);
    }
}

// ---------------------------------------------------------
// INFORME SAP
// ---------------------------------------------------------
function mostrarInformeEspectralCPF(eq, etiquetaFechaPersonalizada = null) {
    const spots = eq.spots || {};
    let htmlAccionamientos = '';
    let htmlPoleas = '';
    let componentesConDatos = 0;

    Object.values(spots).forEach(s => {
        const analisis = (s.analisisAnalista || '').trim();
        const recomendacion = (s.recomendacionAnalista || '').trim();
        const om = (s.numeroOM || '').trim();
        const avisosTexto = (s.avisosTexto || '').trim();
        const espectros = Array.isArray(s.espectrogramas) ? s.espectrogramas : (s.espectrogramaBase64 ? [s.espectrogramaBase64] : []);

        if (!analisis && !recomendacion && !om && !avisosTexto && espectros.length === 0) return;

        componentesConDatos++;
        const esPolea = (s.punto || '').toUpperCase().includes('PL') || (s.componente || '').toLowerCase().includes('polea');
        
        let imagenesHtml = '';
        espectros.forEach(img => {
            imagenesHtml += `<img src="${img}" style="max-height: 100px; border-radius: 4px; border: 1px solid #cbd5e1; margin-right: 6px; margin-bottom: 6px; object-fit: contain;">`;
        });

        const tarjetaHtml = `
            <div style="background: #ffffff; color: #1e293b; border: 1px solid #cbd5e1; padding: 15px; border-radius: 6px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
                    <strong>[${s.punto}] ${s.componente}</strong>
                    <span style="font-size: 0.75rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">OM: ${om || 'Pendiente'}</span>
                </div>
                ${analisis ? `<p style="font-size: 0.85rem; color: #334155; margin: 0 0 6px 0;"><b>Análisis:</b><br>${analisis}</p>` : ''}
                ${recomendacion ? `<p style="font-size: 0.85rem; color: #047857; margin: 0 0 6px 0;"><b>Recomendación:</b><br>${recomendacion}</p>` : ''}
                ${imagenesHtml ? `<div style="margin-top: 8px; display: flex; flex-wrap: wrap;">${imagenesHtml}</div>` : ''}
            </div>
        `;

        if (esPolea) htmlPoleas += tarjetaHtml;
        else htmlAccionamientos += tarjetaHtml;
    });

    let modalResumen = document.getElementById('modal-resumen-sap');
    if (!modalResumen) {
        modalResumen = document.createElement('div');
        modalResumen.id = 'modal-resumen-sap';
        modalResumen.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center;";
        document.body.appendChild(modalResumen);
    }

    modalResumen.innerHTML = `
        <div style="background: #f8fafc; color: #1e293b; border-radius: 12px; width: 900px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;">
            <div style="background: #0f172a; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #38bdf8;">Informe Espectral CBM - ${eq.tag} (${etiquetaFechaPersonalizada || 'Actual'})</h3>
                <button type="button" id="cerrar-modal-sap" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1.4rem;"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div style="padding: 25px 30px; overflow-y: auto; flex-grow: 1;">
                ${htmlAccionamientos}
                ${htmlPoleas}
            </div>
            <div style="padding: 12px 30px; border-top: 1px solid #cbd5e1; text-align: right; background: #e2e8f0;">
                <button type="button" onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 20px; font-weight: bold; border-radius: 4px; cursor: pointer;">Imprimir / PDF</button>
            </div>
        </div>
    `;

    document.getElementById('cerrar-modal-sap').addEventListener('click', () => modalResumen.remove());
}
