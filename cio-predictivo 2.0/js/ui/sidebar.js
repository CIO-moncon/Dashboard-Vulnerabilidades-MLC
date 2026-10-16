// ==========================================
// MÓDULO UI: BARRA LATERAL DINÁMICA (ÁREAS -> EQUIPOS)
// ==========================================
import { db } from '../core/firebase-config.js';

let datosGlobalesEquipos = {}; 

export function inicializarBarraLateral() {
    escutarEquiposFirebase();
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
        renderizarVistaAreas(listaCatastro);
    });
}

// --- NIVEL 1: VISTA DE ÁREAS (CON COLORES PREDOMINANTES SEGÚN CRITICIDAD) ---
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

    // 2. Calcular Salud y Porcentaje de Fallas
    const UMBRAL_ROJO = 15;    
    const UMBRAL_NARANJA = 25; 

    Object.values(areasObj).forEach(area => {
        const pctRojo = (area.countRojo / area.totalEquipos) * 100;
        const pctProblemas = ((area.countRojo + area.countNaranja) / area.totalEquipos) * 100;
        
        area.saludGlobal = Math.round(100 - pctProblemas); 
        area.pctFallas = pctProblemas; 

        // Definir el estado predominante en base al impacto real de la zona
        if (pctRojo >= UMBRAL_ROJO || area.countRojo > 0) {
            area.estadoCritico = 'rojo'; // Si hay rojos relevantes, domina el rojo
        } else if (pctProblemas >= UMBRAL_NARANJA || area.countNaranja > 0) {
            area.estadoCritico = 'naranja'; // Si hay advertencias, domina el naranja/salmón
        } else {
            area.estadoCritico = 'verde';
        }
    });

    // 3. ORDENAR ÁREAS: Del mayor porcentaje de fallas al menor
    const areasArray = Object.values(areasObj).sort((a, b) => {
        return b.pctFallas - a.pctFallas; 
    });

    // 4. Dibujar las tarjetas de Área aplicando el color predominante exacto
    areasArray.forEach(area => {
        let statusClass = 'status-ok';
        let dotColor = 'var(--iso-zona-a)';
        
        // El color de la tarjeta responde directamente al nivel crítico predominante
        if (area.estadoCritico === 'rojo') {
            statusClass = 'status-danger';
            dotColor = 'var(--iso-zona-d)';
        } else if (area.estadoCritico === 'naranja') {
            statusClass = 'status-warning'; // Asegura el tono naranja/salmón característico
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

    // Listener para entrar a la vista de equipos de esa área
    document.querySelectorAll('.area-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const nombreArea = e.currentTarget.getAttribute('data-area');
            renderizarVistaEquiposArea(contenedor, areasObj[nombreArea]);
        });
    });
}

// --- NIVEL 2: VISTA DE EQUIPOS POR ÁREA (TAMBIÉN CON RANKING DE CRITICIDAD) ---
function renderizarVistaEquiposArea(contenedor, areaData) {
    contenedor.innerHTML = '';
    
    contenedor.innerHTML = `
        <button id="btn-volver-areas" style="background:transparent; border:none; color:var(--primary-blue); font-size:0.8rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; margin-bottom:10px;">
            <span class="material-symbols-outlined" style="font-size:1.2rem;">arrow_back</span> Volver a Áreas
        </button>
        <h4 style="color:var(--text-muted); margin-bottom:10px; font-size:0.8rem; padding-left:5px;">Equipos en ${areaData.nombre}</h4>
    `;

    // Ordenar equipos dentro del área: Más críticos arriba
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
        renderizarVistaAreas(contenedor);
    });
}

// --- GESTIÓN DE ALERTAS DESDE FIREBASE ---
export function cargarAlertasTerreno() {
    const btnTabAlertas = document.querySelector('[data-tab="alertas"]') || document.getElementById('tab-alertas') || document.querySelector('.fa-bell')?.closest('button');
    // Escuchamos la pestaña o nodo de alertas en Firebase
    db.ref('activos_criticos').on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const equipos = snapshot.val();
        let contadorCriticos = 0;
        let htmlAlertas = '<div style="padding: 15px;"><h4 style="color:var(--text-muted); font-size:0.8rem; margin-bottom:10px;">REGISTRO DE ALERTAS ACTIVAS</h4>';

        Object.entries(equipos).forEach(([id, eq]) => {
            const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
            if (sev === 'rojo' || sev === 'critico' || sev === 'naranja') {
                contadorCriticos++;
                const colorBorde = sev === 'rojo' ? 'var(--iso-zona-d)' : 'var(--iso-zona-c)';
                htmlAlertas += `
                    <div class="item-navegable" data-target="${id}" style="background: rgba(0,0,0,0.3); border-left: 4px solid ${colorBorde}; padding: 10px; border-radius: 4px; margin-bottom: 8px; cursor: pointer;">
                        <div style="font-weight: bold; font-size: 0.85rem; color: white;">${eq.tag || id}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${eq.nombre || 'Sin descripción'}</div>
                        <div style="font-size: 0.7rem; color: ${colorBorde}; margin-top: 4px; text-transform: uppercase; font-weight: bold;">${sev === 'rojo' ? 'Alarma Crítica' : 'Alarma Restringida'}</div>
                    </div>
                `;
            }
        });

        if (contadorCriticos === 0) {
            htmlAlertas += '<p style="color: var(--text-muted); text-align: center; font-size: 0.85rem; padding: 20px;">No hay alertas activas en la operación.</p>';
        }
        htmlAlertas += '</div>';

        // Actualizar contador visual de la pestaña de alertas si existe el badge
        const badgeAlertas = document.querySelector('.badge-alertas');
        if (badgeAlertas) badgeAlertas.textContent = contadorCriticos;

        // Si el usuario hace clic en la pestaña de alertas, inyectamos este HTML en el contenedor lateral
        window._htmlAlertasCache = htmlAlertas;
    });
}
