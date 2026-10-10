// ==========================================
// MÓDULO UI: BARRA LATERAL DINÁMICA (ÁREAS -> EQUIPOS)
// ==========================================
import { refEquipos, refAlertas } from '../core/firebase-config.js';

let datosGlobalesEquipos = {}; // Guardaremos los datos aquí para no consultar a Firebase todo el tiempo al navegar

export function inicializarBarraLateral() {
    escucharEquiposFirebase();
    cargarAlertasTerreno();
}

function escucharEquiposFirebase() {
    const listaCatastro = document.getElementById('lista-catastro');
    if (!listaCatastro) return;

    refEquipos.on('value', (snapshot) => {
        if (!snapshot.exists()) {
            listaCatastro.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px 0;">No hay activos registrados.</p>';
            return;
        }

        datosGlobalesEquipos = snapshot.val();
        renderizarVistaAreas(listaCatastro);
    });
}

// --- NIVEL 1: VISTA DE ÁREAS (CON REGLA DE PORCENTAJES) ---
export function renderizarVistaAreas(contenedor) {
    contenedor.innerHTML = '';
    
    // 1. Agrupar y contar equipos por estado en cada Área
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

    // 2. APLICAR REGLAS DE PORCENTAJE (Configurables)
    const UMBRAL_ROJO = 15;    // Si el 15% o más de los equipos está Rojo -> Área Roja
    const UMBRAL_NARANJA = 25; // Si el 25% o más tiene algún problema (Rojo + Naranja) -> Área Naranja

    Object.values(areasObj).forEach(area => {
        const pctRojo = (area.countRojo / area.totalEquipos) * 100;
        const pctProblemas = ((area.countRojo + area.countNaranja) / area.totalEquipos) * 100;
        
        // El porcentaje de salud es el inverso de los problemas
        area.saludGlobal = Math.round(100 - pctProblemas); 

        if (pctRojo >= UMBRAL_ROJO) {
            area.estadoCritico = 'rojo';
        } else if (pctProblemas >= UMBRAL_NARANJA) {
            area.estadoCritico = 'naranja';
        } else {
            area.estadoCritico = 'verde';
        }
    });

    // 3. Ordenar Áreas: Rojas primero, luego Naranjas, luego Verdes
    const areasArray = Object.values(areasObj).sort((a, b) => {
        const valores = { 'rojo': 3, 'naranja': 2, 'verde': 1 };
        return valores[b.estadoCritico] - valores[a.estadoCritico];
    });

    // 4. Dibujar las tarjetas de Área con el Índice de Salud
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

    // Añadir listener para entrar a la vista de equipos
    document.querySelectorAll('.area-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const nombreArea = e.currentTarget.getAttribute('data-area');
            renderizarVistaEquiposArea(contenedor, areasObj[nombreArea]);
        });
    });
}

// --- NIVEL 2: VISTA DE EQUIPOS POR ÁREA ---
function renderizarVistaEquiposArea(contenedor, areaData) {
    contenedor.innerHTML = '';
    
    // 1. Botón para volver al menú de Áreas
    contenedor.innerHTML = `
        <button id="btn-volver-areas" style="background:transparent; border:none; color:var(--primary-blue); font-size:0.8rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; margin-bottom:10px;">
            <span class="material-symbols-outlined" style="font-size:1.2rem;">arrow_back</span> Volver a Áreas
        </button>
        <h4 style="color:var(--text-muted); margin-bottom:10px; font-size:0.8rem; padding-left:5px;">Equipos en ${areaData.nombre}</h4>
    `;

    // 2. Ordenar equipos: Más críticos arriba
    const equiposOrdenados = areaData.equipos.sort((a, b) => {
        const severidadA = (a.severidad || a.estado || 'verde').toLowerCase();
        const severidadB = (b.severidad || b.estado || 'verde').toLowerCase();
        const valores = { 'rojo': 3, 'critico': 3, 'naranja': 2, 'amarillo': 2, 'verde': 1, 'normal': 1 };
        return (valores[severidadB] || 0) - (valores[severidadA] || 0);
    });

    // 3. Dibujar tarjetas de equipos (Igual que antes)
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
            statusClass = 'status-danger'; // O crea un status-warning
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

    // 4. Funcionalidad del botón de volver
    document.getElementById('btn-volver-areas').addEventListener('click', () => {
        renderizarVistaAreas(contenedor);
    });
}

function cargarAlertasTerreno() {
    // ... [MANTENER EL CÓDIGO ACTUAL DE cargarAlertasTerreno IGUAL QUE ANTES] ...
    // ... no lo modifico para ahorrar espacio aquí, déjalo como estaba.
}