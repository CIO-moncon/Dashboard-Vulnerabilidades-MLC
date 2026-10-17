// ==========================================
// MÓDULO UI: BARRA LATERAL DINÁMICA (ÁREAS -> EQUIPOS)
// ==========================================
import { db } from '../core/firebase-config.js';

let datosGlobalesEquipos = {}; 
let areaSeleccionadaActual = 'TODOS';
let textoBusquedaActual = '';

export function inicializarBarraLateral() {
    escutarEquiposFirebase();
    configurarBuscadorGlobal();
}

function escutarEquiposFirebase() {
    const listaCatastro = document.getElementById('lista-catastro');
    if (!listaCatastro) return;

    db.ref('activos_criticos').on('value', (snapshot) => {
        if (!snapshot.exists()) {
            listaCatastro.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px 0;">No hay activos registrados.</p>';
            return;
        }

        datosGlobalesEquipos = snapshot.val();
        
        if (textoBusquedaActual.length > 0) {
            renderizarVistaBusqueda(listaCatastro, textoBusquedaActual);
        } else if (areaSeleccionadaActual !== 'TODOS') {
            const areasObj = procesarAgrupacionAreas();
            if (areasObj[areaSeleccionadaActual]) {
                renderizarVistaEquiposArea(listaCatastro, areasObj[areaSeleccionadaActual]);
            } else {
                renderizarVistaAreas(listaCatastro);
            }
        } else {
            renderizarVistaAreas(listaCatastro);
        }
    });
}

function configurarBuscadorGlobal() {
    const inputBuscador = document.getElementById('buscador-tags');
    if (!inputBuscador) return;

    inputBuscador.addEventListener('input', (e) => {
        textoBusquedaActual = e.target.value.trim().toLowerCase();
        const listaCatastro = document.getElementById('lista-catastro');
        if (!listaCatastro) return;

        if (textoBusquedaActual.length > 0) {
            renderizarVistaBusqueda(listaCatastro, textoBusquedaActual);
            if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
                window.filtrarMapaPorAreaOSearch('SEARCH', textoBusquedaActual);
            }
        } else {
            if (areaSeleccionadaActual !== 'TODOS') {
                const areasObj = procesarAgrupacionAreas();
                renderizarVistaEquiposArea(listaCatastro, areasObj[areaSeleccionadaActual]);
                if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
                    window.filtrarMapaPorAreaOSearch('AREA', areaSeleccionadaActual);
                }
            } else {
                renderizarVistaAreas(listaCatastro);
                if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
                    window.filtrarMapaPorAreaOSearch('TODOS', '');
                }
            }
        }
    });
}

function procesarAgrupacionAreas() {
    const areasObj = {};
    Object.keys(datosGlobalesEquipos).forEach(id => {
        const eq = datosGlobalesEquipos[id];
        const areaName = eq.area || 'Sin Área Asignada';
        
        if (!areasObj[areaName]) {
            areasObj[areaName] = { 
                nombre: areaName, 
                totalEquipos: 0, 
                countRojo: 0,
                countNaranja: 0,
                estadoCritico: 'verde',
                equipos: [] 
            };
        }
        
        areasObj[areaName].totalEquipos++;
        areasObj[areaName].equipos.push({ ...eq, idFirebase: id });

        const severidadEq = (eq.severidad || eq.estado || 'verde').toLowerCase();
        if (severidadEq === 'rojo' || severidadEq === 'critico') {
            areasObj[areaName].countRojo++;
        } else if (severidadEq === 'naranja' || severidadEq === 'amarillo') {
            areasObj[areaName].countNaranja++;
        }
    });

    const UMBRAL_ROJO = 15;    
    const UMBRAL_NARANJA = 25; 

    Object.values(areasObj).forEach(area => {
        const pctRojo = (area.countRojo / area.totalEquipos) * 100;
        const pctProblemas = ((area.countRojo + area.countNaranja) / area.totalEquipos) * 100;
        
        area.saludGlobal = Math.round(100 - pctProblemas); 
        area.pctFallas = pctProblemas; 

        if (pctRojo >= UMBRAL_ROJO || area.countRojo > 0) {
            area.estadoCritico = 'rojo';
        } else if (pctProblemas >= UMBRAL_NARANJA || area.countNaranja > 0) {
            area.estadoCritico = 'naranja';
        } else {
            area.estadoCritico = 'verde';
        }
    });

    return areasObj;
}

// --- NIVEL 1: VISTA DE ÁREAS ---
export function renderizarVistaAreas(contenedor) {
    contenedor.innerHTML = '';
    areaSeleccionadaActual = 'TODOS';

    if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
        window.filtrarMapaPorAreaOSearch('TODOS', '');
    }

    const areasObj = procesarAgrupacionAreas();
    const areasArray = Object.values(areasObj).sort((a, b) => b.pctFallas - a.pctFallas);

    if (areasArray.length === 0) {
        contenedor.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px 0;">No hay áreas registradas.</p>';
        return;
    }

    areasArray.forEach(area => {
        let statusClass = 'status-ok';
        let dotColor = 'var(--iso-zona-a)';
        
        if (area.estadoCritico === 'rojo') {
            statusClass = 'status-danger';
            dotColor = 'var(--iso-zona-d)';
        } else if (area.estadoCritico === 'naranja') {
            statusClass = 'status-warning';
            dotColor = 'var(--iso-zona-c)';
        }

        const cardHTML = `
            <div class="area-card-v2 ${statusClass} area-nav-item" data-area="${area.nombre}" style="cursor:pointer;">
                <span class="material-symbols-outlined icon">domain</span>
                <div class="info">
                    <h4>${area.nombre}</h4>
                    <p><span class="dot" style="background: ${dotColor};"></span> <span style="color: ${dotColor};">Salud: ${area.saludGlobal}%</span></p>
                </div>
                <div class="badge-count">
                    <span class="material-symbols-outlined" style="font-size: 0.9rem;">widgets</span> ${area.totalEquipos}
                </div>
            </div>
        `;
        contenedor.insertAdjacentHTML('beforeend', cardHTML);
    });

    document.querySelectorAll('.area-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const nombreArea = e.currentTarget.getAttribute('data-area');
            areaSeleccionadaActual = nombreArea;
            renderizarVistaEquiposArea(contenedor, areasObj[nombreArea]);

            if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
                window.filtrarMapaPorAreaOSearch('AREA', nombreArea);
            }
        });
    });
}

// --- NIVEL 2: VISTA DE EQUIPOS POR ÁREA ---
function renderizarVistaEquiposArea(contenedor, areaData) {
    contenedor.innerHTML = '';
    
    contenedor.innerHTML = `
        <button id="btn-volver-areas" style="background:transparent; border:none; color:var(--primary-blue); font-size:0.8rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; margin-bottom:10px;">
            <span class="material-symbols-outlined" style="font-size:1.2rem;">arrow_back</span> Volver a Áreas
        </button>
        <h4 style="color:var(--text-muted); margin-bottom:10px; font-size:0.8rem; padding-left:5px;">Equipos en ${areaData.nombre}</h4>
    `;

    const equiposOrdenados = areaData.equipos.sort((a, b) => {
        const severidadA = (a.severidad || a.estado || 'verde').toLowerCase();
        const severidadB = (b.severidad || b.estado || 'verde').toLowerCase();
        const valores = { 'rojo': 3, 'critico': 3, 'naranja': 2, 'amarillo': 2, 'verde': 1, 'normal': 1 };
        return (valores[severidadB] || 0) - (valores[severidadA] || 0);
    });

    equiposOrdenados.forEach(eq => {
        const severidad = (eq.severidad || eq.estado || 'verde').toLowerCase();
        
        let statusClass = 'status-ok';
        let dotColor = 'var(--iso-zona-a)';
        let statusText = 'Operación Normal';
        let icon = 'account_tree';

        if (severidad === 'rojo' || severidad === 'critico') {
            statusClass = 'status-danger';
            dotColor = 'var(--iso-zona-d)';
            statusText = 'Alarma Crítica';
        } else if (severidad === 'naranja' || severidad === 'amarillo') {
            statusClass = 'status-danger';
            dotColor = 'var(--iso-zona-c)';
            statusText = 'Alarma Restringida';
        }

        if (eq.tipo_equipo && eq.tipo_equipo.toLowerCase().includes('chancador')) icon = 'precision_manufacturing';
        if (eq.tipo_equipo && eq.tipo_equipo.toLowerCase().includes('correa')) icon = 'conveyor_belt';

        const cardHTML = `
            <div class="area-card-v2 ${statusClass} item-navegable" data-target="${eq.idFirebase}" style="margin-bottom:8px;">
                <span class="material-symbols-outlined icon">${icon}</span>
                <div class="info">
                    <h4>${eq.tag || eq.idFirebase}</h4>
                    <p><span class="dot" style="background: ${dotColor};"></span> <span style="color: ${dotColor};">${statusText}</span></p>
                </div>
            </div>
        `;
        contenedor.insertAdjacentHTML('beforeend', cardHTML);
    });

    document.getElementById('btn-volver-areas').addEventListener('click', () => {
        areaSeleccionadaActual = 'TODOS';
        renderizarVistaAreas(contenedor);
        if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
            window.filtrarMapaPorAreaOSearch('TODOS', '');
        }
    });
}

// --- VISTA DE BÚSQUEDA GLOBAL ---
function renderizarVistaBusqueda(contenedor, texto) {
    contenedor.innerHTML = `
        <button id="btn-volver-areas-search" style="background:transparent; border:none; color:var(--primary-blue); font-size:0.8rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; margin-bottom:10px;">
            <span class="material-symbols-outlined" style="font-size:1.2rem;">arrow_back</span> Volver a Áreas
        </button>
        <h4 style="color:var(--text-muted); margin-bottom:10px; font-size:0.8rem; padding-left:5px;">Resultados para: "${texto}"</h4>
    `;

    const resultados = Object.entries(datosGlobalesEquipos).filter(([idKey, eq]) => {
        const tag = (eq.tag || '').toLowerCase();
        const nombre = (eq.nombre || '').toLowerCase();
        const idNorm = idKey.toLowerCase();
        return tag.includes(texto) || nombre.includes(texto) || idNorm.includes(texto);
    });

    if (resultados.length === 0) {
        contenedor.insertAdjacentHTML('beforeend', '<p style="color:var(--text-muted); text-align:center; padding:20px; font-size:0.8rem;">No se encontraron equipos.</p>');
    } else {
        resultados.forEach(([idFirebase, eq]) => {
            const severidad = (eq.severidad || eq.estado || 'verde').toLowerCase();
            let dotColor = severidad === 'rojo' || severidad === 'critico' ? 'var(--iso-zona-d)' : (severidad === 'naranja' || severidad === 'amarillo' ? 'var(--iso-zona-c)' : 'var(--iso-zona-a)');
            
            const cardHTML = `
                <div class="area-card-v2 status-ok item-navegable" data-target="${idFirebase}" style="margin-bottom:8px;">
                    <span class="material-symbols-outlined icon">precision_manufacturing</span>
                    <div class="info">
                        <h4>${eq.tag || idFirebase}</h4>
                        <p><span class="dot" style="background: ${dotColor};"></span> <span style="color: ${dotColor};">${eq.area || 'Sin Área'}</span></p>
                    </div>
                </div>
            `;
            contenedor.insertAdjacentHTML('beforeend', cardHTML);
        });
    }

    document.getElementById('btn-volver-areas-search').addEventListener('click', () => {
        const inputBuscador = document.getElementById('buscador-tags');
        if (inputBuscador) inputBuscador.value = '';
        textoBusquedaActual = '';
        areaSeleccionadaActual = 'TODOS';
        renderizarVistaAreas(contenedor);
        if (typeof window.filtrarMapaPorAreaOSearch === 'function') {
            window.filtrarMapaPorAreaOSearch('TODOS', '');
        }
    });
}

// --- GESTIÓN DE ALERTAS DESDE FIREBASE ---
export function cargarAlertasTerreno() {
    db.ref('activos_criticos').on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const equipos = snapshot.val();
        let contadorCriticos = 0;

        Object.entries(equipos).forEach(([, eq]) => {
            const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
            if (sev === 'rojo' || sev === 'critico' || sev === 'naranja') {
                contadorCriticos++;
            }
        });

        const badgeAlertas = document.querySelector('.badge-alertas');
        if (badgeAlertas) badgeAlertas.textContent = contadorCriticos;
    });
}