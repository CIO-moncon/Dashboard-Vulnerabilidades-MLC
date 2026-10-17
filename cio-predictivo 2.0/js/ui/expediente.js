// ==========================================
// MÓDULO UI: EXPEDIENTE (INSPECCIÓN, CONFIGURACIÓN, DATA ROOM Y MAPAS 3D)
// ==========================================
import { db } from '../core/firebase-config.js';
import { generarPDFExpediente } from '../core/reportes.js';
import { renderizarModuloAnalisis } from './analisis.js'; 

let chartsInstancias = []; 
let miniMapaInstancia = null;

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

const pModulo = [ ...motorGen ];
for (let i = 1; i <= 6; i++) pModulo.push({ punto: `G${i}`, comp: `Reductor Punto ${i}` });
for (let i = 1; i <= 4; i++) {
    pModulo.push({ punto: `PL${i}_LI`, comp: `Polea ${i} Lado Izq` });
    pModulo.push({ punto: `PL${i}_LD`, comp: `Polea ${i} Lado Der` });
}

const pGrasshopper = [ ...motorGen ];
for (let i = 1; i <= 6; i++) pGrasshopper.push({ punto: `G${i}`, comp: `Reductor Punto ${i}` });
for (let i = 1; i <= 2; i++) {
    pGrasshopper.push({ punto: `PL${i}_LI`, comp: `Polea ${i} Lado Izq` });
    pGrasshopper.push({ punto: `PL${i}_LD`, comp: `Polea ${i} Lado Der` });
}

const PLANTILLAS_CBM = {
    chancador: pChancador, 
    transportador: pTransportador, 
    colector: pColector, 
    alimentador: pAlimentador,
    harneroSec: pHarneroSec, 
    tripper: pTripper, 
    prensa: pPrensa, 
    harneroTer: pHarneroTer, 
    beltFeeder: pBeltFeeder,
    modulo: pModulo, 
    grasshopper: pGrasshopper 
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
    
    if (t.includes('modulo') || t.includes('módulo')) return PLANTILLAS_CBM.modulo;
    if (t.includes('grasshopper')) return PLANTILLAS_CBM.grasshopper;
    
    return null;
}

function obtenerPesoOrdenSpot(puntoNombre) {
    const p = (puntoNombre || '').toUpperCase().trim();
    let grupo = 50; 
    if (p.startsWith('M')) grupo = 10;       
    else if (p.startsWith('G')) grupo = 20;  
    else if (p.startsWith('D') || p.startsWith('R') || p.startsWith('E') || p.startsWith('C')) grupo = 30; 
    else if (p.startsWith('PL')) grupo = 40; 

    const matchNum = p.match(/\d+/);
    const numero = matchNum ? parseInt(matchNum[0], 10) : 999;

    let subLado = 0;
    if (p.includes('_LI') || p.endsWith('LI') || p.includes('IZQ')) subLado = 1;
    else if (p.includes('_LD') || p.endsWith('LD') || p.includes('DER')) subLado = 2;

    return { grupo, numero, subLado, codigo: p };
}

function ordenarSpotsArray(spotsArray) {
    return spotsArray.sort((a, b) => {
        const pesoA = obtenerPesoOrdenSpot(a.punto);
        const pesoB = obtenerPesoOrdenSpot(b.punto);

        if (pesoA.grupo !== pesoB.grupo) return pesoA.grupo - pesoB.grupo;
        if (pesoA.numero !== pesoB.numero) return pesoA.numero - pesoB.numero;
        if (pesoA.subLado !== pesoB.subLado) return pesoA.subLado - pesoB.subLado;
        return pesoA.codigo.localeCompare(pesoB.codigo, undefined, { numeric: true });
    });
}

export function renderizarExpediente(idFirebase, contenedorId, forzarConfig = false) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    if (miniMapaInstancia) {
        miniMapaInstancia.remove();
        miniMapaInstancia = null;
        window.miniMapaInstancia = null;
    }

    if (idFirebase === 'NUEVO') {
        const eqVacio = { tag: '', nombre: '', tipo_equipo: '', area: '', nivel: 'Nivel 1', severidad: 'verde', estado: 'verde', spots: {}, latitud: '', longitud: '' };
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

function construirPanelInspeccion(idFirebase, eq, contenedor) {
    let spotsHTML = '';
    const spotsObj = eq.spots || {};
    let spotsArray = Object.keys(spotsObj).map(k => ({ idInterno: k, ...spotsObj[k] }));

    spotsArray = ordenarSpotsArray(spotsArray);

    if (spotsArray.length === 0) {
        spotsHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No hay puntos de medición. Ve a Configuración.</td></tr>';
    } else {
        spotsArray.forEach(s => {
            const rmsAnterior = parseFloat(s.rms || 0).toFixed(2);
            const tempAnterior = s.temp ? parseFloat(s.temp).toFixed(1) : '--';
            const fcAnterior = s.fc ? parseFloat(s.fc).toFixed(2) : '--';

            let colorAnterior = 'var(--iso-zona-a)';
            if (rmsAnterior >= 7.1) colorAnterior = 'var(--iso-zona-d)';
            else if (rmsAnterior >= 4.5) colorAnterior = 'var(--iso-zona-c)';
            else if (rmsAnterior >= 2.8) colorAnterior = 'var(--iso-zona-b)';

            const fechaAnterior = s.ultima_medicion ? s.ultima_medicion.replace('T', ' ') : 'Sin registro';

            spotsHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td><strong>${s.punto}</strong></td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${s.componente}</td>
                    <td style="text-align: center;">
                        <button class="btn-icon btn-ver-tendencia" data-spot-id="${s.idInterno}" data-punto-nombre="${s.punto} ${s.componente}" title="Ver Gráfico de Tendencia" style="color: var(--primary-blue); cursor:pointer; background:transparent; border:none;">
                            <span class="material-symbols-outlined">monitoring</span>
                        </button>
                    </td>
                    <td>
                        <div style="font-size: 0.9rem; color: ${colorAnterior}; font-weight: bold;">${rmsAnterior} mm/s</div>
                        <div style="font-size: 0.75rem; color: #f97316;">${tempAnterior} °C <span style="color:var(--text-muted)">| FC+ ${fcAnterior}</span></div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">${fechaAnterior}</div>
                    </td>
                    <td>
                        <input type="number" step="0.01" class="input-lectura-hoy" data-spot="${s.idInterno}" placeholder="RMS" 
                        style="width: 60px; padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline:none; text-align: right;" title="Vibración Global (mm/s)">
                    </td>
                    <td>
                        <input type="number" step="0.1" class="input-temp-hoy" data-spot="${s.idInterno}" placeholder="°C" 
                        style="width: 60px; padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline:none; text-align: right;" title="Temperatura Máxima (°C)">
                    </td>
                    <td>
                        <input type="number" step="0.01" class="input-fc-hoy" data-spot="${s.idInterno}" placeholder="FC+" 
                        style="width: 60px; padding: 6px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline:none; text-align: right;" title="Factor de Cresta">
                    </td>
                </tr>
            `;
        });
    }

    const ahora = new Date();
    const fechaHoraActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}T${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

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

    const nivelActivo = eq.nivel || 'Nivel 1';

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; height: 100%; max-height: calc(100vh - 120px); padding: 0;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); padding: 20px; background: var(--bg-card); border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 50; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <div style="display: flex; gap: 15px; align-items: center;">
                    ${miniaturaHeader}
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h3 style="color: var(--primary-blue); margin: 0;">Inspección CBM: ${eq.tag}</h3>
                            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.35);">${nivelActivo}</span>
                        </div>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 5px 0 0 0;">${eq.nombre} | ${eq.area}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    ${eq.latitud && eq.longitud ? `
                    <button id="btn-ubicar-3d-expediente" class="btn-topbar" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border-color: rgba(56, 189, 248, 0.35);" title="Enfocar equipo en el Mapa 3D">
                        <span class="material-symbols-outlined">my_location</span> Ver en Mapa 3D
                    </button>` : ''}

                    <button id="btn-modo-analisis" class="btn-topbar" style="background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border-color: rgba(56, 189, 248, 0.3);">
                        <span class="material-symbols-outlined">psychology</span> Análisis Experto
                    </button>
                    
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

            <div style="padding: 20px; overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 20px;">
                <div id="contenedor-alertas-activo" style="display: none; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 15px;"></div>

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
                                <tr>
                                    <th>Punto</th>
                                    <th>Componente</th>
                                    <th style="text-align: center;">Gráfico</th>
                                    <th>Lectura Anterior</th>
                                    <th>RMS (mm/s)</th>
                                    <th>Temp (°C)</th>
                                    <th>FC+</th>
                                </tr>
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

    cargarAlertasTerrenoDelEquipo(eq.tag);

    const btnUbicar3D = document.getElementById('btn-ubicar-3d-expediente');
    if (btnUbicar3D && window.ubicarEnMapaDesdeAlerta) {
        btnUbicar3D.addEventListener('click', () => window.ubicarEnMapaDesdeAlerta(eq.tag));
    }

    document.getElementById('btn-modo-config').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, true));
    
    document.getElementById('btn-modo-analisis').addEventListener('click', () => {
        renderizarModuloAnalisis(idFirebase, contenedor.id);
    });

    document.getElementById('btn-exportar-pdf').addEventListener('click', () => {
        mostrarResumenDiarioSAP(eq);
    });
    
    document.getElementById('btn-cerrar-expediente').addEventListener('click', () => {
        document.getElementById('btn-volver-dashboard').click();
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
        if (!fechaHoraRuta) return UI.mostrarToast("Indica la fecha y hora de la medición.", "alerta");

        const inputsVib = document.querySelectorAll('.input-lectura-hoy');
        const updates = {};
        let ingresados = 0;
        let peorSeveridad = 'verde';
        
        let alertasFaltantes = [];

        inputsVib.forEach(inputVib => {
            const spotId = inputVib.getAttribute('data-spot');
            const fila = inputVib.closest('tr');
            const nombrePunto = fila.querySelector('strong').textContent; 

            const valVib = inputVib.value.trim();
            const inputTemp = document.querySelector(`.input-temp-hoy[data-spot="${spotId}"]`);
            const valTemp = inputTemp ? inputTemp.value.trim() : '';
            const inputFc = document.querySelector(`.input-fc-hoy[data-spot="${spotId}"]`);
            const valFc = inputFc ? inputFc.value.trim() : '';

            let datosFaltantes = [];
            if (valVib === '') datosFaltantes.push('RMS');
            if (valTemp === '') datosFaltantes.push('Temperatura');
            if (valFc === '') datosFaltantes.push('FC+');

            if (datosFaltantes.length > 0 && datosFaltantes.length < 3) {
                alertasFaltantes.push(`El punto <b>${nombrePunto}</b> se encuentra sin el dato: <b>${datosFaltantes.join(' y ')}</b>`);
            } else if (datosFaltantes.length === 3) {
                alertasFaltantes.push(`El punto <b>${nombrePunto}</b> se encuentra sin registrar completamente`);
            }

            if (valVib !== '' || valTemp !== '' || valFc !== '') {
                const numVib = valVib !== '' ? parseFloat(valVib) : (spotsObj[spotId]?.rms || 0);
                const numTemp = valTemp !== '' ? parseFloat(valTemp) : (spotsObj[spotId]?.temp || 0);
                const numFc = valFc !== '' ? parseFloat(valFc) : (spotsObj[spotId]?.fc || 0);

                if (valVib !== '') updates[`spots/${spotId}/rms`] = numVib;
                if (valTemp !== '') updates[`spots/${spotId}/temp`] = numTemp;
                if (valFc !== '') updates[`spots/${spotId}/fc`] = numFc;
                
                updates[`spots/${spotId}/ultima_medicion`] = fechaHoraRuta;
                
                const timestampKey = new Date(fechaHoraRuta).getTime() + "_" + Math.floor(Math.random() * 1000);
                updates[`spots/${spotId}/historial/${timestampKey}`] = { 
                    valor: numVib, 
                    temp: numTemp, 
                    fc: numFc, 
                    fechaHora: fechaHoraRuta 
                };
                
                ingresados++;
                
                if (numVib >= 7.1) peorSeveridad = 'rojo';
                else if (numVib >= 4.5 && peorSeveridad !== 'rojo') peorSeveridad = 'naranja';
                else if (numVib >= 2.8 && peorSeveridad === 'verde') peorSeveridad = 'amarillo';

                if (numTemp >= 80) peorSeveridad = 'rojo';
                else if (numTemp >= 65 && peorSeveridad !== 'rojo') peorSeveridad = 'naranja';

                if (numFc >= 5.0) peorSeveridad = 'rojo';
                else if (numFc >= 3.0 && peorSeveridad !== 'rojo') peorSeveridad = 'naranja';
            }
        });

        if (ingresados === 0) return UI.mostrarToast("No ingresaste ningún valor de medición en toda la ruta.", "alerta");

        if (alertasFaltantes.length > 0) {
            let mensajeConfirmacion = "¿Estás seguro de guardar la ruta? Detectamos los siguientes faltantes:<br><br>";
            const maxMostrar = 6;
            for (let i = 0; i < Math.min(alertasFaltantes.length, maxMostrar); i++) {
                mensajeConfirmacion += `• <span style="font-size:0.9rem; color:var(--text-muted);">${alertasFaltantes[i]}</span><br>`;
            }
            if (alertasFaltantes.length > maxMostrar) {
                mensajeConfirmacion += `• <span style="font-size:0.9rem; color:var(--text-muted);">...y ${alertasFaltantes.length - maxMostrar} punto(s) más.</span>`;
            }

            const confirmado = await UI.confirmar(mensajeConfirmacion, "Confirmar Faltantes en Terreno");
            if (!confirmado) return;
        }

        const btn = document.getElementById('btn-guardar-ruta');
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span>`;
        updates['estado'] = peorSeveridad; updates['severidad'] = peorSeveridad; updates['ultimaEdicion'] = Date.now();

        try {
            await db.ref(`activos_criticos/${idFirebase}`).update(updates);
            btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> ¡Guardado!`;
            UI.mostrarToast("Ruta guardada. Matriz CBM actualizada.", "exito");
            setTimeout(() => renderizarExpediente(idFirebase, contenedor.id), 1200);
        } catch (error) {
            UI.mostrarToast("Error de conexión al guardar.", "error");
            btn.innerHTML = `<span class="material-symbols-outlined">save</span> Guardar Mediciones`;
            console.error(error);
        }
    });

    document.querySelectorAll('.input-lectura-hoy').forEach(input => {
        input.addEventListener('input', function() {
            const val = parseFloat(this.value.trim());
            if (isNaN(val)) {
                this.style.borderColor = 'var(--border-glass)'; this.style.color = 'white'; this.style.backgroundColor = 'var(--bg-input)';
            } else if (val >= 7.1) {
                this.style.borderColor = '#ef4444'; this.style.color = '#ef4444'; this.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            } else if (val >= 4.5) {
                this.style.borderColor = '#eab308'; this.style.color = '#eab308'; this.style.backgroundColor = 'rgba(234, 179, 8, 0.1)';
            } else {
                this.style.borderColor = '#10b981'; this.style.color = '#10b981'; this.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            }
        });
    });

    document.querySelectorAll('.input-temp-hoy').forEach(input => {
        input.addEventListener('input', function() {
            const val = parseFloat(this.value.trim());
            if (isNaN(val)) {
                this.style.borderColor = 'var(--border-glass)'; this.style.color = 'white'; this.style.backgroundColor = 'var(--bg-input)';
            } else if (val >= 80) {
                this.style.borderColor = '#ef4444'; this.style.color = '#ef4444'; this.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            } else if (val >= 65) {
                this.style.borderColor = '#f97316'; this.style.color = '#f97316'; this.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
            } else {
                this.style.borderColor = '#10b981'; this.style.color = '#10b981'; this.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            }
        });
    });

    document.querySelectorAll('.input-fc-hoy').forEach(input => {
        input.addEventListener('input', function() {
            const val = parseFloat(this.value.trim());
            if (isNaN(val)) {
                this.style.borderColor = 'var(--border-glass)'; this.style.color = 'white'; this.style.backgroundColor = 'var(--bg-input)';
            } else if (val >= 5.0) {
                this.style.borderColor = '#ef4444'; this.style.color = '#ef4444'; this.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            } else if (val >= 3.0) {
                this.style.borderColor = '#f97316'; this.style.color = '#f97316'; this.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
            } else {
                this.style.borderColor = '#10b981'; this.style.color = '#10b981'; this.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            }
        });
    });
}

function cargarAlertasTerrenoDelEquipo(tagEquipo) {
    if (!tagEquipo) return;
    const tagLimpio = tagEquipo.trim().toUpperCase();

    db.ref('alertas_terreno').once('value', snap => {
        const divAlertas = document.getElementById('contenedor-alertas-activo');
        if (!divAlertas || !snap.exists()) return;

        const todas = snap.val();
        const coincidencias = Object.entries(todas)
            .filter(([, al]) => al.tag && al.tag.trim().toUpperCase() === tagLimpio)
            .reverse();

        if (coincidencias.length === 0) {
            divAlertas.style.display = 'none';
            return;
        }

        divAlertas.style.display = 'block';
        let itemsHTML = '';
        coincidencias.forEach(([, al]) => {
            const fecha = al.timestamp ? new Date(al.timestamp).toLocaleString() : 'Sin fecha';
            let colorSev = '#10b981';
            if (al.severidad === 'Rojo') colorSev = '#ef4444';
            else if (al.severidad === 'Naranja') colorSev = '#f97316';
            else if (al.severidad === 'Amarillo') colorSev = '#eab308';

            itemsHTML += `
                <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--border-glass); border-left: 4px solid ${colorSev}; padding: 10px 14px; border-radius: 6px; display: flex; gap: 12px; align-items: center;">
                    ${al.fotoBase64 ? `<img src="${al.fotoBase64}" onclick="window.open('${al.fotoBase64}')" style="width: 55px; height: 55px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-glass);" title="Ampliar evidencia">` : ''}
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
                            <strong style="color: #38bdf8;">Componente: ${al.componente || 'General'} (${al.severidad || 'Normal'})</strong>
                            <span style="color: var(--text-muted);">${fecha}</span>
                        </div>
                        <p style="margin: 4px 0 0 0; font-size: 0.82rem; color: #e2e8f0;">${al.detalle}</p>
                    </div>
                </div>
            `;
        });

        divAlertas.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: #f87171; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 1.1rem;">warning</span>
                Reportes de Terreno Recientes para ${tagEquipo} (${coincidencias.length})
            </h4>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 190px; overflow-y: auto;">
                ${itemsHTML}
            </div>
        `;
    });
}

function abrirModalTendencia(puntoNombre, historialObj) {
    const modal = document.getElementById('modal-tendencia');
    const titulo = document.getElementById('modal-titulo-punto');
    const btnCerrar = document.getElementById('btn-cerrar-modal');
    
    titulo.textContent = `Tendencias Históricas: ${puntoNombre}`;
    modal.style.display = 'flex';

    const historialArray = historialObj ? Object.values(historialObj).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora)) : [];
    const labels = historialArray.length > 0 ? historialArray.map(h => h.fechaHora ? h.fechaHora.replace('T', ' ') : 'Desconocida') : ['Sin registros'];

    chartsInstancias.forEach(chart => chart.destroy());
    chartsInstancias = [];

    const construirGrafico = (canvasId, valores, labelEjeY, colorLinea, limites, funcionColorPunto, limiteEjeY) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const datosValidos = valores.length > 0 ? valores : [0];
        const maxValorDatos = Math.max(...datosValidos, 0);
        const maxYScale = Math.max(limiteEjeY, Math.ceil(maxValorDatos * 1.2));

        const pluginFondo = {
            id: 'pluginFondo_' + canvasId,
            beforeDraw: (chart) => {
                const { ctx, chartArea: { left, right, width }, scales: { y } } = chart;
                if (!y) return;
                ctx.save();
                limites.forEach(zona => {
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

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: labelEjeY,
                    data: datosValidos,
                    borderColor: colorLinea,
                    backgroundColor: `${colorLinea}26`,
                    borderWidth: 2,
                    pointBackgroundColor: datosValidos.map(v => funcionColorPunto(v)),
                    pointBorderColor: '#ffffff',
                    pointRadius: 4,
                    fill: true, tension: 0.2
                }]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true, max: maxYScale }
                }
            },
            plugins: [pluginFondo]
        });

        chartsInstancias.push(chart);
    };

    setTimeout(() => {
        construirGrafico(
            'chartRMS', 
            historialArray.map(h => h.valor ?? h.rms ?? 0), 
            'RMS (mm/s)', '#38bdf8', 
            [
                { yMin: 0,   yMax: 2.8, color: 'rgba(16, 185, 129, 0.08)' },
                { yMin: 2.8, yMax: 4.5, color: 'rgba(234, 179, 8, 0.08)' },
                { yMin: 4.5, yMax: 7.1, color: 'rgba(249, 115, 22, 0.08)' },
                { yMin: 7.1, yMax: 999, color: 'rgba(239, 68, 68, 0.08)' }
            ],
            (val) => val >= 7.1 ? '#ef4444' : val >= 4.5 ? '#f97316' : val >= 2.8 ? '#eab308' : '#10b981',
            10
        );

        construirGrafico(
            'chartTemp', 
            historialArray.map(h => h.temp ?? 0), 
            'Temp (°C)', '#f97316', 
            [
                { yMin: 0,  yMax: 65,  color: 'rgba(16, 185, 129, 0.08)' },
                { yMin: 65, yMax: 80,  color: 'rgba(249, 115, 22, 0.08)' },
                { yMin: 80, yMax: 999, color: 'rgba(239, 68, 68, 0.08)' }
            ],
            (val) => val >= 80 ? '#ef4444' : val >= 65 ? '#f97316' : '#10b981',
            100
        );

        construirGrafico(
            'chartFC', 
            historialArray.map(h => h.fc ?? 0), 
            'FC+', '#eab308', 
            [
                { yMin: 0,   yMax: 3.0, color: 'rgba(16, 185, 129, 0.08)' },
                { yMin: 3.0, yMax: 5.0, color: 'rgba(249, 115, 22, 0.08)' },
                { yMin: 5.0, yMax: 999, color: 'rgba(239, 68, 68, 0.08)' }
            ],
            (val) => val >= 5.0 ? '#ef4444' : val >= 3.0 ? '#f97316' : '#10b981',
            10
        );
    }, 50);

    const cerrar = () => { modal.style.display = 'none'; btnCerrar.removeEventListener('click', cerrar); };
    btnCerrar.addEventListener('click', cerrar);
}

function construirPanelConfiguracion(idFirebase, eq, contenedor, esNuevo) {
    let spotsHTML = '';
    const spotsObj = eq.spots || {};
    let spotsArray = Object.keys(spotsObj).map(k => ({ idInterno: k, ...spotsObj[k] }));

    spotsArray = ordenarSpotsArray(spotsArray);

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
        docsHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 10px;">No hay documentos. Sube tus PDFs de manuales o planos técnicos directamente aquí.</p>';
    } else {
        docsKeys.forEach(k => {
            const d = docsObj[k];
            docsHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px; gap: 8px;">
                    <a href="${d.url}" target="_blank" download="${d.nombre}" style="color: var(--primary-blue); text-decoration: none; font-size: 0.82rem; display: flex; align-items: center; gap: 6px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:80%;" title="Descargar / Ver PDF">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem; color: #ef4444;">picture_as_pdf</span> ${d.nombre}
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
    const nivelActual = eq.nivel || 'Nivel 1';
    const nivelesOpciones = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel -1', 'Nivel -2'];
    const tituloPanel = esNuevo ? '✨ Creación de Nuevo Equipo' : `⚙️ Configuración: ${eq.tag || idFirebase}`;

    const generarChipsNivelHTML = (claseExtra) => nivelesOpciones.map(niv => {
        const activo = nivelActual === niv;
        return `
            <button type="button" class="chip-selector-nivel ${claseExtra}" data-nivel-val="${niv}"
                style="flex: 1; min-width: 70px; padding: 7px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1px solid ${activo ? '#38bdf8' : 'rgba(255,255,255,0.15)'}; background: ${activo ? '#38bdf8' : 'rgba(15, 23, 42, 0.8)'}; color: ${activo ? '#0f172a' : '#e2e8f0'};">
                ${niv}
            </button>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; height: 100%; max-height: calc(100vh - 120px); padding: 0;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); padding: 20px; background: var(--bg-card); border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 50; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <div>
                    <h3 style="color: var(--text-main); margin: 0;">${tituloPanel}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 5px 0 0 0;">Edición de parámetros, Nivel/Piso, matriz CBM y Ubicación Satelital 3D.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    ${!esNuevo ? `<button id="btn-modo-inspeccion" class="btn-topbar" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: rgba(255, 255, 255, 0.1);"><span class="material-symbols-outlined">speed</span> Inspección</button>` : ''}
                    <button id="btn-guardar-equipo" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);"><span class="material-symbols-outlined">${esNuevo ? 'add_circle' : 'save'}</span> ${esNuevo ? 'Crear Equipo' : 'Guardar Cambios'}</button>
                    <button id="btn-cerrar-expediente" class="btn-icon" style="color: var(--text-muted); background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px; margin-left: 10px;" title="Cerrar y volver">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            <div style="padding: 20px; overflow-y: auto; flex-grow: 1;">
                
                <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass); margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
                        <label style="font-size: 1rem; color: var(--primary-blue); font-weight: 600; display: flex; align-items: center;">
                            <span class="material-symbols-outlined" style="font-size: 1.3rem; margin-right: 5px;">pin_drop</span> Asignar Posición GPS y Nivel del Equipo
                        </label>
                        
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Piso / Nivel:</span>
                            <div style="display: flex; gap: 6px;">
                                ${generarChipsNivelHTML('chip-mapa')}
                            </div>
                            <button type="button" id="btn-mini-3d" style="margin-left: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 7px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                                Alternar Vista 2D / 3D
                            </button>
                        </div>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">Haz clic en el punto exacto del galpón para fijar el pin o <b>arrástralo con el mouse</b> para ajustar su posición.</p>
                    
                    <div id="mini-mapa-config" style="height: 460px; width: 100%; border-radius: 8px; border: 1px solid var(--border-glass); margin-bottom: 15px; position: relative; z-index: 1;"></div>
                    
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

                <div style="display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 20px;">
                    
                    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass);">
                        <h4 style="margin-bottom: 15px; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; margin-top: 0;"><span class="material-symbols-outlined" style="color: var(--primary-blue); font-size:1.1rem;">info</span> Datos Base</h4>
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">TAG</label>
                            <input type="text" id="edit-tag" value="${eq.tag || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline:none;" ${esNuevo ? 'placeholder="Obligatorio"' : ''}>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Descripción</label>
                            <input type="text" id="edit-nombre" value="${eq.nombre || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline:none;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Tipo Máquina</label>
                            <input type="text" id="edit-tipo" value="${eq.tipo_equipo || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline:none;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Ubicación / Área</label>
                            <input type="text" id="edit-area" value="${eq.area || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: #0f172a; color: white; outline:none;">
                        </div>
                        
                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; display: block; margin-bottom: 6px;">Nivel / Piso en Planta</label>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
                                ${generarChipsNivelHTML('chip-form')}
                            </div>
                            <select id="edit-nivel" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background-color: #0f172a; color: #ffffff; outline:none; cursor: pointer;">
                                <option value="Nivel 1" style="background-color: #0f172a; color: #ffffff;" ${nivelActual==='Nivel 1'?'selected':''}>Nivel 1 (Piso Planta)</option>
                                <option value="Nivel 2" style="background-color: #0f172a; color: #ffffff;" ${nivelActual==='Nivel 2'?'selected':''}>Nivel 2 (Entreplanta)</option>
                                <option value="Nivel 3" style="background-color: #0f172a; color: #ffffff;" ${nivelActual==='Nivel 3'?'selected':''}>Nivel 3 (Superior)</option>
                                <option value="Nivel -1" style="background-color: #0f172a; color: #ffffff;" ${nivelActual==='Nivel -1'?'selected':''}>Nivel -1 (Subterráneo 1)</option>
                                <option value="Nivel -2" style="background-color: #0f172a; color: #ffffff;" ${nivelActual==='Nivel -2'?'selected':''}>Nivel -2 (Subterráneo 2)</option>
                            </select>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Estado Inicial</label>
                            <select id="edit-severidad" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background-color: #0f172a; color: #ffffff; outline:none; cursor: pointer;">
                                <option value="verde" style="background-color: #0f172a; color: #ffffff;" ${sev==='verde'?'selected':''}>Verde</option>
                                <option value="amarillo" style="background-color: #0f172a; color: #ffffff;" ${sev==='amarillo'?'selected':''}>Amarillo</option>
                                <option value="naranja" style="background-color: #0f172a; color: #ffffff;" ${sev==='naranja'?'selected':''}>Naranja</option>
                                <option value="rojo" style="background-color: #0f172a; color: #ffffff;" ${(sev==='rojo'||sev==='critico')?'selected':''}>Rojo</option>
                            </select>
                        </div>
                    </div>

                    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; border: 1px solid var(--border-glass); display: flex; flex-direction: column;">
                        <h4 style="margin-bottom: 15px; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; margin-top: 0;"><span class="material-symbols-outlined" style="color: #eab308; font-size:1.1rem;">folder_open</span> Data Room (Manuales y Planos)</h4>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); display:block; margin-bottom: 4px;">Galería Fotográfica</label>
                            <input type="file" id="upload-foto-equipo" accept="image/*" style="display: none;">
                            <button type="button" id="btn-subir-foto" class="btn-topbar" style="width: 100%; background: rgba(56, 189, 248, 0.1); color: var(--primary-blue); border: 1px dashed rgba(56, 189, 248, 0.4); justify-content: center;">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">add_a_photo</span> Añadir Foto a Galería
                            </button>
                            <div style="margin-top: 10px;">${galeriaHTML}</div>
                        </div>

                        <hr style="border: none; border-top: 1px dashed rgba(255,255,255,0.1); margin: 5px 0 15px 0;">

                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Documentos PDF Locales (Todo a la mano)</label>
                            <input type="file" id="upload-pdf-local" accept=".pdf" style="display: none;">
                            <button type="button" id="btn-subir-pdf" onclick="document.getElementById('upload-pdf-local').click()" class="btn-topbar" style="width: 100%; background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px dashed rgba(239, 68, 68, 0.4); justify-content: center; margin-bottom: 12px;">
                                <span class="material-symbols-outlined" style="font-size: 1.1rem;">upload_file</span> Subir PDF al Sistema
                            </button>
                            
                            <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">${docsHTML}</div>
                        </div>
                    </div>

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

    const extraerDatosFormularioActual = () => {
        return {
            tag: document.getElementById('edit-tag')?.value || eq.tag || '',
            nombre: document.getElementById('edit-nombre')?.value || eq.nombre || '',
            tipo_equipo: document.getElementById('edit-tipo')?.value || eq.tipo_equipo || '',
            area: document.getElementById('edit-area')?.value || eq.area || '',
            nivel: document.getElementById('edit-nivel')?.value || eq.nivel || 'Nivel 1',
            severidad: document.getElementById('edit-severidad')?.value || eq.severidad || 'verde',
            estado: document.getElementById('edit-severidad')?.value || eq.estado || 'verde',
            latitud: document.getElementById('edit-lat')?.value || eq.latitud || null,
            longitud: document.getElementById('edit-lng')?.value || eq.longitud || null,
            spots: eq.spots || {},
            dataRoom: eq.dataRoom || {},
            galeria: eq.galeria || {}
        };
    };

    const selectNivel = document.getElementById('edit-nivel');
    const actualizarSeleccionNivel = (nuevoNivel) => {
        if (selectNivel) selectNivel.value = nuevoNivel;
        eq.nivel = nuevoNivel;

        document.querySelectorAll('.chip-selector-nivel').forEach(btn => {
            const esActivo = btn.getAttribute('data-nivel-val') === nuevoNivel;
            btn.style.background = esActivo ? '#38bdf8' : 'rgba(15, 23, 42, 0.8)';
            btn.style.color = esActivo ? '#0f172a' : '#e2e8f0';
            btn.style.borderColor = esActivo ? '#38bdf8' : 'rgba(255,255,255,0.15)';
        });

        const badgePin = document.getElementById('badge-pin-nivel-config');
        if (badgePin) {
            badgePin.textContent = `${document.getElementById('edit-tag').value || 'PIN'} (${nuevoNivel})`;
        }
    };

    document.querySelectorAll('.chip-selector-nivel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const valorElegido = e.currentTarget.getAttribute('data-nivel-val');
            actualizarSeleccionNivel(valorElegido);
        });
    });

    if (selectNivel) {
        selectNivel.addEventListener('change', (e) => {
            actualizarSeleccionNivel(e.target.value);
        });
    }

    const contenedorMapaConfig = document.getElementById('mini-mapa-config');
    if (contenedorMapaConfig) {
        // Corrección de coordenadas iniciales: aseguramos orden [lng, lat]
        const latInicial = eq.latitud ? parseFloat(eq.latitud) : -28.290846;
        const lngInicial = eq.longitud ? parseFloat(eq.longitud) : -70.813030;
        const zoomInicial = eq.latitud ? 18.5 : 15.8;

        miniMapaInstancia = new maplibregl.Map({
            container: 'mini-mapa-config',
            style: {
                version: 8,
                sources: {
                    'esri-sat-config': {
                        type: 'raster',
                        tiles: [
                            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        ],
                        tileSize: 256,
                        maxzoom: 17
                    }
                },
                layers: [
                    {
                        id: 'esri-sat-layer',
                        type: 'raster',
                        source: 'esri-sat-config',
                        minzoom: 0,
                        maxzoom: 22
                    }
                ]
            },
            center: [lngInicial, latInicial], // [Lng, Lat]
            zoom: zoomInicial,
            pitch: 0,
            bearing: 0,
            minZoom: 13,
            maxZoom: 21
        });

        miniMapaInstancia.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        window.miniMapaInstancia = miniMapaInstancia;

        let pinConfigurador = null;

        const crearOActualizarPin = (lng, lat) => {
            document.getElementById('edit-lat').value = Number(lat).toFixed(6);
            document.getElementById('edit-lng').value = Number(lng).toFixed(6);

            if (pinConfigurador) {
                pinConfigurador.setLngLat([lng, lat]);
            } else {
                const nivElegido = document.getElementById('edit-nivel')?.value || 'Nivel 1';
                const tagElegido = document.getElementById('edit-tag')?.value || 'PIN';
                const elPin = document.createElement('div');
                elPin.style.cssText = 'display: flex; flex-direction: column; align-items: center; cursor: grab;';
                elPin.innerHTML = `
                    <div id="badge-pin-nivel-config" style="background: rgba(15, 23, 42, 0.92); color: #38bdf8; font-size: 0.7rem; font-weight: 700; font-family: monospace; padding: 2px 7px; border-radius: 4px; border: 1px solid #38bdf8; margin-bottom: 4px; white-space: nowrap;">
                        ${tagElegido} (${nivElegido})
                    </div>
                    <div style="background-color: #38bdf8; width: 26px; height: 26px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.9);"></div>
                `;
                pinConfigurador = new maplibregl.Marker({ element: elPin, draggable: true, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .addTo(miniMapaInstancia);

                pinConfigurador.on('dragend', () => {
                    const pos = pinConfigurador.getLngLat();
                    document.getElementById('edit-lat').value = pos.lat.toFixed(6);
                    document.getElementById('edit-lng').value = pos.lng.toFixed(6);
                });
            }
        };

        if (eq.latitud && eq.longitud) {
            crearOActualizarPin(lngInicial, latInicial);
        }

        miniMapaInstancia.on('click', (e) => {
            crearOActualizarPin(e.lngLat.lng, e.lngLat.lat);
        });

        const btnMini3D = document.getElementById('btn-mini-3d');
        if (btnMini3D) {
            btnMini3D.addEventListener('click', () => {
                const pitchActual = miniMapaInstancia.getPitch();
                miniMapaInstancia.easeTo({
                    pitch: pitchActual > 10 ? 0 : 60,
                    bearing: pitchActual > 10 ? 0 : -15,
                    duration: 700
                });
            });
        }

        setTimeout(() => {
            if (miniMapaInstancia) miniMapaInstancia.resize();
        }, 250);
    }

    if (!esNuevo) document.getElementById('btn-modo-inspeccion').addEventListener('click', () => renderizarExpediente(idFirebase, contenedor.id, false));

    document.getElementById('btn-cerrar-expediente').addEventListener('click', async () => {
        const confirmado = await UI.confirmar("¿Estás seguro de salir? Los cambios no guardados se perderán.", "Cerrar Configuración");
        if(confirmado){
            document.getElementById('btn-volver-dashboard').click();
        }
    });

    document.getElementById('btn-cargar-plantilla').addEventListener('click', async () => {
        const datosActuales = extraerDatosFormularioActual();
        const tipoStr = datosActuales.tipo_equipo;
        const plantillaSeleccionada = obtenerPlantilla(tipoStr);
        if (!plantillaSeleccionada) return UI.mostrarToast(`No detecté plantilla para el tipo: "${tipoStr}".`, "error");
        
        const puntosExistentes = spotsArray.map(s => s.punto);
        const puntosFaltantes = plantillaSeleccionada.filter(spot => !puntosExistentes.includes(spot.punto));
        if (puntosFaltantes.length === 0) return UI.mostrarToast("Ya están todos los puntos estándar.", "exito");

        const confirmado = await UI.confirmar(`Se insertarán ${puntosFaltantes.length} punto(s). ¿Continuar?`, "Cargar Plantilla CBM");
        if(confirmado) {
            const updates = {};
            puntosFaltantes.forEach((spot, i) => { updates[`spot_auto_${Date.now()}_${i}`] = { punto: spot.punto, componente: spot.comp, rms: 0.00 }; });
            
            Object.assign(datosActuales.spots, updates);

            if (esNuevo) {
                construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true);
            } else {
                await db.ref(`activos_criticos/${idFirebase}/spots`).update(updates);
                renderizarExpediente(idFirebase, contenedor.id, true);
            }
            UI.mostrarToast("Plantilla cargada correctamente.", "exito");
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
                const datosActuales = extraerDatosFormularioActual();

                if (esNuevo) {
                    datosActuales.galeria = datosActuales.galeria || {};
                    datosActuales.galeria[fotoId] = base64Comprimida;
                    construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true);
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

    const inputPdfLocal = document.getElementById('upload-pdf-local');
    if (inputPdfLocal) {
        inputPdfLocal.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type !== 'application/pdf') {
                return UI.mostrarToast("Por favor selecciona un archivo en formato PDF.", "error");
            }

            if (file.size > 15 * 1024 * 1024) {
                return UI.mostrarToast("El PDF es demasiado pesado (>15MB). Comprímelo un poco antes de subirlo.", "alerta");
            }

            UI.mostrarToast("Cargando PDF al Data Room...", "advertencia");

            const reader = new FileReader();
            reader.onload = async function(event) {
                const base64Pdf = event.target.result;
                const nombreDoc = file.name;
                const docKey = `doc_${Date.now()}`;
                const nuevoDoc = { nombre: nombreDoc, url: base64Pdf };
                const datosActuales = extraerDatosFormularioActual();

                if (esNuevo) {
                    datosActuales.dataRoom = datosActuales.dataRoom || {};
                    datosActuales.dataRoom[docKey] = nuevoDoc;
                    construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true);
                } else {
                    await db.ref(`activos_criticos/${idFirebase}/dataRoom/${docKey}`).set(nuevoDoc);
                    renderizarExpediente(idFirebase, contenedor.id, true);
                }
                UI.mostrarToast("¡PDF guardado exitosamente en el Data Room!", "exito");
            };
            reader.readAsDataURL(file);
        });
    }

    document.querySelectorAll('.btn-eliminar-foto').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const confirmado = await UI.confirmar("¿Eliminar esta foto permanentemente?", "Eliminar Fotografía");
            if(!confirmado) return;

            const fKey = e.currentTarget.getAttribute('data-foto');
            const datosActuales = extraerDatosFormularioActual();

            if (esNuevo) {
                delete datosActuales.galeria[fKey];
                construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true);
            } else {
                await db.ref(`activos_criticos/${idFirebase}/galeria/${fKey}`).remove();
                renderizarExpediente(idFirebase, contenedor.id, true);
            }
            UI.mostrarToast("Fotografía eliminada.", "exito");
        });
    });

    document.getElementById('btn-guardar-equipo').addEventListener('click', async () => {
        const datosActuales = extraerDatosFormularioActual();
        if (!datosActuales.tag) return UI.mostrarToast("El TAG es obligatorio.", "error");

        const nuevosDatos = {
            tag: datosActuales.tag,
            nombre: datosActuales.nombre,
            tipo_equipo: datosActuales.tipo_equipo,
            area: datosActuales.area,
            nivel: datosActuales.nivel,
            severidad: datosActuales.severidad,
            estado: datosActuales.severidad,
            latitud: datosActuales.latitud || null, 
            longitud: datosActuales.longitud || null,
            ultimaEdicion: Date.now()
        };

        const idFinal = esNuevo ? datosActuales.tag.toUpperCase().replace(/\s+/g, '_') : idFirebase;
        await db.ref(`activos_criticos/${idFinal}`).update(nuevosDatos);
        
        if (esNuevo) {
            if (datosActuales.spots) await db.ref(`activos_criticos/${idFinal}/spots`).update(datosActuales.spots);
            if (datosActuales.dataRoom) await db.ref(`activos_criticos/${idFinal}/dataRoom`).update(datosActuales.dataRoom);
            if (datosActuales.galeria) await db.ref(`activos_criticos/${idFinal}/galeria`).update(datosActuales.galeria);
        }
        UI.mostrarToast("Configuración guardada exitosamente.", "exito");
        renderizarExpediente(idFinal, contenedor.id, false);
    });

    document.querySelectorAll('.btn-eliminar-doc').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const confirmado = await UI.confirmar("¿Quitar este documento?", "Eliminar Documento");
            if (!confirmado) return;

            const docKey = e.currentTarget.getAttribute('data-doc');
            const datosActuales = extraerDatosFormularioActual();

            if (esNuevo) { 
                delete datosActuales.dataRoom[docKey]; 
                construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true); 
            } else { 
                await db.ref(`activos_criticos/${idFirebase}/dataRoom/${docKey}`).remove(); 
                renderizarExpediente(idFirebase, contenedor.id, true); 
            }
            UI.mostrarToast("Documento eliminado.", "exito");
        });
    });

    document.getElementById('btn-add-spot').addEventListener('click', async () => {
        const punto = document.getElementById('nuevo-spot-punto').value.trim();
        const comp = document.getElementById('nuevo-spot-comp').value.trim();
        if (!punto || !comp) return;

        const nuevoPunto = { punto: punto, componente: comp, rms: 0.00 };
        const datosActuales = extraerDatosFormularioActual();
        const spotKey = `spot_manual_${Date.now()}`;

        if (esNuevo) { 
            datosActuales.spots = datosActuales.spots || {}; 
            datosActuales.spots[spotKey] = nuevoPunto; 
            construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true); 
        } else { 
            await db.ref(`activos_criticos/${idFirebase}/spots/${spotKey}`).set(nuevoPunto); 
            renderizarExpediente(idFirebase, contenedor.id, true); 
        }
        UI.mostrarToast("Punto añadido.", "exito");
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
            
            const mensaje = keysAEliminar.length > 1 ? `¿Eliminar este punto y subsecuentes?` : `¿Eliminar este punto?`;
            const confirmado = await UI.confirmar(mensaje, "Eliminar Punto");

            if (confirmado) {
                const datosActuales = extraerDatosFormularioActual();
                if (esNuevo) { 
                    keysAEliminar.forEach(k => delete datosActuales.spots[k]); 
                    construirPanelConfiguracion(idFirebase, datosActuales, contenedor, true); 
                } else { 
                    const up = {}; 
                    keysAEliminar.forEach(k => up[k] = null); 
                    await db.ref(`activos_criticos/${idFirebase}/spots`).update(up); 
                    renderizarExpediente(idFirebase, contenedor.id, true); 
                }
                UI.mostrarToast("Punto(s) eliminado(s).", "exito");
            }
        });
    });
}

export function mostrarResumenDiarioSAP(eq) {
    const spots = eq.spots || {};
    let spotsArray = Object.keys(spots).map(k => spots[k]);

    spotsArray = ordenarSpotsArray(spotsArray);

    let tablaHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; margin-top: 15px;">
            <thead>
                <tr style="background-color: #0f172a; color: white;">
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 10%;">Punto</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 35%;">Componente</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 15%;">RMS (mm/s)</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 15%;">Temp (°C)</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 10%;">FC+</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; width: 15%; text-align: center;">Estado</th>
                </tr>
            </thead>
            <tbody>
    `;

    let totalPuntos = 0;
    let criticos = 0;
    let alertas = 0;

    spotsArray.forEach(s => {
        totalPuntos++;
        
        const rms = parseFloat(s.rms || 0);
        const temp = parseFloat(s.temp || 0);
        const fc = parseFloat(s.fc || 0);

        const rmsText = rms > 0 ? rms.toFixed(2) : '-';
        const tempText = temp > 0 ? temp.toFixed(1) : '-';
        const fcText = fc > 0 ? fc.toFixed(2) : '-';

        let estado = '<span style="color: #10b981; font-weight: bold;">Normal</span>';
        let bgRow = '#ffffff';

        if (rms >= 7.1 || temp >= 80 || fc >= 5.0) {
            estado = '<span style="color: #ef4444; font-weight: bold;">Crítico</span>';
            bgRow = '#fef2f2';
            criticos++;
        } else if (rms >= 4.5 || temp >= 65 || fc >= 3.0) {
            estado = '<span style="color: #f97316; font-weight: bold;">Alerta</span>';
            bgRow = '#fffbeb';
            alertas++;
        }

        tablaHtml += `
            <tr style="background-color: ${bgRow}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${s.punto || ''}</td>
                <td style="padding: 10px; border: 1px solid #cbd5e1; color: #334155;">${s.componente || ''}</td>
                <td style="padding: 10px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 600;">${rmsText}</td>
                <td style="padding: 10px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 600;">${tempText}</td>
                <td style="padding: 10px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 600;">${fcText}</td>
                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${estado}</td>
            </tr>
        `;
    });

    tablaHtml += `</tbody></table>`;

    let modalResumen = document.getElementById('modal-resumen-diario-sap');
    if (!modalResumen) {
        modalResumen = document.createElement('div');
        modalResumen.id = 'modal-resumen-diario-sap';
        modalResumen.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center;";
        document.body.appendChild(modalResumen);
    }

    modalResumen.innerHTML = `
        <style>
            @media print {
                body * { visibility: hidden; }
                #contenedor-impresion-diaria, #contenedor-impresion-diaria * { visibility: visible; }
                #contenedor-impresion-diaria { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border-radius: 0; }
                #btn-cerrar-diario, #btn-imprimir-diario, .footer-botones { display: none !important; }
            }
        </style>
        <div id="contenedor-impresion-diaria" style="background: #f8fafc; color: #1e293b; border-radius: 12px; width: 950px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.6); overflow: hidden;">
            
            <div style="background: #0f172a; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="background: white; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; height: 50px;">
                        <img src="assets/img/logo-cpf.png" alt="CPF Logo" style="height: 100%; object-fit: contain;" onerror="this.outerHTML='<span style=\\'font-weight: 900; color: #0f172a; font-size: 1.2rem;\\'>CPF</span>'">
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #38bdf8;">Informe Diario de Ruta CBM</h3>
                        <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #94a3b8;">Mina Los Colorados (CMP) | Activo: ${eq.tag} - ${eq.nombre}</p>
                    </div>
                </div>
                <button type="button" id="btn-cerrar-diario" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1.4rem;"><span class="material-symbols-outlined">close</span></button>
            </div>
            
            <div style="padding: 25px 30px; overflow-y: auto; flex-grow: 1;">
                <div style="margin-bottom: 20px; background: white; padding: 12px 15px; border-radius: 6px; border: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 0.85rem;">
                    <span><b>Área:</b> ${eq.area || 'Planta Principal'} (${eq.nivel || 'Nivel 1'})</span>
                    <span><b>Fecha de Toma:</b> ${new Date().toLocaleDateString()}</span>
                    <span><b>Puntos Medidos:</b> ${totalPuntos}</span>
                    <span style="color: #ef4444; font-weight: bold;">Críticos: ${criticos}</span>
                    <span style="color: #f97316; font-weight: bold;">Alertas: ${alertas}</span>
                </div>

                <h4 style="color: #0f172a; font-size: 0.95rem; border-bottom: 2px solid #38bdf8; padding-bottom: 5px; margin-top: 0;">📋 Detalle de Mediciones en Terreno</h4>
                ${totalPuntos > 0 ? tablaHtml : '<p style="text-align: center; color: #64748b; padding: 20px;">No hay mediciones registradas en la ruta actual.</p>'}
                
                <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 6px; font-size: 0.75rem; color: #475569; line-height: 1.4;">
                    <strong>Nota Técnica:</strong> Los estados de severidad se calculan en base a la norma ISO 20816-3 y estándares de confiabilidad (Crítico: RMS ≥ 7.1 mm/s | Temp ≥ 80°C | FC+ ≥ 5.0). Para un desglose frecuencial detallado y recomendaciones de mantenimiento, refiérase al <b>Informe Espectral</b> de este equipo.
                </div>
            </div>

            <div class="footer-botones" style="padding: 12px 30px; border-top: 1px solid #cbd5e1; text-align: right; background: #e2e8f0;">
                <button type="button" id="btn-imprimir-diario" style="background: #0284c7; color: white; border: none; padding: 8px 20px; font-weight: bold; border-radius: 4px; cursor: pointer;">
                    <span class="material-symbols-outlined" style="font-size: 1.1rem; vertical-align: middle; margin-right: 4px;">print</span> Generar PDF SAP
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-cerrar-diario').addEventListener('click', () => modalResumen.remove());
    document.getElementById('btn-imprimir-diario').addEventListener('click', () => window.print());
}