// src/js/ui/activos.js
import { mapaPrincipal } from './mapa.js';

let marcadoresMapa = [];
let estadoGlobal = {
    datosCrudos: {},
    areas: {},
    vistaActual: 'AREAS',
    areaSeleccionada: null
};

export function initLecturaActivos() {
    // 🎯 ESTILO DEL SCROLL INYECTADO AQUÍ DE FORMA SEGURA
    if (!document.getElementById('estilo-scroll-panel')) {
        const style = document.createElement('style');
        style.id = 'estilo-scroll-panel';
        style.innerHTML = `
            #lista-activos {
                overflow-y: auto !important;
                overflow-x: hidden !important;
                max-height: calc(100vh - 180px) !important; /* Reducimos la altura útil */
                padding-right: 8px;
                padding-bottom: 50px !important; /* 🎯 Espacio extra al final para ver el último cuadro */
            }
            #lista-activos::-webkit-scrollbar { width: 6px; }
            #lista-activos::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 4px; }
            #lista-activos::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
            #lista-activos::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.5); }
        `;
        document.head.appendChild(style);
    }

    const dbRef = firebase.database().ref('activos_criticos');

    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        estadoGlobal.datosCrudos = data;
        estadoGlobal.areas = procesarDatosJerarquicos(data);
        
        renderizarVistaActual();
    });
}

// ==========================================
// 1. PROCESAMIENTO DE DATOS Y TRADUCCIÓN
// ==========================================
function procesarDatosJerarquicos(data) {
    const areasMap = {};
    
    Object.keys(data).forEach(key => {
        let eq = { id: key, ...data[key] };
        
        let estadoRaw = String(eq.estado || eq.condicion || eq.status || "VERDE").toUpperCase();
        eq.colorSalud = "VERDE";
        if (estadoRaw.includes("CRÍT") || estadoRaw.includes("CRIT") || estadoRaw.includes("ROJO") || estadoRaw.includes("PELIGRO")) {
            eq.colorSalud = "ROJO";
        } else if (estadoRaw.includes("ALERTA") || estadoRaw.includes("PRECAU") || estadoRaw.includes("AMARILLO")) {
            eq.colorSalud = "AMARILLO";
        }

        const nombreArea = String(eq.area || eq.planta || eq.sector || eq.ubicacion || eq.departamento || 'AREA GENERAL').trim().toUpperCase();
        
        if (!areasMap[nombreArea]) {
            areasMap[nombreArea] = { nombre: nombreArea, equipos: [], criticos: 0, alarmas: 0 };
        }
        
        areasMap[nombreArea].equipos.push(eq);
        if (eq.colorSalud === "ROJO") areasMap[nombreArea].criticos++;
        if (eq.colorSalud === "AMARILLO") areasMap[nombreArea].alarmas++;
    });

    return Object.values(areasMap).sort((a, b) => b.criticos - a.criticos);
}

// ==========================================
// 2. CONTROLADOR DE VISTAS DEL PANEL
// ==========================================
function renderizarVistaActual() {
    const contenedor = document.getElementById('lista-activos');
    if (!contenedor) return;
    
    contenedor.innerHTML = '';
    limpiarMarcadoresMapa();

    const htmlBuscador = `
        <div style="margin-bottom: 15px;">
            <div style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-muted);">search</span>
                <input type="text" placeholder="Buscar equipo o TAG..." style="background: transparent; border: none; color: white; width: 100%; outline: none; font-size: 0.85rem;">
            </div>
        </div>
    `;

    if (estadoGlobal.vistaActual === 'AREAS') {
        contenedor.innerHTML = htmlBuscador;
        estadoGlobal.areas.forEach(area => {
            renderizarTarjetaArea(area, contenedor);
            area.equipos.forEach(eq => renderizarPinEnMapa(eq));
        });
    } else if (estadoGlobal.vistaActual === 'EQUIPOS') {
        renderizarVistaEquiposArea(estadoGlobal.areaSeleccionada, contenedor);
    }
}

// ==========================================
// 3. VISTA NIVEL 1: CATASTRO DE ÁREAS
// ==========================================
function renderizarTarjetaArea(area, contenedor) {
    let colorBorde = "#10b981"; 
    let textoSub = `<span style="color: #10b981;">● 100% Normal</span>`;
    
    if (area.criticos > 0) {
        colorBorde = "#ef4444"; 
        textoSub = `<span style="color: #ef4444;">● ${area.criticos}</span>`;
    } else if (area.alarmas > 0) {
        colorBorde = "#f59e0b"; 
        textoSub = `<span style="color: #f59e0b;">● ${area.alarmas} Alarmas</span>`;
    }

    const tarjeta = document.createElement('div');
    tarjeta.style.cssText = `
        background: #23282e; border-radius: 8px; margin-bottom: 10px; padding: 12px 15px;
        display: flex; justify-content: space-between; align-items: center; cursor: pointer;
        border: 1px solid rgba(255,255,255,0.05); border-left: 4px solid ${colorBorde};
        transition: transform 0.2s, background 0.2s;
    `;

    tarjeta.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span class="material-symbols-outlined" style="color: #94a3b8; font-size: 20px;">account_tree</span>
            <div>
                <h3 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px;">${area.nombre}</h3>
                <div style="font-size: 0.75rem; margin-top: 4px; font-weight: 600;">${textoSub}</div>
            </div>
        </div>
        <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); padding: 4px 10px; border-radius: 12px; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 14px;">engineering</span>
            <span style="color: #38bdf8; font-size: 0.75rem; font-weight: bold;">${area.equipos.length}</span>
        </div>
    `;

    tarjeta.onmouseover = () => tarjeta.style.background = '#2a3038';
    tarjeta.onmouseout = () => tarjeta.style.background = '#23282e';
    
    tarjeta.onclick = () => {
        estadoGlobal.areaSeleccionada = area;
        estadoGlobal.vistaActual = 'EQUIPOS';
        renderizarVistaActual();
    };

    contenedor.appendChild(tarjeta);
}

// ==========================================
// 4. VISTA NIVEL 2: EQUIPOS DEL ÁREA
// ==========================================
function renderizarVistaEquiposArea(area, contenedor) {
    const htmlCabecera = `
        <div style="margin-bottom: 15px;">
            <div style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-muted);">search</span>
                <input type="text" placeholder="Buscar equipo o TAG..." style="background: transparent; border: none; color: white; width: 100%; outline: none; font-size: 0.85rem;">
            </div>
            <button id="btn-volver-areas" style="width: 100%; background: #23282e; color: white; border: 1px solid rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold; margin-bottom: 15px; transition: background 0.2s;">
                <span class="material-symbols-outlined" style="font-size: 18px;">arrow_back</span> Volver a vista de Áreas
            </button>
            <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;">
                <span class="material-symbols-outlined" style="color: #ef4444; font-size: 18px;">push_pin</span>
                <h3 style="margin: 0; color: #38bdf8; font-size: 1rem;">${area.nombre}</h3>
            </div>
        </div>
    `;
    
    contenedor.innerHTML = htmlCabecera;

    document.getElementById('btn-volver-areas').onclick = () => {
        estadoGlobal.vistaActual = 'AREAS';
        renderizarVistaActual();
    };

    const orden = { "ROJO": 3, "AMARILLO": 2, "VERDE": 1 };
    area.equipos.sort((a, b) => orden[b.colorSalud] - orden[a.colorSalud]);

    area.equipos.forEach(eq => {
        let colorBorde = eq.colorSalud === "ROJO" ? "#ef4444" : eq.colorSalud === "AMARILLO" ? "#f59e0b" : "#10b981";
        const tag = eq.tag || eq.nombre || eq.id;
        const tipo = eq.tipo || 'Activo';

        const tarjeta = document.createElement('div');
        tarjeta.style.cssText = `
            background: #1e2329; border-radius: 8px; margin-bottom: 8px; padding: 12px 15px;
            display: flex; justify-content: space-between; align-items: center; cursor: pointer;
            border: 1px solid rgba(255,255,255,0.05); border-left: 4px solid ${colorBorde}; transition: background 0.2s;
        `;

        tarjeta.innerHTML = `
            <div>
                <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: bold; color: white;">${tag}</h4>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #94a3b8;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">build</span> ${tipo}
                </div>
            </div>
            <span style="font-size: 0.65rem; font-weight: bold; padding: 3px 8px; border-radius: 4px; border: 1px solid ${colorBorde}; color: ${colorBorde};">${eq.colorSalud}</span>
        `;

        tarjeta.onclick = () => abrirExpedienteEquipo(eq);
        contenedor.appendChild(tarjeta);
        renderizarPinEnMapa(eq);
    });
}

// ==========================================
// 5. MODAL NIVEL 3: EXPEDIENTE CLÍNICO
// ==========================================
function abrirExpedienteEquipo(eq) {
    let modal = document.getElementById('modal-expediente-cbm');
    if (!modal) {
        modal = document.createElement('dialog');
        modal.id = 'modal-expediente-cbm';
        modal.className = 'modal-nativo';
        modal.style.cssText = `width: 950px; max-width: 95vw; height: 85vh; padding: 0; border-radius: 12px; background: #161b22; color: white; border: 1px solid #30363d; overflow: hidden;`;
        document.body.appendChild(modal);
    }

    const tag = eq.tag || eq.nombre || eq.id;
    let colorSalud = eq.colorSalud === "ROJO" ? "#ef4444" : eq.colorSalud === "AMARILLO" ? "#f59e0b" : "#10b981";

    const componentesDefault = eq.componentes || [];
    let htmlPuntosMedicion = '';
    
    if (componentesDefault.length === 0) {
        htmlPuntosMedicion = `<div style="font-size: 0.8rem; color: #ef4444; margin-bottom: 15px; border: 1px dashed #ef4444; padding: 10px; border-radius: 4px;">⚠️ Equipo sin estructurar. Configura la plantilla.</div>`;
    } else {
        componentesDefault.forEach((comp, index) => {
            const isMalo = eq.colorSalud === "ROJO" && index === 1;
            const puntoColor = isMalo ? "#ef4444" : "#10b981";
            htmlPuntosMedicion += `
                <div style="background: #0d1117; border: 1px solid #30363d; padding: 12px; border-radius: 4px; margin-bottom: 8px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                    <span>${comp}</span> 
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${puntoColor}; display: inline-block; box-shadow: 0 0 5px ${puntoColor};"></span>
                </div>
            `;
        });
    }

    modal.innerHTML = `
        <div style="padding: 15px 20px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; background: #0d1117;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined" style="font-size: 24px; color: white;">precision_manufacturing</span>
                <h2 style="margin: 0; font-size: 1.1rem; font-weight: 700;">Expediente: ${tag}</h2>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-size: 0.75rem; font-weight: bold; padding: 4px 12px; border-radius: 20px; border: 1px solid ${colorSalud}; color: ${colorSalud};">SALUD GLOBAL: ${eq.colorSalud}</span>
                <button id="btn-cerrar-exp" style="background:white; color:black; border:none; border-radius: 4px; width: 28px; height: 28px; cursor:pointer; font-weight:bold;">X</button>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 260px 1fr; height: calc(100% - 62px);">
            <div style="background: #161b22; border-right: 1px solid #30363d; padding: 20px; overflow-y: auto;">
                
                <div id="tab-resumen" style="background: #1f2937; border-left: 3px solid #38bdf8; padding: 10px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">dashboard</span> Resumen Global
                </div>
                <div id="tab-reportes" style="padding: 10px; font-size: 0.85rem; color: #8b949e; margin-bottom: 25px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">engineering</span> Reportes de Terreno
                </div>
                
                <h4 style="margin: 0 0 15px 0; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;"><span class="material-symbols-outlined" style="font-size: 18px;">account_tree</span> Puntos de Medición</h4>
                ${htmlPuntosMedicion}
                
                <button id="btn-configurar-eq" style="width: 100%; background: rgba(56, 189, 248, 0.1); border: 1px dashed #38bdf8; color: #38bdf8; padding: 10px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; margin-top: 10px; font-weight: bold;">
                    <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">edit_document</span> Editar Ficha (OCR / Árbol)
                </button>
            </div>

            <div style="background: #0d1117; padding: 25px; overflow-y: auto;">
                <div id="vista-resumen" style="display: block;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3 style="margin: 0; color: #38bdf8; font-size: 1.1rem;">Resumen de Condición Global</h3>
                        <button id="btn-mover-pin" style="background: rgba(56, 189, 248, 0.1); border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span> Mover Pin en Mapa
                        </button>
                    </div>

                    <div style="background: #161b22; border: 1px solid #30363d; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: ${eq.especificaciones ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.8rem; color: #c9d1d9;">
                        <div><b>Potencia:</b> ${eq.especificaciones?.potencia || '-'}</div>
                        <div><b>RPM:</b> ${eq.especificaciones?.rpm || '-'}</div>
                        <div><b>Rodamientos DE/NDE:</b> ${eq.especificaciones?.rodDe || '-'} / ${eq.especificaciones?.rodNde || '-'}</div>
                        <div><b>Ratio Reductor:</b> ${eq.especificaciones?.redRatio || '-'}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;">
                        <div style="background: #161b22; border: 1px solid #30363d; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.75rem; color: #8b949e; font-weight: bold; margin-bottom: 10px;">Total Puntos</div>
                            <div style="font-size: 1.5rem; font-weight: bold;">${componentesDefault.length}</div>
                        </div>
                        <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.75rem; color: #ef4444; font-weight: bold; margin-bottom: 10px;">Puntos Críticos</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${eq.colorSalud === 'ROJO' ? '1' : '0'}</div>
                        </div>
                        <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.75rem; color: #f59e0b; font-weight: bold; margin-bottom: 10px;">En Alarma</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${eq.colorSalud === 'AMARILLO' ? '1' : '0'}</div>
                        </div>
                    </div>

                    <h3 style="margin: 0 0 20px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: #38bdf8;">timeline</span> Bitácora Maestra
                    </h3>
                    
                    <div style="border-left: 2px solid #30363d; margin-left: 10px; padding-left: 20px; position: relative;">
                        <span style="position: absolute; left: -7px; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #161b22; border: 2px solid ${colorSalud};"></span>
                        <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: #8b949e;">
                                    <span style="background: rgba(139, 92, 246, 0.2); color: #c084fc; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(139,92,246,0.3);">ANALISTA CIO</span>
                                    Última medición: ${eq.estado || eq.condicion || 'Normal'}
                                </div>
                            </div>
                            <div style="font-size: 0.85rem; color: #c9d1d9; line-height: 1.6;">
                                ${componentesDefault.length > 0 ? '<b>Estructura base:</b><br>' + componentesDefault.join('<br>') : 'El equipo aún no tiene puntos CBM definidos.'}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="vista-reportes" style="display: none;">
                    <h3 style="margin: 0 0 20px 0; color: #38bdf8; font-size: 1.1rem;">Acciones Tácticas</h3>
                    <div style="display: flex; gap: 15px;">
                        <button style="background: rgba(34, 197, 94, 0.1); border: 1px solid #22c55e; color: #22c55e; padding: 12px 18px; border-radius: 6px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: bold;">
                            <span class="material-symbols-outlined">chat</span> Alerta WhatsApp
                        </button>
                        <button style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; padding: 12px 18px; border-radius: 6px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: bold;">
                            <span class="material-symbols-outlined">picture_as_pdf</span> Generar PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.showModal();

    document.getElementById('btn-cerrar-exp').onclick = () => modal.close();

    const tabResumen = document.getElementById('tab-resumen');
    const tabReportes = document.getElementById('tab-reportes');
    const vistaResumen = document.getElementById('vista-resumen');
    const vistaReportes = document.getElementById('vista-reportes');

    tabResumen.onclick = () => {
        vistaResumen.style.display = 'block'; vistaReportes.style.display = 'none';
        tabResumen.style.background = '#1f2937'; tabResumen.style.borderLeft = '3px solid #38bdf8'; tabResumen.style.color = 'white';
        tabReportes.style.background = 'transparent'; tabReportes.style.borderLeft = '3px solid transparent'; tabReportes.style.color = '#8b949e';
    };

    tabReportes.onclick = () => {
        vistaResumen.style.display = 'none'; vistaReportes.style.display = 'block';
        tabReportes.style.background = '#1f2937'; tabReportes.style.borderLeft = '3px solid #38bdf8'; tabReportes.style.color = 'white';
        tabResumen.style.background = 'transparent'; tabResumen.style.borderLeft = '3px solid transparent'; tabResumen.style.color = '#8b949e';
    };

    document.getElementById('btn-mover-pin').onclick = () => {
        modal.close();
        if (mapaPrincipal) {
            const lat = eq.latitud || -28.3180 + ((Math.random() - 0.5) * 0.01);
            const lng = eq.longitud || -70.8040 + ((Math.random() - 0.5) * 0.01);
            mapaPrincipal.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });
        }
    };

    document.getElementById('btn-configurar-eq').onclick = () => {
        modal.close(); 
        window.abrirModalConfigurador(eq); 
    };
}

function renderizarPinEnMapa(eq) {
    if (!mapaPrincipal) return;
    const lat = eq.latitud || -28.3180 + ((Math.random() - 0.5) * 0.01);
    const lng = eq.longitud || -70.8040 + ((Math.random() - 0.5) * 0.01);
    const marker = L.marker([lat, lng]).addTo(mapaPrincipal);
    marker.bindPopup(`<b>${eq.tag || eq.id}</b><br>Salud: ${eq.colorSalud}`);
    marcadoresMapa.push(marker);
}

function limpiarMarcadoresMapa() {
    if (!mapaPrincipal) return;
    marcadoresMapa.forEach(m => mapaPrincipal.removeLayer(m));
    marcadoresMapa = [];
}

// ==========================================
// 6. FUNCIÓN GLOBAL: ABRIR CONFIGURADOR DE EDICIÓN
// ==========================================
window.abrirModalConfigurador = (eq) => {
    const modalNuevo = document.getElementById('modal-nuevo-equipo');
    const inputTag = document.getElementById('eq-tag');
    
    inputTag.value = eq.tag || eq.id;
    inputTag.dataset.firebaseKey = eq.id; 
    inputTag.disabled = true; 
    inputTag.style.opacity = '0.5';

    const selectArea = document.getElementById('eq-area');
    const areaReal = eq.area || eq.planta || eq.sector;
    if(areaReal) {
        let optionExists = Array.from(selectArea.options).some(opt => opt.value.toUpperCase() === areaReal.toUpperCase());
        if(!optionExists) selectArea.add(new Option(areaReal, areaReal));
        selectArea.value = areaReal;
    }

    const selectTipo = document.getElementById('eq-tipo');
    if(eq.tipo) {
        let optionExists = Array.from(selectTipo.options).some(opt => opt.value === eq.tipo);
        if(!optionExists) selectTipo.add(new Option(eq.tipo, eq.tipo));
        selectTipo.value = eq.tipo;
        
        if(window.generarArbolDinamico) {
            window.generarArbolDinamico(eq.tipo);
            
            if(eq.componentes && eq.componentes.length > 0) {
                setTimeout(() => {
                    const inputsArbol = document.querySelectorAll('#contenedor-arbol-componentes input');
                    inputsArbol.forEach((input, index) => {
                        if(eq.componentes[index]) {
                            input.value = eq.componentes[index];
                            input.style.border = "1px solid var(--accent-blue)";
                        }
                    });
                }, 100);
            }
        }
    }

    if(eq.especificaciones) {
        document.getElementById('eq-potencia').value = eq.especificaciones.potencia || '';
        document.getElementById('eq-rpm').value = eq.especificaciones.rpm || '';
        document.getElementById('eq-carcasa').value = eq.especificaciones.carcasa || '';
        document.getElementById('eq-rod-de').value = eq.especificaciones.rodDe || '';
        document.getElementById('eq-rod-nde').value = eq.especificaciones.rodNde || '';
        document.getElementById('eq-red-modelo').value = eq.especificaciones.redModelo || '';
        document.getElementById('eq-red-ratio').value = eq.especificaciones.redRatio || '';
        document.getElementById('eq-red-rpm').value = eq.especificaciones.redRpm || '';
        document.getElementById('eq-acople').value = eq.especificaciones.acople || '';
    }

    modalNuevo.showModal();
}