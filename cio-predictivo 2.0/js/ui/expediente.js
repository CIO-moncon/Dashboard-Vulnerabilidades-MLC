// ==========================================
// MÓDULO UI: EXPEDIENTE (INSPECCIÓN, CONFIGURACIÓN, DATA ROOM Y MAPAS)
// ==========================================
import { db } from '../core/firebase-config.js';
import { generarPDFExpediente } from '../core/reportes.js';

let chartInstancia = null;
let miniMapaInstancia = null; // Caché para el mini-mapa interactivo

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
        const eqVacio = { tag: '', nombre: '', tipo_equipo: '', area: '', severidad: 'verde', estado: 'verde', spots: {}, latitud: '', longitud: '' };
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
// 3. VISTA DE INSPECCIÓN (OPERADOR)
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

    // Construcción de Miniaturas de la Galería
    const galeriaObj = eq.galeria || {};
    const galeriaKeys = Object.keys(galeriaObj);
    let miniaturaHeader = '';
    
    if (galeriaKeys.length > 0) {
        miniaturaHeader = `<div style="display:flex; gap:5px;">`;
        galeriaKeys.slice(0, 3).forEach(k => {
            miniaturaHeader += `<img src="${galeriaObj[k]}" style="width: 55px; height: 55px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">`;
        });
        if(galeriaKeys.length > 3) {
            miniaturaHeader += `<div style="width: 55px; height: 55px; border-radius: 6px; background: rgba(255,255,255,0.1); display:flex; justify-content:center; align-items:center; font-size:0.8rem; font-weight:bold; color:var(--text-main);">+${galeriaKeys.length - 3}</div>`;
        }
        miniaturaHeader += `</div>`;
    } else {
        miniaturaHeader = `<div style="width: 55px; height: 55px; border-radius: 6px; background: rgba(0,0,0,0.2); border: 1px dashed rgba(255,255,255,0.2); display: flex; justify-content: center; align-items: center;"><span class="material-symbols-outlined" style="color: var(--text-muted);">image</span></div>`;
    }

    // (Búscalo en construirPanelInspeccion)
    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; height: 100%; max-height: calc(100vh - 120px); padding: 0;">
            
            <!-- BARRA DE HERRAMIENTAS (SIEMPRE VISIBLE) -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); padding: 20px; background: var(--bg-card); border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 50; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <div style="display: flex; gap: 15px; align-items: center;">
                    ${miniaturaHeader}
                    <div>
                        <h3 style="color: var(--primary-blue); margin: 0;">Inspección CBM: ${eq.tag}</h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 5px 0 0 0;">${eq.nombre} | ${eq.area}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-modo-config" class="btn-topbar" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: rgba(255, 255, 255, 0.1);">
                        <span class="material-symbols-outlined">settings</span> Configurar Máquina
                    </button>
                    <button id="btn-exportar-pdf" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);">
                        <span class="material-symbols-outlined">picture_as_pdf</span> PDF
                    </button>
                    <button id="btn-cerrar-expediente" class="btn-icon" style="color: var(--text-muted); background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px; margin-left: 10px;" title="Cerrar y volver al Mapa">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            <!-- CONTENIDO DESLIZABLE (TABLA DE INSPECCIÓN) -->
            <div style="padding: 20px; overflow-y: auto; flex-grow: 1;">
                <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="color: var(--text-main); font-size: 1rem; display: flex; align-items: center; gap: 5px; margin: 0;">
                            <span class="material-symbols-outlined" style="color: var(--primary-blue);">speed</span> Ingreso de Ruta de Terreno
                        </h4>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 0.8rem; color: var(--text-muted);">Fecha y Hora:</label>
                            <input type="datetime-local" id="fecha-inspeccion" value="${fechaHoraActual}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                        </div>
                    </div>

                    <div style="border: 1px solid var(--border-glass); border-radius: 6px; margin-bottom: 15px;">
                        <table class="tabla-cbm" style="margin-top: 0; border-bottom: none; width: 100%;">
                            <thead style="background: rgba(0,0,0,0.2);">
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
        </div>
    `;

    document.getElementById('btn-modo-config').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, true));
    document.getElementById('btn-exportar-pdf').addEventListener('click', () => generarPDFExpediente(eq.tag, contenedor.id));
    
    // NUEVO EVENTO PARA CERRAR EL EXPEDIENTE
    document.getElementById('btn-cerrar-expediente').addEventListener('click', () => {
        document.getElementById('btn-volver-dashboard').click(); // Simulamos un clic en el logo para aprovechar la lógica de app.js
    });

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
        updates['estado'] = peorSeveridad; updates['severidad'] = peorSeveridad; updates['ultimaEdicion'] = Date.now();

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
// 4. FUNCIONALIDAD DEL MODAL Y GRÁFICO (CHART.JS)
// ---------------------------------------------------------
function abrirModalTendencia(puntoNombre, historialObj) {
    const modal = document.getElementById('modal-tendencia');
    const titulo = document.getElementById('modal-titulo-punto');
    const btnCerrar = document.getElementById('btn-cerrar-modal');
    
    titulo.textContent = `Tendencia Histórica & Bandas ISO: ${puntoNombre}`;
    modal.style.display = 'flex';

    const historialArray = Object.values(historialObj).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));
    const labels = historialArray.map(h => h.fechaHora ? h.fechaHora.replace('T', ' ') : 'Desconocida');
    const valores = historialArray.map(h => h.valor);
    const maxValorDatos = Math.max(...valores, 0);
    const maxYScale = Math.max(10, Math.ceil(maxValorDatos * 1.2)); 

    const ctx = document.getElementById('chartTendenciaSpot').getContext('2d');
    if (chartInstancia) chartInstancia.destroy();

    const bandasISOPlugin = {
        id: 'bandasISOPlugin',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { left, right, width }, scales: { y } } = chart;
            if (!y) return;
            ctx.save();
            const zonas = [
                { yMin: 0,   yMax: 2.8, color: 'rgba(16, 185, 129, 0.08)' }, 
                { yMin: 2.8, yMax: 4.5, color: 'rgba(234, 179, 8, 0.08)' },  
                { yMin: 4.5, yMax: 7.1, color: 'rgba(249, 115, 22, 0.08)' }, 
                { yMin: 7.1, yMax: maxYScale, color: 'rgba(239, 68, 68, 0.08)' } 
            ];
            zonas.forEach(zona => {
                const yTop = y.getPixelForValue(Math.min(zona.yMax, maxYScale));
                const yBottom = y.getPixelForValue(zona.yMin);
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
                fill: true, tension: 0.2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true, max: maxYScale }
            }
        },
        plugins: [bandasISOPlugin] 
    });

    const cerrar = () => { modal.style.display = 'none'; btnCerrar.removeEventListener('click', cerrar); };
    btnCerrar.addEventListener('click', cerrar);
}

// ---------------------------------------------------------
// 5. VISTA DE CONFIGURACIÓN (CON MAPA GIGANTE PARA PINES)
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

    const docsObj = eq.dataRoom || {};
    let docsHTML = '';
    const docsKeys = Object.keys(docsObj);
    
    if (docsKeys.length === 0) {
        docsHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 10px;">No hay documentos. Puedes enlazar infinitos PDFs o Excels de Drive aquí.</p>';
    } else {
        docsKeys.forEach(k => {
            const d = docsObj[k];
            docsHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-glass); padding-bottom: 15px; position: sticky; top: -20px; background: var(--bg-card); z-index: 10; padding-top: 20px; margin-top: -20px; margin-left: -20px; margin-right: -20px; padding-left: 20px; padding-right: 20px; border-radius: 8px 8px 0 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">                    <a href="${d.url}" target="_blank" style="color: var(--primary-blue); text-decoration: none; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:80%;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">description</span> ${d.nombre}
                    </a>
                    <button class="btn-icon btn-eliminar-doc" data-doc="${k}" title="Quitar" style="color: var(--iso-zona-d); background: transparent; border: none; cursor: pointer;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">close</span>
                    </button>
                </div>
            `;
        });
    }

    const galeriaObj = eq.galeria || {};
    let galeriaHTML = '';
    const galeriaKeys = Object.keys(galeriaObj);

    if(galeriaKeys.length === 0){
        galeriaHTML = `<div style="width: 100%; height: 100px; background: rgba(0,0,0,0.2); border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; display: flex; justify-content: center; align-items: center; color: var(--text-muted); font-size: 0.8rem;"><span class="material-symbols-outlined" style="font-size: 1.5rem; margin-right: 5px;">add_photo_alternate</span> Sin Imágenes</div>`;
    } else {
        galeriaHTML = `<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px; padding-top:5px;">`;
        galeriaKeys.forEach(k => {
            galeriaHTML += `
                <div style="position:relative; min-width: 90px; height: 90px;">
                    <img src="${galeriaObj[k]}" style="width:90px; height:90px; object-fit:cover; border-radius:6px; border:1px solid rgba(255,255,255,0.1);">
                    <button class="btn-eliminar-foto" data-foto="${k}" style="position:absolute; top:4px; right:4px; background:rgba(239,68,68,0.9); color:white; border:none; border-radius:4px; cursor:pointer; padding:2px;"><span class="material-symbols-outlined" style="font-size:1rem;">delete</span></button>
                </div>
            `;
        });
        galeriaHTML += `</div>`;
    }

    const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
    const tituloPanel = esNuevo ? '✨ Creación de Nuevo Equipo' : `⚙️ Configuración: ${eq.tag || idFirebase}`;

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; height: 100%; max-height: calc(100vh - 120px); padding: 0;">
            
            <!-- BARRA DE HERRAMIENTAS (SIEMPRE VISIBLE) -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); padding: 20px; background: var(--bg-card); border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 50; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <div>
                    <h3 style="color: var(--text-main); margin: 0;">${tituloPanel}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 5px 0 0 0;">Edición de parámetros, matriz CBM y Ubicación Satelital.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    ${!esNuevo ? `<button id="btn-modo-inspeccion" class="btn-topbar" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: rgba(255, 255, 255, 0.1);"><span class="material-symbols-outlined">speed</span> Inspección</button>` : ''}
                    <button id="btn-guardar-equipo" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);"><span class="material-symbols-outlined">${esNuevo ? 'add_circle' : 'save'}</span> ${esNuevo ? 'Crear Equipo' : 'Guardar Cambios'}</button>
                    <button id="btn-cerrar-expediente" class="btn-icon" style="color: var(--text-muted); background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px; margin-left: 10px;" title="Cerrar y volver">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            <!-- CONTENIDO DESLIZABLE (MAPA Y COLUMNAS) -->
            <div style="padding: 20px; overflow-y: auto; flex-grow: 1;">
                
                <!-- MAPA GIGANTE -->
                <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass); margin-bottom: 20px;">
                    <label style="font-size: 1rem; color: var(--primary-blue); font-weight: 600; display: flex; align-items: center; margin-bottom: 10px;">
                        <span class="material-symbols-outlined" style="font-size: 1.3rem; margin-right: 5px;">pin_drop</span> Asignar Posición GPS del Equipo
                    </label>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">Acércate al máximo y haz clic en el punto exacto de la planta para anclar el pin de la máquina.</p>
                    
                    <div id="mini-mapa-config" style="height: 500px; width: 100%; border-radius: 8px; border: 1px solid var(--border-glass); margin-bottom: 15px; z-index: 1;"></div>
                    
                    <div style="display: flex; gap: 15px;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Latitud Capturada</label>
                            <input type="text" id="edit-lat" value="${eq.latitud || ''}" readonly placeholder="Sin asignar" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: var(--text-muted); outline:none;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Longitud Capturada</label>
                            <input type="text" id="edit-lng" value="${eq.longitud || ''}" readonly placeholder="Sin asignar" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: var(--text-muted); outline:none;">
                        </div>
                    </div>
                </div>

                <!-- LAS 3 COLUMNAS -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 20px;">
                    
                    <!-- COL 1: DATOS BASE -->
                    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                        <h4 style="margin-bottom: 15px; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; margin-top: 0;"><span class="material-symbols-outlined" style="color: var(--primary-blue); font-size:1.1rem;">info</span> Datos Base</h4>
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
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Ubicación</label>
                            <input type="text" id="edit-area" value="${eq.area || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none;">
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Estado Inicial</label>
                            <select id="edit-severidad" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; outline:none; cursor: pointer;">
                                <option value="verde" ${sev==='verde'?'selected':''}>Verde</option>
                                <option value="amarillo" ${sev==='amarillo'?'selected':''}>Amarillo</option>
                                <option value="naranja" ${sev==='naranja'?'selected':''}>Naranja</option>
                                <option value="rojo" ${(sev==='rojo'||sev==='critico')?'selected':''}>Rojo</option>
                            </select>
                        </div>
                    </div>

                    <!-- COL 2: DATA ROOM -->
                    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass); display: flex; flex-direction: column;">
                        <h4 style="margin-bottom: 15px; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; margin-top: 0;"><span class="material-symbols-outlined" style="color: #eab308; font-size:1.1rem;">folder_open</span> Data Room</h4>
                        <div style="margin-bottom: 15px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); display:block; margin-bottom: 4px;">Galería Fotográfica</label>
                            <input type="file" id="upload-foto-equipo" accept="image/*" style="display: none;">
                            <button id="btn-subir-foto" class="btn-topbar" style="width: 100%; background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border: 1px dashed rgba(56, 189, 248, 0.4); justify-content: center;">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">add_a_photo</span> Añadir Foto a Galería
                            </button>
                            <div style="margin-top: 10px;">${galeriaHTML}</div>
                        </div>
                        <hr style="border: none; border-top: 1px dashed rgba(255,255,255,0.1); margin: 5px 0 15px 0;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 8px;">Links a PDFs / Excel</label>
                            <div style="max-height: 100px; overflow-y: auto; margin-bottom: 10px;">${docsHTML}</div>
                            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                <input type="text" id="nuevo-doc-nombre" placeholder="Nombre" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size:0.75rem; outline:none;">
                                <input type="text" id="nuevo-doc-url" placeholder="URL..." style="width: calc(100% - 70px); padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-card); color: white; font-size:0.75rem; outline:none;">
                                <button id="btn-add-doc" style="width: 60px; background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; cursor: pointer; font-size:0.75rem;">Añadir</button>
                            </div>
                        </div>
                    </div>

                    <!-- COL 3: MATRIZ CBM -->
                    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4 style="font-size: 0.9rem; display: flex; align-items: center; gap: 5px; margin-top: 0;"><span class="material-symbols-outlined" style="color: var(--iso-zona-a); font-size:1.1rem;">sensors</span> Matriz CBM</h4>
                            <button id="btn-cargar-plantilla" class="btn-topbar" style="font-size: 0.7rem; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border-color: rgba(56, 189, 248, 0.3);">
                                <span class="material-symbols-outlined" style="font-size: 1rem;">account_tree</span> Autocompletar
                            </button>
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 15px; background: var(--bg-card); padding: 12px; border-radius: 6px;">
                            <input type="text" id="nuevo-spot-punto" placeholder="Punto" style="width: 30%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; font-size:0.8rem;">
                            <input type="text" id="nuevo-spot-comp" placeholder="Componente" style="width: 50%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; font-size:0.8rem;">
                            <button id="btn-add-spot" style="width: 20%; background: var(--primary-blue); color: black; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size:0.8rem;">Añadir</button>
                        </div>
                        <div style="max-height: 290px; overflow-y: auto; border: 1px solid var(--border-glass); border-radius: 6px;">
                            <table class="tabla-cbm" style="margin-top: 0; border-bottom: none; width: 100%;">
                                <thead style="background: rgba(0,0,0,0.2);">
                                    <tr><th>Punto</th><th>Componente</th><th>RMS</th><th></th></tr>
                                </thead>
                                <tbody>${spotsHTML}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ---------------------------------------------------------
    // INICIALIZACIÓN DEL MAPA GIGANTE CON ZOOM DIGITAL EXTREMO
    // ---------------------------------------------------------
    if (miniMapaInstancia) miniMapaInstancia.remove();

    const latInicial = eq.latitud ? parseFloat(eq.latitud) : -28.290846;
    const lngInicial = eq.longitud ? parseFloat(eq.longitud) : -70.813030;
    const zoomInicial = eq.latitud ? 19 : 16; 

    miniMapaInstancia = L.map('mini-mapa-config', {
        minZoom: 14, 
        maxZoom: 21 // 🚀 TRUCO: Permite un zoom brutal escalando la imagen digitalmente
    }).setView([latInicial, lngInicial], zoomInicial);
    
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri', 
        maxNativeZoom: 17, // Límite real de las fotos satelitales en el desierto para que no salga gris
        maxZoom: 21        // Hace zoom a la fuerza usando la misma foto (efecto lupa)
    }).addTo(miniMapaInstancia);

    let pinConfigurador = null;
    
    // Si ya tenía coordenadas, dibujamos un pin vistoso
    if (eq.latitud && eq.longitud) {
        const pinIcon = L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: #38bdf8; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.8);"></div>`,
            iconSize: [24, 24], iconAnchor: [12, 12]
        });
        pinConfigurador = L.marker([latInicial, lngInicial], { icon: pinIcon }).addTo(miniMapaInstancia);
    }

    miniMapaInstancia.on('click', function(e) {
        const nuevaLat = e.latlng.lat.toFixed(6);
        const nuevaLng = e.latlng.lng.toFixed(6);
        
        document.getElementById('edit-lat').value = nuevaLat;
        document.getElementById('edit-lng').value = nuevaLng;
        
        if (pinConfigurador) {
            pinConfigurador.setLatLng(e.latlng);
        } else {
            const pinIcon = L.divIcon({
                className: 'custom-pin',
                html: `<div style="background-color: #38bdf8; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.8);"></div>`,
                iconSize: [24, 24], iconAnchor: [12, 12]
            });
            pinConfigurador = L.marker(e.latlng, { icon: pinIcon }).addTo(miniMapaInstancia);
        }
    });

    setTimeout(() => { miniMapaInstancia.invalidateSize(); }, 300);

    // --- EVENTOS MODO CONFIGURACIÓN ---
    if (!esNuevo) document.getElementById('btn-modo-inspeccion').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, false));

    document.getElementById('btn-cerrar-expediente').addEventListener('click', () => {
        if(confirm("¿Estás seguro de salir? Los cambios no guardados se perderán.")){
            document.getElementById('btn-volver-dashboard').click();
        }
    });

    document.getElementById('btn-cargar-plantilla').addEventListener('click', async () => {
        const tipoStr = document.getElementById('edit-tipo').value;
        const plantillaSeleccionada = obtenerPlantilla(tipoStr);
        if (!plantillaSeleccionada) return alert(`No detecté plantilla para: "${tipoStr}".`);
        
        const puntosExistentes = spotsArray.map(s => s.punto);
        const puntosFaltantes = plantillaSeleccionada.filter(spot => !puntosExistentes.includes(spot.punto));
        if (puntosFaltantes.length === 0) return alert("✅ Ya están todos los puntos estándar.");

        if(confirm(`Se insertarán ${puntosFaltantes.length} punto(s). ¿Continuar?`)) {
            const updates = {};
            puntosFaltantes.forEach((spot, i) => { updates[`spot_auto_${Date.now()}_${i}`] = { punto: spot.punto, componente: spot.comp, rms: 0.00 }; });
            if (esNuevo) { Object.assign(eq.spots || (eq.spots = {}), updates); construirPanelConfiguracion(idFirebase, eq, contenedor, true); } 
            else { await db.ref(`activos_criticos/${idFirebase}/spots`).update(updates); renderizarExpediente(idFirebase, contenedor.id, true); }
        }
    });

    document.getElementById('btn-subir-foto').addEventListener('click', () => document.getElementById('upload-foto-equipo').click());

    document.getElementById('upload-foto-equipo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const btnSubir = document.getElementById('btn-subir-foto');
        btnSubir.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Procesando...`;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; const MAX_HEIGHT = 600;
                let width = img.width; let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64Comprimida = canvas.toDataURL('image/jpeg', 0.7);
                const fotoId = `foto_${Date.now()}`;

                if (esNuevo) {
                    eq.galeria = eq.galeria || {};
                    eq.galeria[fotoId] = base64Comprimida;
                    construirPanelConfiguracion(idFirebase, eq, contenedor, true);
                } else {
                    db.ref(`activos_criticos/${idFirebase}/galeria/${fotoId}`).set(base64Comprimida).then(() => {
                        renderizarExpediente(idFirebase, contenedor.id, true);
                    });
                }
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    });

    document.querySelectorAll('.btn-eliminar-foto').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("¿Eliminar esta foto permanentemente?")) return;
            const fKey = e.currentTarget.getAttribute('data-foto');
            if (esNuevo) {
                delete eq.galeria[fKey];
                construirPanelConfiguracion(idFirebase, eq, contenedor, true);
            } else {
                await db.ref(`activos_criticos/${idFirebase}/galeria/${fKey}`).remove();
                renderizarExpediente(idFirebase, contenedor.id, true);
            }
        });
    });

    document.getElementById('btn-guardar-equipo').addEventListener('click', async () => {
        const tagValue = document.getElementById('edit-tag').value.trim();
        if (!tagValue) return alert("El TAG es obligatorio.");

        const nuevosDatos = {
            tag: tagValue, nombre: document.getElementById('edit-nombre').value,
            tipo_equipo: document.getElementById('edit-tipo').value, area: document.getElementById('edit-area').value,
            severidad: document.getElementById('edit-severidad').value, estado: document.getElementById('edit-severidad').value,
            latitud: document.getElementById('edit-lat').value || null, 
            longitud: document.getElementById('edit-lng').value || null,
            ultimaEdicion: Date.now()
        };

        const idFinal = esNuevo ? tagValue.toUpperCase().replace(/\s+/g, '_') : idFirebase;
        await db.ref(`activos_criticos/${idFinal}`).update(nuevosDatos);
        
        if (esNuevo) {
            if (eq.spots) await db.ref(`activos_criticos/${idFinal}/spots`).update(eq.spots);
            if (eq.dataRoom) await db.ref(`activos_criticos/${idFinal}/dataRoom`).update(eq.dataRoom);
            if (eq.galeria) await db.ref(`activos_criticos/${idFinal}/galeria`).update(eq.galeria);
        }
        renderizarExpediente(idFinal, contenedor.id, false);
    });

    document.getElementById('btn-add-doc').addEventListener('click', async () => {
        const docNombre = document.getElementById('nuevo-doc-nombre').value.trim();
        const docUrl = document.getElementById('nuevo-doc-url').value.trim();
        if (!docNombre || !docUrl) return;
        const nuevoDoc = { nombre: docNombre, url: docUrl };
        if (esNuevo) { eq.dataRoom = eq.dataRoom || {}; eq.dataRoom[`doc_${Date.now()}`] = nuevoDoc; construirPanelConfiguracion(idFirebase, eq, contenedor, true); } 
        else { await db.ref(`activos_criticos/${idFirebase}/dataRoom/doc_${Date.now()}`).set(nuevoDoc); renderizarExpediente(idFirebase, contenedor.id, true); }
    });

    document.querySelectorAll('.btn-eliminar-doc').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm("¿Quitar este documento?")) return;
            const docKey = e.currentTarget.getAttribute('data-doc');
            if (esNuevo) { delete eq.dataRoom[docKey]; construirPanelConfiguracion(idFirebase, eq, contenedor, true); } 
            else { await db.ref(`activos_criticos/${idFirebase}/dataRoom/${docKey}`).remove(); renderizarExpediente(idFirebase, contenedor.id, true); }
        });
    });

    document.getElementById('btn-add-spot').addEventListener('click', async () => {
        const punto = document.getElementById('nuevo-spot-punto').value.trim();
        const comp = document.getElementById('nuevo-spot-comp').value.trim();
        if (!punto || !comp) return;
        const nuevoPunto = { punto: punto, componente: comp, rms: 0.00 };
        if (esNuevo) { eq.spots = eq.spots || {}; eq.spots[`spot_manual_${Date.now()}`] = nuevoPunto; construirPanelConfiguracion(idFirebase, eq, contenedor, true); } 
        else { await db.ref(`activos_criticos/${idFirebase}/spots/spot_manual_${Date.now()}` ).set(nuevoPunto); renderizarExpediente(idFirebase, contenedor.id, true); }
    });

    document.querySelectorAll('.btn-eliminar-spot').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const spotKey = e.currentTarget.getAttribute('data-spot');
            const pBorrado = e.currentTarget.getAttribute('data-punto'); 
            const match = pBorrado.match(/^(G|PL)(\d+)(_LI|_LD)?/);
            let keysAEliminar = [spotKey];
            if (match) {
                const pre = match[1]; const num = parseInt(match[2]); 
                spotsArray.forEach(s => { const m = s.punto.match(/^(G|PL)(\d+)/); if (m && m[1] === pre && parseInt(m[2]) >= num && s.idInterno !== spotKey) keysAEliminar.push(s.idInterno); });
            }
            if (confirm(`¿Eliminar ${keysAEliminar.length > 1 ? 'este punto y subsecuentes' : 'este punto'}?`)) {
                if (esNuevo) { keysAEliminar.forEach(k => delete eq.spots[k]); construirPanelConfiguracion(idFirebase, eq, contenedor, true); } 
                else { const up = {}; keysAEliminar.forEach(k => up[k] = null); await db.ref(`activos_criticos/${idFirebase}/spots`).update(up); renderizarExpediente(idFirebase, contenedor.id, true); }
            }
        });
    });
}