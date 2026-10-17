// ==========================================
// MÓDULO PRINCIPAL: APP.JS (CORREGIDO Y ESTABLE)
// ==========================================
import { auth, db } from './core/firebase-config.js';
import { inicializarBarraLateral } from './ui/sidebar.js'; 
import { renderizarExpediente } from './ui/expediente.js';
import { renderizarModuloPMS } from './ui/pms.js';

let datosGlobalesEquipos = {}; 
let mapaActivo = null; 
let listaMarcadoresActivos = []; 
let diccionarioMarcadores = {};  
let nivelFiltroActual = 'TODOS'; 
let esVista3D = true;

let filtroModoMapa = 'TODOS';
let filtroValorMapa = '';

const dbAlertas = db.ref('alertas_terreno');

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            mostrarPlataforma(user);
        } else {
            document.getElementById('vista-login').classList.remove('oculta');
            document.getElementById('vista-app').classList.add('oculta');
        }
    });

    const btnIngresar = document.getElementById('btn-ingresar');
    if (btnIngresar) {
        btnIngresar.addEventListener('click', () => {
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value.trim();
            const errorDiv = document.getElementById('login-error');
            
            if (!email || !pass) return errorDiv.textContent = 'Ingrese correo y contraseña.';
            
            btnIngresar.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Autenticando...`;
            btnIngresar.disabled = true;
            errorDiv.textContent = '';
            
            auth.signInWithEmailAndPassword(email, pass)
                .then(() => {
                    btnIngresar.innerHTML = `Autenticar <span class="material-symbols-outlined">login</span>`;
                    btnIngresar.disabled = false;
                })
                .catch(() => {
                    errorDiv.textContent = 'Usuario o contraseña incorrectos.';
                    btnIngresar.innerHTML = `Autenticar <span class="material-symbols-outlined">login</span>`;
                    btnIngresar.disabled = false;
                });
        });
    }

    if (dbAlertas) {
        dbAlertas.on('value', snap => {
            renderizarAlertasTerrenoManager(snap.val());
        });
    }
});

function mostrarPlataforma(user) {
    document.getElementById('vista-login').classList.add('oculta');
    document.getElementById('vista-app').classList.remove('oculta');
    
    let nombreTemp = user.email.split('@')[0].replace('.', ' ');
    document.getElementById('perfil-nombre').textContent = nombreTemp;
    document.getElementById('perfil-rol').textContent = 'Analista CBM';
    document.getElementById('avatar-iniciales').textContent = nombreTemp.substring(0, 2).toUpperCase();

    inicializarApp();
}

function inicializarApp() {
    inicializarBarraLateral();

    db.ref('activos_criticos').on('value', snapshot => {
        if (snapshot.exists()) {
            datosGlobalesEquipos = snapshot.val();
            const espacioDinamico = document.getElementById('espacio-trabajo-dinamico');
            if (espacioDinamico && (!espacioDinamico.innerHTML.includes('mapa-satelital') || espacioDinamico.innerHTML.includes('Cargando Dashboard'))) {
                if (!espacioDinamico.innerHTML.includes('panel-industrial')) {
                    renderizarMapaPlanta();
                }
            } else if (mapaActivo) {
                dibujarPinesEnMapa();
            }
        }
    });

    document.addEventListener('click', async (e) => {
        const btnEquipo = e.target.closest('.item-navegable');
        if (btnEquipo) {
            if (document.body.classList.contains('modo-kiosko-activo')) {
                document.body.classList.remove('modo-kiosko-activo');
                const sidebar = document.querySelector('aside') || document.querySelector('.sidebar-principal');
                const topbar = document.querySelector('header') || document.querySelector('.topbar');
                if (sidebar) sidebar.style.removeProperty('display');
                if (topbar) topbar.style.removeProperty('display');

                const btnOriginal = document.getElementById('kiosko');
                if (btnOriginal) {
                    btnOriginal.innerHTML = '<span class="material-symbols-outlined">fullscreen</span> Kiosko';
                }

                const btnFlotante = document.getElementById('btn-salir-kiosko-flotante');
                if (btnFlotante) btnFlotante.style.display = 'none';
            }

            const idFirebase = btnEquipo.getAttribute('data-target');
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');

            if (btnEquipo.closest('.sidebar-principal')) {
                btnEquipo.style.border = '1px solid var(--primary-blue)';
            }

            if (mapaActivo) {
                mapaActivo.remove();
                mapaActivo = null;
            }

            renderizarExpediente(idFirebase, 'espacio-trabajo-dinamico');
            return;
        }

        const btnSalir = e.target.closest('#btn-salir');
        if (btnSalir) {
            const confirmado = await UI.confirmar("¿Estás seguro de cerrar tu sesión en el sistema?", "Cerrar Sesión");
            if (confirmado) {
                auth.signOut().then(() => window.location.reload());
            }
            return;
        }

        const btnVolver = e.target.closest('#btn-volver-dashboard') || e.target.closest('#btn-cerrar-expediente');
        if (btnVolver) {
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
            if (window.miniMapaInstancia) {
                window.miniMapaInstancia.remove();
                window.miniMapaInstancia = null;
            }
            renderizarMapaPlanta();
            return;
        }

        const btnCrearEquipo = e.target.closest('#btn-crear-equipo');
        if (btnCrearEquipo) {
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
            if (mapaActivo) { mapaActivo.remove(); mapaActivo = null; }
            renderizarExpediente('NUEVO', 'espacio-trabajo-dinamico');
            return;
        }

        const btnModuloPMS = e.target.closest('#btn-modulo-pms');
        if (btnModuloPMS) {
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
            if (mapaActivo) { mapaActivo.remove(); mapaActivo = null; }
            renderizarModuloPMS('espacio-trabajo-dinamico');
            return;
        }
    });
}

window.abrirModalAlertasTerreno = function() {
    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) modal.style.display = 'flex';
    renderizarAlertasTerrenoModal();
};

function obtenerIdEquipoPorTag(tagBuscado) {
    if (!tagBuscado) return '';
    const tagLimpio = tagBuscado.trim().toUpperCase();
    const tagNormalizado = tagLimpio.replace(/\s+/g, '_');

    if (datosGlobalesEquipos[tagNormalizado]) return tagNormalizado;
    if (datosGlobalesEquipos[tagLimpio]) return tagLimpio;

    for (const [idKey, eq] of Object.entries(datosGlobalesEquipos)) {
        if (eq.tag && eq.tag.trim().toUpperCase() === tagLimpio) {
            return idKey;
        }
    }

    return tagNormalizado;
}

window.irAExpedienteDesdeAlerta = function(tag) {
    const idFirebase = obtenerIdEquipoPorTag(tag);
    if (!idFirebase) return;

    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) modal.style.display = 'none';

    document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
    const itemSidebar = document.querySelector(`.sidebar-principal .item-navegable[data-target="${idFirebase}"]`);
    if (itemSidebar) {
        itemSidebar.style.border = '1px solid var(--primary-blue)';
        itemSidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (mapaActivo) {
        mapaActivo.remove();
        mapaActivo = null;
    }

    renderizarExpediente(idFirebase, 'espacio-trabajo-dinamico');
};

window.ubicarEnMapaDesdeAlerta = function(tag) {
    const idFirebase = obtenerIdEquipoPorTag(tag);
    if (!idFirebase) return;

    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) modal.style.display = 'none';

    if (nivelFiltroActual !== 'TODOS') {
        nivelFiltroActual = 'TODOS';
    }

    if (!mapaActivo || !document.getElementById('mapa-satelital')) {
        document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
        renderizarMapaPlanta();
    } else {
        dibujarPinesEnMapa();
    }

    setTimeout(() => {
        const claveNorm = tag.trim().toUpperCase().replace(/\s+/g, '_');
        const infoPin = diccionarioMarcadores[idFirebase] || diccionarioMarcadores[claveNorm];

        if (infoPin && mapaActivo) {
            Object.values(diccionarioMarcadores).forEach(item => {
                if (item.popup && item.popup.isOpen()) item.popup.remove();
            });

            mapaActivo.flyTo({
                center: infoPin.coords,
                zoom: 18.5,
                pitch: 65,
                bearing: -20,
                speed: 1.3,
                curve: 1.4,
                essential: true
            });

            setTimeout(() => {
                infoPin.marker.togglePopup();
            }, 950);
        } else {
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast(`El equipo ${tag} no tiene coordenadas GPS asignadas. Abriendo su expediente...`, "advertencia");
            }
            window.irAExpedienteDesdeAlerta(tag);
        }
    }, 250);
};

function renderizarAlertasTerrenoManager(alertasData) {
    const contenedor = document.getElementById('lista-alertas-terreno-container');
    const badge = document.getElementById('badgeAlertasTerreno');
    
    if (!alertasData) {
        if (badge) badge.innerText = '0';
        if (contenedor) contenedor.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No hay reportes de terreno recibidos.</p>';
        return;
    }

    const keys = Object.keys(alertasData);
    if (badge) badge.innerText = keys.length;
    if (!contenedor) return;

    contenedor.innerHTML = '';
    keys.reverse().forEach(key => {
        const al = alertasData[key];
        const fecha = al.timestamp ? new Date(al.timestamp).toLocaleString() : 'Fecha no registrada';
        const tagSeguro = (al.tag || '').replace(/'/g, "\\'");
        
        let colorSev = '#10b981';
        if (al.severidad === 'Rojo') colorSev = '#ef4444';
        else if (al.severidad === 'Naranja') colorSev = '#f97316';
        else if (al.severidad === 'Amarillo') colorSev = '#eab308';

        let htmlFoto = '';
        if (al.fotoBase64) {
            htmlFoto = `<img src="${al.fotoBase64}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-glass); cursor: pointer; flex-shrink: 0;" onclick="event.stopPropagation(); window.open('${al.fotoBase64}')" title="Ver foto ampliada">`;
        }

        contenedor.innerHTML += `
            <div onclick="window.irAExpedienteDesdeAlerta('${tagSeguro}')" 
                 onmouseover="this.style.background='rgba(56, 189, 248, 0.08)'; this.style.borderColor='rgba(56, 189, 248, 0.4)';" 
                 onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='var(--border-glass)';"
                 style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-left: 4px solid ${colorSev}; padding: 14px; border-radius: 8px; display: flex; gap: 15px; align-items: flex-start; cursor: pointer; transition: all 0.2s ease;"
                 title="Haz clic para abrir el expediente de ${al.tag}">
                ${htmlFoto}
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: white; font-size: 1rem; font-family: monospace; display: flex; align-items: center; gap: 6px;">
                            TAG: ${al.tag}
                            <span class="material-symbols-outlined" style="font-size: 1rem; color: var(--primary-blue);">open_in_new</span>
                        </strong>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${fecha}</span>
                    </div>
                    <span style="font-size: 0.8rem; color: #38bdf8; font-weight: 600;">Área: ${al.area} | Componente: ${al.componente || 'General'}</span>
                    <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #e2e8f0; white-space: pre-line; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">${al.detalle}</p>
                    
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button onclick="event.stopPropagation(); window.ubicarEnMapaDesdeAlerta('${tagSeguro}')" 
                                style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 0.95rem;">my_location</span> Ver en Mapa 3D
                        </button>
                        <button onclick="event.stopPropagation(); window.irAExpedienteDesdeAlerta('${tagSeguro}')" 
                                style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 0.95rem;">folder_open</span> Abrir Expediente
                        </button>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); window.eliminarAlertaTerreno('${key}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; flex-shrink: 0;" title="Eliminar reporte">🗑️</button>
            </div>
        `;
    });
}

window.renderizarAlertasTerrenoModal = function() {
    if (dbAlertas) {
        dbAlertas.once('value', snap => {
            renderizarAlertasTerrenoManager(snap.val());
        });
    }
};

window.eliminarAlertaTerreno = function(key) {
    if (confirm("¿Estás seguro de eliminar este reporte de la bandeja?")) {
        dbAlertas.child(key).remove().then(() => {
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast("Reporte de terreno eliminado.", "exito");
            }
        });
    }
};

window.filtrarMapaPorNivel = function(nivel) {
    nivelFiltroActual = nivel;
    document.querySelectorAll('.btn-filtro-nivel').forEach(btn => {
        const activo = btn.getAttribute('data-nivel') === nivel;
        btn.style.background = activo ? '#38bdf8' : 'rgba(255,255,255,0.05)';
        btn.style.color = activo ? '#0f172a' : '#e2e8f0';
        btn.style.borderColor = activo ? '#38bdf8' : 'var(--border-glass)';
    });
    dibujarPinesEnMapa();
};

window.alternarPerspectivaMapa = function() {
    if (!mapaActivo) return;
    esVista3D = !esVista3D;
    const btn = document.getElementById('btn-toggle-3d');
    if (esVista3D) {
        mapaActivo.easeTo({ pitch: 60, bearing: -15, duration: 900 });
        if (btn) btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">3d_rotation</span> Modo 3D`;
    } else {
        mapaActivo.easeTo({ pitch: 0, bearing: 0, duration: 900 });
        if (btn) btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">map</span> Plano 2D`;
    }
};

window.filtrarMapaPorAreaOSearch = function(modo, valor) {
    filtroModoMapa = modo;
    filtroValorMapa = valor ? valor.toLowerCase() : '';
    if (typeof dibujarPinesEnMapa === 'function') {
        dibujarPinesEnMapa();
    }
};

function renderizarMapaPlanta() {
    const contenedor = document.getElementById('espacio-trabajo-dinamico');
    if (!contenedor) return;

    if (mapaActivo) {
        mapaActivo.remove();
        mapaActivo = null;
    }

    const nivelesDisponibles = ['TODOS', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel -1', 'Nivel -2'];
    const htmlBotonesNivel = nivelesDisponibles.map(niv => {
        const activo = nivelFiltroActual === niv;
        return `
            <button class="btn-filtro-nivel" data-nivel="${niv}" onclick="window.filtrarMapaPorNivel('${niv}')"
                style="background: ${activo ? '#38bdf8' : 'rgba(255,255,255,0.05)'}; color: ${activo ? '#0f172a' : '#e2e8f0'}; border: 1px solid ${activo ? '#38bdf8' : 'var(--border-glass)'}; padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
                ${niv === 'TODOS' ? 'Global' : niv}
            </button>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div style="animation: fadeIn 0.4s ease; padding: 10px; height: 100%; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 15px; background: rgba(15, 23, 42, 0.75); padding: 14px 22px; border-radius: 12px; border: 1px solid var(--border-glass);">
                <div>
                    <h2 style="color: white; font-size: 1.35rem; margin: 0 0 4px 0; display:flex; align-items:center; gap:10px;">
                        <span class="material-symbols-outlined" style="color: var(--primary-blue);">domain</span> Monitoreo Geoespacial de Activos — Planta Mina Los Colorados
                    </h2>
                    <p style="color: var(--text-muted); margin: 0; font-size: 0.78rem;">Visualización tridimensional y geolocalización de activos críticos. Controles: <kbd style="background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px;">Clic Derecho</kbd> para inclinar/rotar.</p>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 4px;">Cota / Nivel:</span>
                    ${htmlBotonesNivel}
                    <button id="btn-toggle-3d" onclick="window.alternarPerspectivaMapa()"
                        style="margin-left: 8px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">3d_rotation</span> ${esVista3D ? 'Modo 3D' : 'Plano 2D'}
                    </button>
                </div>
            </div>
            
            <div id="mapa-satelital" style="flex-grow: 1; min-height: 520px; border-radius: 12px; border: 1px solid var(--border-glass); overflow: hidden; position: relative; z-index: 1;"></div>
        </div>
    `;

    mapaActivo = new maplibregl.Map({
        container: 'mapa-satelital',
        style: {
            version: 8,
            sources: {
                'esri-satellite': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    maxzoom: 17,
                    attribution: '© Esri World Imagery | CPF Ingeniería'
                },
                'terreno-dem': {
                    type: 'raster-dem',
                    tiles: [
                        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
                    ],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15
                }
            },
            layers: [
                {
                    id: 'capa-satelital-esri',
                    type: 'raster',
                    source: 'esri-satellite',
                    minzoom: 0,
                    maxzoom: 22
                }
            ],
            terrain: {
                source: 'terreno-dem',
                exaggeration: 1.25
            }
        },
        // CENTRO CORREGIDO CON EL ORDEN CORRECTO [lng, lat] DE MINA LOS COLORADOS
        center: [-70.813030, -28.290846],
        zoom: 15.6,
        pitch: esVista3D ? 60 : 0,
        bearing: esVista3D ? -15 : 0,
        maxPitch: 82,
        minZoom: 13,
        maxZoom: 21
    });

    mapaActivo.addControl(new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true
    }), 'top-right');

    window.mapaActivo = mapaActivo;

    mapaActivo.on('load', () => {
        dibujarPinesEnMapa();
    });
}

function dibujarPinesEnMapa() {
    if (!mapaActivo) return;

    // Limpiar marcadores previos
    listaMarcadoresActivos.forEach(m => m.remove());
    listaMarcadoresActivos = [];
    diccionarioMarcadores = {};

    Object.entries(datosGlobalesEquipos).forEach(([idKey, eq]) => {
        const lat = parseFloat(eq.latitud);
        const lng = parseFloat(eq.longitud);

        if (!isNaN(lat) && !isNaN(lng)) {
            const nivelEquipo = eq.nivel || 'Nivel 1';
            const areaEq = (eq.area || '').trim();
            const tagEq = (eq.tag || '').toLowerCase();
            const nombreEq = (eq.nombre || '').toLowerCase();

            if (nivelFiltroActual !== 'TODOS' && nivelEquipo !== nivelFiltroActual) {
                return;
            }

            if (filtroModoMapa === 'AREA' && areaEq.toLowerCase() !== filtroValorMapa.toLowerCase()) {
                return;
            }
            if (filtroModoMapa === 'SEARCH' && !tagEq.includes(filtroValorMapa) && !nombreEq.includes(filtroValorMapa)) {
                return;
            }

            const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
            let colorHex = '#10b981';
            if (sev === 'rojo' || sev === 'critico') colorHex = '#ef4444';
            else if (sev === 'naranja') colorHex = '#f97316';
            else if (sev === 'amarillo') colorHex = '#eab308';

            const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;
            const textoTooltip = `${eq.tag || idKey} (${nivelEquipo}) - ${eq.nombre || 'Activo Crítico'}`;

            // Elemento HTML limpio con atributo title nativo para el Hover (sin deformaciones 3D)
            const el = document.createElement('div');
            el.className = 'maplibre-pin-node';
            el.title = textoTooltip; // <-- Esto muestra la etiqueta al pasar el cursor de forma nativa y fluida
            el.style.cssText = `
                width: 20px; 
                height: 20px; 
                background-color: ${colorHex}; 
                border-radius: 50%; 
                border: 3px solid #ffffff; 
                box-shadow: 0 3px 10px rgba(0,0,0,0.8); 
                cursor: pointer;
                ${sev === 'rojo' || sev === 'critico' ? 'animation: pulsePinRojo 1.5s infinite;' : ''}
            `;

            const popupHTML = `
                <div style="text-align: center; font-family: 'Inter', sans-serif; min-width: 190px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 4px;">${nivelEquipo}</span>
                        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorHex}; display: inline-block;"></span>
                    </div>
                    <h4 style="margin: 0 0 4px 0; font-size: 1rem; color: #ffffff; font-family: monospace;">${eq.tag}</h4>
                    <p style="margin: 0 0 4px 0; font-size: 0.8rem; color: #cbd5e1; font-weight: 600;">${eq.nombre || 'Sin descripción'}</p>
                    <p style="margin: 0 0 12px 0; font-size: 0.72rem; color: #94a3b8;">Área: ${eq.area || 'General'}</p>
                    <button class="item-navegable" data-target="${targetId}" style="background: #38bdf8; color: #0f172a; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; width: 100%; font-size: 0.8rem;">
                        Abrir Expediente CBM
                    </button>
                </div>
            `;

            const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
                .setHTML(popupHTML);

            const coords = [lng, lat];
            const marcador = new maplibregl.Marker({ element: el })
                .setLngLat(coords)
                .setPopup(popup)
                .addTo(mapaActivo);

            listaMarcadoresActivos.push(marcador);

            const registro = { marker: marcador, popup: popup, coords: coords, eq: eq };
            diccionarioMarcadores[idKey] = registro;
            diccionarioMarcadores[targetId] = registro;
        }
    });
}