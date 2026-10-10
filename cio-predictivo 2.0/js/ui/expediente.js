// ==========================================
// MÓDULO UI: EXPEDIENTE (INSPECCIÓN, CONFIGURACIÓN Y TENDENCIAS)
// ==========================================
import { db } from '../core/firebase-config.js';
import { generarPDFExpediente } from '../core/reportes.js';

let chartInstancia = null; // Variable para controlar la instancia del gráfico

// --- DICCIONARIO DE PLANTILLAS CBM ---
const motorGen = [ { punto: 'M1', comp: 'Motor NDE (Lado Libre)' }, { punto: 'M2', comp: 'Motor DE (Lado Carga)' } ];
const pChancador = [ ...motorGen, { punto: 'C1', comp: 'Contraeje NDE' }, { punto: 'C2', comp: 'Contraeje DE' } ];
const pTransportador = [ ...motorGen ];
for (let i = 1; i <= 10; i++) pTransportador.push({ punto: `G${i}`, comp: `Reductor Punto ${i}` });
for (let i = 1; i <= 11; i++) {
    pTransportador.push({ punto: `PL${i}_LI`, comp: `Polea ${i} Lado Izq` });
    pTransportador.push({ punto: `PL${i}_LD`, comp: `Polea ${i} Lado Der` });
}
const pColector = [ ...motorGen, { punto: 'D1', comp: 'Descanso 1' }, { punto: 'D2', comp: 'Descanso 2' }, { punto: 'D3', comp: 'Descanso 3' } ];
const pAlimentador = [ ...motorGen, { punto: 'D1', comp: 'Descanso 1' }, { punto: 'D2', comp: 'Descanso 2' } ];
const pHarneroSec = [ ...motorGen, { punto: 'D1', comp: 'Descanso 1' }, { punto: 'D2', comp: 'Descanso 2' }, { punto: 'D3', comp: 'Descanso 3' }, { punto: 'D4', comp: 'Descanso 4' } ];
const pTripper = [ ...motorGen ];
for (let i = 1; i <= 10; i++) pTripper.push({ punto: `G${i}`, comp: `Reductor Punto ${i}` });
for (let i = 1; i <= 2; i++) {
    pTripper.push({ punto: `PL${i}_LI`, comp: `Polea ${i} Lado Izq` });
    pTripper.push({ punto: `PL${i}_LD`, comp: `Polea ${i} Lado Der` });
}
const pPrensa = [ ...motorGen, { punto: 'G1', comp: 'Reductor G1' }, { punto: 'C1', comp: 'Reductor C1' }, { punto: 'C2', comp: 'Reductor C2' }, { punto: 'D1', comp: 'Descanso' } ];
const pHarneroTer = [
    ...motorGen, { punto: 'D1', comp: 'Descanso 1' }, { punto: 'D2', comp: 'Descanso 2' },
    { punto: 'EX_LM_SUP', comp: 'Ex. Motriz Sup' }, { punto: 'EX_LM_INF', comp: 'Ex. Motriz Inf' },
    { punto: 'EX_LF_SUP', comp: 'Ex. Flotante Sup' }, { punto: 'EX_LF_INF', comp: 'Ex. Flotante Inf' }
];
const pBeltFeeder = [
    ...motorGen, { punto: 'P1', comp: 'Bomba P1' }, { punto: 'P2', comp: 'Bomba P2' },
    { punto: 'MH1', comp: 'Motor Hidráulico NDE' }, { punto: 'MH2', comp: 'Motor Hidráulico DE' }
];
for (let i = 1; i <= 2; i++) {
    pBeltFeeder.push({ punto: `PL${i}_LI`, comp: `Polea ${i} Lado Izq` });
    pBeltFeeder.push({ punto: `PL${i}_LD`, comp: `Polea ${i} Lado Der` });
}
const PLANTILLAS_CBM = {
    chancador: pChancador, transportador: pTransportador, colector: pColector, alimentador: pAlimentador,
    harneroSec: pHarneroSec, tripper: pTripper, prensa: pPrensa, harneroTer: pHarneroTer, beltFeeder: pBeltFeeder
};

function obtenerPlantilla(tipoStr) {
    const t = (tipoStr || '').toLowerCase();
    if (t.includes('terciario') || t.includes('exitatriz')) return PLANTILLAS_CBM.harneroTer;
    if (t.includes('harnero') || t.includes('criba')) return PLANTILLAS_CBM.harneroSec; 
    if (t.includes('transportador') || t.includes('correa overland')) return PLANTILLAS_CBM.transportador;
    if (t.includes('tripper')) return PLANTILLAS_CBM.tripper;
    if (t.includes('belt feeder') || t.includes('beltfeeder')) return PLANTILLAS_CBM.beltFeeder;
    if (t.includes('prensa') || t.includes('rodillo')) return PLANTILLAS_CBM.prensa;
    if (t.includes('colector') || t.includes('polvo')) return PLANTILLAS_CBM.colector;
    if (t.includes('alimentador') || t.includes('vibratorio')) return PLANTILLAS_CBM.alimentador;
    if (t.includes('chancador') || t.includes('trituradora')) return PLANTILLAS_CBM.chancador;
    return null;
}

// ---------------------------------------------------------
// 2. RENDERIZADO DEL EXPEDIENTE
// ---------------------------------------------------------
export function renderizarExpediente(idFirebase, contenedorId, forzarConfig = false) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    if (idFirebase === 'NUEVO') {
        const eqVacio = { tag: '', nombre: '', tipo_equipo: '', area: '', severidad: 'verde', estado: 'verde', spots: {} };
        construirPanelConfiguracion(`eq_${Date.now()}`, eqVacio, contenedor, true);
        return;
    }

    contenedor.innerHTML = `<div style="padding: 60px; text-align: center; color: var(--primary-blue);"><span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 40px;">autorenew</span></div>`;

    db.ref(`activos_criticos/${idFirebase}`).once('value').then(snapshot => {
        if (!snapshot.exists()) return contenedor.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--iso-zona-d);">El equipo no existe.</div>';
        
        if (forzarConfig) {
            construirPanelConfiguracion(idFirebase, snapshot.val(), contenedor, false);
        } else {
            construirPanelInspeccion(idFirebase, snapshot.val(), contenedor);
        }
    });
}

// ---------------------------------------------------------
// 3. VISTA DE INSPECCIÓN (INGRESO + MODAL DE TENDENCIAS)
// ---------------------------------------------------------
function construirPanelInspeccion(idFirebase, eq, contenedor) {
    let spotsHTML = '';
    const spotsObj = eq.spots || {};
    let spotsArray = Object.keys(spotsObj).map(k => ({ idInterno: k, ...spotsObj[k] }));
    const plantilla = obtenerPlantilla(eq.tipo_equipo);

    spotsArray.sort((a, b) => {
        let iA = plantilla ? plantilla.findIndex(p => p.punto === a.punto) : -1;
        let iB = plantilla ? plantilla.findIndex(p => p.punto === b.punto) : -1;
        if (iA === -1) iA = 9999; if (iB === -1) iB = 9999;
        return (iA !== iB) ? iA - iB : (a.punto || '').localeCompare(b.punto || '', undefined, {numeric: true});
    });

    if (spotsArray.length === 0) {
        spotsHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No hay puntos de medición. Ve a Configuración.</td></tr>';
    } else {
        spotsArray.forEach(s => {
            const rmsAnterior = parseFloat(s.rms || 0).toFixed(2);
            let colorAnterior = 'var(--iso-zona-a)';
            if (rmsAnterior >= 7.1) colorAnterior = 'var(--iso-zona-d)';
            else if (rmsAnterior >= 4.5) colorAnterior = 'var(--iso-zona-c)';
            else if (rmsAnterior >= 2.8) colorAnterior = 'var(--iso-zona-b)';

            const fechaAnterior = s.ultima_medicion ? s.ultima_medicion.replace('T', ' ') : 'Sin registro';

            spotsHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td><strong>${s.punto}</strong></td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${s.componente}</td>
                    <td>
                        <div style="font-size: 0.9rem; color: ${colorAnterior}; font-weight: bold;">${rmsAnterior} mm/s</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">${fechaAnterior}</div>
                    </td>
                    <td>
                        <input type="number" step="0.01" class="input-lectura-hoy" data-spot="${s.idInterno}" placeholder="0.00" 
                        style="width: 80px; padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline:none; text-align: right;">
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-icon btn-ver-tendencia" data-spot-id="${s.idInterno}" data-punto-nombre="${s.punto} - ${s.componente}" title="Ver Gráfico de Tendencia" style="color: var(--primary-blue); cursor:pointer; background:transparent; border:none;">
                            <span class="material-symbols-outlined">monitoring</span>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    const ahora = new Date();
    const fechaHoraActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}T${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-glass); padding-bottom: 15px;">
                <div>
                    <h3 style="color: var(--primary-blue);">Inspección CBM: ${eq.tag}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">${eq.nombre} | ${eq.area}</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-modo-config" class="btn-topbar" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: rgba(255, 255, 255, 0.1);">
                        <span class="material-symbols-outlined">settings</span> Configurar Máquina
                    </button>
                    <button id="btn-exportar-pdf" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);">
                        <span class="material-symbols-outlined">picture_as_pdf</span> PDF
                    </button>
                </div>
            </div>

            <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="color: var(--text-main); font-size: 1rem; display: flex; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="color: var(--primary-blue);">speed</span> Ingreso de Ruta de Terreno
                    </h4>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="font-size: 0.8rem; color: var(--text-muted);">Fecha y Hora:</label>
                        <input type="datetime-local" id="fecha-inspeccion" value="${fechaHoraActual}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                    </div>
                </div>

                <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-glass); border-radius: 6px; margin-bottom: 15px;">
                    <table class="tabla-cbm" style="margin-top: 0; border-bottom: none;">
                        <thead style="position: sticky; top: 0; z-index: 1;">
                            <tr><th>Punto</th><th>Componente</th><th>Lectura Anterior</th><th>Ingresar Hoy (mm/s)</th><th>Gráfico</th></tr>
                        </thead>
                        <tbody>${spotsHTML}</tbody>
                    </table>
                </div>

                <div style="text-align: right;">
                    <button id="btn-guardar-ruta" class="btn-topbar" style="background: rgba(56, 189, 248, 0.15); color: var(--primary-blue); border-color: rgba(56, 189, 248, 0.4); font-size: 0.9rem; padding: 8px 20px;">
                        <span class="material-symbols-outlined">save</span> Guardar Mediciones
                    </button>
                </div>
            </div>
        </div>
    `;

    // --- EVENTOS ---
    document.getElementById('btn-modo-config').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, true));
    document.getElementById('btn-exportar-pdf').addEventListener('click', () => generarPDFExpediente(eq.tag, contenedor.id));

    // Abrir Modal de Gráfico al hacer clic en el botón de monitoreo
    document.querySelectorAll('.btn-ver-tendencia').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const spotId = e.currentTarget.getAttribute('data-spot-id');
            const puntoNombre = e.currentTarget.getAttribute('data-punto-nombre');
            const historialSpot = spotsObj[spotId]?.historial || {};
            
            abrirModalTendencia(puntoNombre, historialSpot);
        });
    });

    document.getElementById('btn-guardar-ruta').addEventListener('click', async () => {
        const fechaHoraRuta = document.getElementById('fecha-inspeccion').value;
        if (!fechaHoraRuta) return alert("Indica la fecha y hora.");

        const inputs = document.querySelectorAll('.input-lectura-hoy');
        const updates = {};
        let ingresados = 0;
        let peorSeveridad = 'verde';

        inputs.forEach(input => {
            const val = input.value.trim();
            if (val !== '') {
                const num = parseFloat(val);
                const spotId = input.getAttribute('data-spot');
                
                updates[`spots/${spotId}/rms`] = num;
                updates[`spots/${spotId}/ultima_medicion`] = fechaHoraRuta;

                const timestampKey = new Date(fechaHoraRuta).getTime() + "_" + Math.floor(Math.random() * 1000);
                updates[`spots/${spotId}/historial/${timestampKey}`] = { valor: num, fechaHora: fechaHoraRuta };
                
                ingresados++;

                if (num >= 7.1) peorSeveridad = 'rojo';
                else if (num >= 4.5 && peorSeveridad !== 'rojo') peorSeveridad = 'naranja';
                else if (num >= 2.8 && peorSeveridad === 'verde') peorSeveridad = 'amarillo';
            }
        });

        if (ingresados === 0) return alert("No ingresaste ningún valor.");

        const btn = document.getElementById('btn-guardar-ruta');
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span>`;

        updates['estado'] = peorSeveridad;
        updates['severidad'] = peorSeveridad;
        updates['ultimaEdicion'] = Date.now();

        try {
            await db.ref(`activos_criticos/${idFirebase}`).update(updates);
            btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> ¡Guardado!`;
            setTimeout(() => renderizarExpediente(idFirebase, contenedor.id), 1200);
        } catch (error) {
            alert("Error al guardar.");
            btn.innerHTML = `<span class="material-symbols-outlined">save</span> Guardar Mediciones`;
        }
    });
}

// ---------------------------------------------------------
// 4. FUNCIONALIDAD DEL MODAL Y GRÁFICO (CHART.JS CON BANDAS DE FONDO ISO 20816-3)
// ---------------------------------------------------------
function abrirModalTendencia(puntoNombre, historialObj) {
    const modal = document.getElementById('modal-tendencia');
    const titulo = document.getElementById('modal-titulo-punto');
    const btnCerrar = document.getElementById('btn-cerrar-modal');
    
    titulo.textContent = `Tendencia Histórica & Bandas ISO: ${puntoNombre}`;
    modal.style.display = 'flex';

    // Procesar datos del historial de Firebase
    const historialArray = Object.values(historialObj).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));
    
    const labels = historialArray.map(h => h.fechaHora ? h.fechaHora.replace('T', ' ') : 'Desconocida');
    const valores = historialArray.map(h => h.valor);

    // Encontrar el valor máximo para ajustar la escala Y del gráfico automáticamente, 
    // asegurando que siempre se alcance a ver la zona roja (al menos hasta 9 o 10 mm/s)
    const maxValorDatos = Math.max(...valores, 0);
    const maxYScale = Math.max(10, Math.ceil(maxValorDatos * 1.2)); 

    const ctx = document.getElementById('chartTendenciaSpot').getContext('2d');

    if (chartInstancia) {
        chartInstancia.destroy();
    }

    // PLUGIN PERSONALIZADO PARA DIBUJAR LAS FRANJAS ISO EN EL FONDO
    const bandasISOPlugin = {
        id: 'bandasISOPlugin',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { left, right, width }, scales: { y } } = chart;
            if (!y) return;

            ctx.save();

            // Definición de las zonas ISO 20816-3 (Límites en mm/s)
            // Zona A (Verde): 0 a 2.8
            // Zona B (Amarillo): 2.8 a 4.5
            // Zona C (Naranja): 4.5 a 7.1
            // Zona D (Rojo): 7.1 en adelante
            const zonas = [
                { yMin: 0,   yMax: 2.8, color: 'rgba(16, 185, 129, 0.08)' },  // Verde suave
                { yMin: 2.8, yMax: 4.5, color: 'rgba(234, 179, 8, 0.08)' },   // Amarillo suave
                { yMin: 4.5, yMax: 7.1, color: 'rgba(249, 115, 22, 0.08)' },  // Naranja suave
                { yMin: 7.1, yMax: maxYScale, color: 'rgba(239, 68, 68, 0.08)' } // Rojo suave
            ];

            zonas.forEach(zona => {
                const yTop = y.getPixelForValue(Math.min(zona.yMax, maxYScale));
                const yBottom = y.getPixelForValue(zona.yMin);

                // Evitar dibujar si se sale del área visible
                if (yTop < y.bottom && yBottom > y.top) {
                    ctx.fillStyle = zona.color;
                    ctx.fillRect(left, Math.max(yTop, y.top), width, Math.min(yBottom, y.bottom) - Math.max(yTop, y.top));
                }
            });

            ctx.restore();
        }
    };

    chartInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['Sin datos'],
            datasets: [{
                label: 'RMS (mm/s)',
                data: valores.length > 0 ? valores : [0],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                borderWidth: 2,
                pointBackgroundColor: valores.map(v => v >= 7.1 ? '#ef4444' : v >= 4.5 ? '#f97316' : v >= 2.8 ? '#eab308' : '#10b981'),
                pointBorderColor: '#ffffff',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            let zona = "Zona A (Normal)";
                            if (val >= 7.1) zona = "Zona D (¡Alarma Crítica!)";
                            else if (val >= 4.5) zona = "Zona C (Operación Restringida)";
                            else if (val >= 2.8) zona = "Zona B (En Observación)";
                            return ` RMS: ${val} mm/s — ${zona}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    beginAtZero: true,
                    max: maxYScale
                }
            }
        },
        plugins: [bandasISOPlugin] // Activamos el plugin de fondo
    });

    const cerrar = () => {
        modal.style.display = 'none';
        btnCerrar.removeEventListener('click', cerrar);
    };
    btnCerrar.addEventListener('click', cerrar);
}

// ---------------------------------------------------------
// 5. VISTA DE CONFIGURACIÓN (ADMINISTRADOR)
// ---------------------------------------------------------
function construirPanelConfiguracion(idFirebase, eq, contenedor, esNuevo) {
    let spotsHTML = '';
    const spotsObj = eq.spots || {};
    let spotsArray = Object.keys(spotsObj).map(k => ({ idInterno: k, ...spotsObj[k] }));
    const plantilla = obtenerPlantilla(eq.tipo_equipo);

    spotsArray.sort((a, b) => {
        let iA = plantilla ? plantilla.findIndex(p => p.punto === a.punto) : -1;
        let iB = plantilla ? plantilla.findIndex(p => p.punto === b.punto) : -1;
        if (iA === -1) iA = 9999; if (iB === -1) iB = 9999;
        return (iA !== iB) ? iA - iB : (a.punto || '').localeCompare(b.punto || '', undefined, {numeric: true});
    });

    if (spotsArray.length === 0) {
        spotsHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:0.8rem;">No hay puntos configurados.</td></tr>';
    } else {
        spotsArray.forEach(s => {
            spotsHTML += `
                <tr>
                    <td><strong>${s.punto}</strong></td>
                    <td>${s.componente}</td>
                    <td style="color: var(--primary-blue); font-weight: bold;">${s.rms || '0.00'} mm/s</td>
                    <td style="text-align: right;">
                        <button class="btn-icon btn-eliminar-spot" data-spot="${s.idInterno}" data-punto="${s.punto}" title="Eliminar">
                            <span class="material-symbols-outlined" style="color:var(--iso-zona-d); font-size:1.1rem;">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
    const tituloPanel = esNuevo ? '✨ Creación de Nuevo Equipo' : `⚙️ Configuración: ${eq.tag || idFirebase}`;

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-glass); padding-bottom: 15px;">
                <div>
                    <h3 style="color: var(--text-main);">${tituloPanel}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Edición de parámetros y matriz CBM.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    ${!esNuevo ? `<button id="btn-modo-inspeccion" class="btn-topbar" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: rgba(255, 255, 255, 0.1);"><span class="material-symbols-outlined">speed</span> Inspección</button>` : ''}
                    <button id="btn-guardar-equipo" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);"><span class="material-symbols-outlined">${esNuevo ? 'add_circle' : 'save'}</span> ${esNuevo ? 'Crear Equipo' : 'Guardar'}</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px;">
                <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                    <h4 style="margin-bottom: 15px; font-size: 0.9rem;">Información General</h4>
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 0.75rem; color: var(--text-muted);">TAG</label>
                        <input type="text" id="edit-tag" value="${eq.tag || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;" ${esNuevo ? 'placeholder="Obligatorio"' : ''}>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Descripción</label>
                        <input type="text" id="edit-nombre" value="${eq.nombre || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Tipo Máquina</label>
                        <input type="text" id="edit-tipo" value="${eq.tipo_equipo || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                    </div>
                    <div style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Ubicación</label>
                            <input type="text" id="edit-area" value="${eq.area || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Estado</label>
                            <select id="edit-severidad" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none; cursor: pointer;">
                                <option value="verde" ${sev==='verde'?'selected':''}>Verde</option>
                                <option value="amarillo" ${sev==='amarillo'?'selected':''}>Amarillo</option>
                                <option value="naranja" ${sev==='naranja'?'selected':''}>Naranja</option>
                                <option value="rojo" ${(sev==='rojo'||sev==='critico')?'selected':''}>Rojo</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="font-size: 0.9rem;">Estructura de Medición</h4>
                        <button id="btn-cargar-plantilla" class="btn-topbar" style="font-size: 0.7rem; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border-color: rgba(56, 189, 248, 0.3);">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">account_tree</span> Autocompletar
                        </button>
                    </div>
                    
                    <div style="display: flex; gap: 8px; margin-bottom: 15px; background: var(--bg-card); padding: 12px; border-radius: 6px;">
                        <input type="text" id="nuevo-spot-punto" placeholder="Punto" style="width: 30%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; font-size:0.8rem;">
                        <input type="text" id="nuevo-spot-comp" placeholder="Componente" style="width: 50%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; font-size:0.8rem;">
                        <button id="btn-add-spot" style="width: 20%; background: var(--primary-blue); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size:0.8rem;">Añadir</button>
                    </div>

                    <div style="max-height: 220px; overflow-y: auto; border: 1px solid var(--border-glass); border-radius: 6px;">
                        <table class="tabla-cbm" style="margin-top: 0; border-bottom: none;">
                            <thead style="position: sticky; top: 0; z-index: 1;">
                                <tr><th>Punto</th><th>Componente</th><th>RMS</th><th></th></tr>
                            </thead>
                            <tbody>${spotsHTML}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (!esNuevo) {
        document.getElementById('btn-modo-inspeccion').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, false));
    }

    document.getElementById('btn-cargar-plantilla').addEventListener('click', async () => {
        const tipoStr = document.getElementById('edit-tipo').value;
        const plantillaSeleccionada = obtenerPlantilla(tipoStr);
        if (!plantillaSeleccionada) return alert(`No detecté plantilla para: "${tipoStr}".`);
        
        const puntosExistentes = spotsArray.map(s => s.punto);
        const puntosFaltantes = plantillaSeleccionada.filter(spot => !puntosExistentes.includes(spot.punto));
        if (puntosFaltantes.length === 0) return alert("✅ Ya están todos los puntos estándar.");

        if(confirm(`Se insertarán ${puntosFaltantes.length} punto(s). ¿Continuar?`)) {
            const updates = {};
            puntosFaltantes.forEach((spot, i) => {
                updates[`spot_auto_${Date.now()}_${i}`] = { punto: spot.punto, componente: spot.comp, rms: 0.00 };
            });

            if (esNuevo) {
                Object.assign(eq.spots || (eq.spots = {}), updates);
                construirPanelConfiguracion(idFirebase, eq, contenedor, true);
            } else {
                await db.ref(`activos_criticos/${idFirebase}/spots`).update(updates);
                renderizarExpediente(idFirebase, contenedor.id, true);
            }
        }
    });

    document.getElementById('btn-guardar-equipo').addEventListener('click', async () => {
        const tagValue = document.getElementById('edit-tag').value.trim();
        if (!tagValue) return alert("El TAG es obligatorio.");

        const nuevosDatos = {
            tag: tagValue, nombre: document.getElementById('edit-nombre').value,
            tipo_equipo: document.getElementById('edit-tipo').value, area: document.getElementById('edit-area').value,
            severidad: document.getElementById('edit-severidad').value, estado: document.getElementById('edit-severidad').value,
            ultimaEdicion: Date.now()
        };

        const idFinal = esNuevo ? tagValue.toUpperCase().replace(/\s+/g, '_') : idFirebase;
        await db.ref(`activos_criticos/${idFinal}`).update(nuevosDatos);
        if (esNuevo && eq.spots) await db.ref(`activos_criticos/${idFinal}/spots`).update(eq.spots);
        
        renderizarExpediente(idFinal, contenedor.id, false);
    });

    document.getElementById('btn-add-spot').addEventListener('click', async () => {
        const punto = document.getElementById('nuevo-spot-punto').value.trim();
        const comp = document.getElementById('nuevo-spot-comp').value.trim();
        if (!punto || !comp) return;
        const nuevoPunto = { punto: punto, componente: comp, rms: 0.00 };
        if (esNuevo) {
            eq.spots = eq.spots || {}; eq.spots[`spot_manual_${Date.now()}`] = nuevoPunto;
            construirPanelConfiguracion(idFirebase, eq, contenedor, true);
        } else {
            await db.ref(`activos_criticos/${idFirebase}/spots/spot_manual_${Date.now()}` ).set(nuevoPunto);
            renderizarExpediente(idFirebase, contenedor.id, true);
        }
    });

    document.querySelectorAll('.btn-eliminar-spot').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const spotKey = e.currentTarget.getAttribute('data-spot');
            const pBorrado = e.currentTarget.getAttribute('data-punto'); 
            const match = pBorrado.match(/^(G|PL)(\d+)(_LI|_LD)?/);
            let keysAEliminar = [spotKey];
            
            if (match) {
                const pre = match[1]; const num = parseInt(match[2]); 
                spotsArray.forEach(s => {
                    const m = s.punto.match(/^(G|PL)(\d+)/);
                    if (m && m[1] === pre && parseInt(m[2]) >= num && s.idInterno !== spotKey) keysAEliminar.push(s.idInterno);
                });
            }
            if (confirm(`¿Eliminar ${keysAEliminar.length > 1 ? 'este punto y sus subsecuentes' : 'este punto'}?`)) {
                if (esNuevo) {
                    keysAEliminar.forEach(k => delete eq.spots[k]);
                    construirPanelConfiguracion(idFirebase, eq, contenedor, true);
                } else {
                    const up = {}; keysAEliminar.forEach(k => up[k] = null);
                    await db.ref(`activos_criticos/${idFirebase}/spots`).update(up);
                    renderizarExpediente(idFirebase, contenedor.id, true);
                }
            }
        });
    });
}