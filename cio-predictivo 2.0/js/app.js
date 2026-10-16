// ==========================================
// MÓDULO PRINCIPAL: APP.JS (CON MAPA SATELITAL REAL LEAFLET)
// ==========================================
import { auth, db } from './core/firebase-config.js';
import { inicializarBarraLateral } from './ui/sidebar.js'; 
import { renderizarExpediente } from './ui/expediente.js';
import { renderizarModuloPMS } from './ui/pms.js';

let datosGlobalesEquipos = {}; 
let mapaActivo = null; 

// Referencia al nodo de alertas enviadas desde terreno.html
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
                .catch((error) => {
                    errorDiv.textContent = 'Usuario o contraseña incorrectos.';
                    btnIngresar.innerHTML = `Autenticar <span class="material-symbols-outlined">login</span>`;
                    btnIngresar.disabled = false;
                });
        });
    }

    // Escuchar en tiempo real las alertas de terreno para actualizar el badge rojo
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

    // Cargar Mapa Satelital
    db.ref('activos_criticos').on('value', snapshot => {
        if (snapshot.exists()) {
            datosGlobalesEquipos = snapshot.val();
            const espacioDinámico = document.getElementById('espacio-trabajo-dinamico');
            if (espacioDinámico && (!espacioDinámico.innerHTML.includes('mapa-satelital') || espacioDinámico.innerHTML.includes('Seleccione un Activo'))) {
                renderizarMapaPlanta();
            } else if (mapaActivo) {
                dibujarPinesEnMapa();
            }
        }
    });

    // Delegación de Eventos
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

        const btnVolver = e.target.closest('#btn-volver-dashboard') || e.target.closest('#btn-cerrar-expediente') || e.target.closest('.btn-cerrar-modal');
        if (btnVolver) {
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
            if (window.miniMapaInstancia) { window.miniMapaInstancia.remove(); window.miniMapaInstancia = null; }
            renderizarMapaPlanta();
            return;
        }

        const btnCrearEquipo = e.target.closest('#btn-crear-equipo');
        if (btnCrearEquipo) {
            document.querySelectorAll('.item-navegable').forEach(b => b.style.border = 'none');
            if(mapaActivo) { mapaActivo.remove(); mapaActivo = null; }
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

// ---------------------------------------------------------
// GESTIÓN DE ALERTAS DE TERRENO (BANDEJA EN TIEMPO REAL)
// ---------------------------------------------------------
window.abrirModalAlertasTerreno = function() {
    const modal = document.getElementById('modal-alertas-terreno');
    if (modal) modal.style.display = 'flex';
    renderizarAlertasTerrenoModal();
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
        
        let colorSev = '#10b981';
        if (al.severidad === 'Rojo') colorSev = '#ef4444';
        else if (al.severidad === 'Naranja') colorSev = '#f97316';
        else if (al.severidad === 'Amarillo') colorSev = '#eab308';

        let htmlFoto = '';
        if (al.fotoBase64) {
            htmlFoto = `<img src="${al.fotoBase64}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-glass); cursor: pointer;" onclick="window.open('${al.fotoBase64}')" title="Ver foto ampliada">`;
        }

        contenedor.innerHTML += `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-left: 4px solid ${colorSev}; padding: 14px; border-radius: 8px; display: flex; gap: 15px; align-items: flex-start;">
                ${htmlFoto}
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: white; font-size: 1rem; font-family: monospace;">TAG: ${al.tag}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${fecha}</span>
                    </div>
                    <span style="font-size: 0.8rem; color: #38bdf8; font-weight: 600;">Área: ${al.area} | Componente: ${al.componente || 'General'}</span>
                    <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #e2e8f0; white-space: pre-line; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">${al.detalle}</p>
                </div>
                <button onclick="window.eliminarAlertaTerreno('${key}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem;" title="Eliminar reporte">🗑️</button>
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
}

window.eliminarAlertaTerreno = function(key) {
    if (confirm("¿Estás seguro de eliminar este reporte de la bandeja?")) {
        dbAlertas.child(key).remove().then(() => {
            if (typeof UI !== 'undefined' && UI.mostrarToast) {
                UI.mostrarToast("Reporte de terreno eliminado.", "exito");
            }
        });
    }
}

// ---------------------------------------------------------
// MAPA SATELITAL (LEAFLET + ESRI)
// ---------------------------------------------------------
let capaMarcadores = null;

function renderizarMapaPlanta() {
    const contenedor = document.getElementById('espacio-trabajo-dinamico');
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div style="animation: fadeIn 0.4s ease; padding: 10px; height: 100%; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: rgba(15, 23, 42, 0.6); padding: 15px 25px; border-radius: 12px; border: 1px solid var(--border-glass);">
                <div>
                    <h2 style="color: white; font-size: 1.5rem; margin: 0 0 5px 0; display:flex; align-items:center; gap:10px;">
                        <span class="material-symbols-outlined" style="color: var(--primary-blue);">satellite_alt</span> Vista Topográfica
                    </h2>
                    <p style="color: var(--text-muted); margin: 0; font-size: 0.8rem;">Mina Los Colorados - Geolocalización de Activos Críticos</p>
                </div>
            </div>
            
            <div id="mapa-satelital" style="flex-grow: 1; min-height: 500px; border-radius: 12px; border: 1px solid var(--border-glass); overflow: hidden; z-index: 1;"></div>
        </div>
    `;

    mapaActivo = L.map('mapa-satelital', {
        minZoom: 14,
        maxZoom: 17 
    }).setView([-28.290846, -70.813030], 15);

    window.mapaActivo = mapaActivo;

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 17 
    }).addTo(mapaActivo);

    capaMarcadores = L.layerGroup().addTo(mapaActivo);
    dibujarPinesEnMapa();
}

function dibujarPinesEnMapa() {
    if (!mapaActivo || !capaMarcadores) return;
    
    capaMarcadores.clearLayers();

    Object.values(datosGlobalesEquipos).forEach(eq => {
        if (eq.latitud && eq.longitud) {
            const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
            let colorHex = '#10b981';
            if (sev === 'rojo' || sev === 'critico') colorHex = '#ef4444';
            else if (sev === 'naranja') colorHex = '#f97316';
            else if (sev === 'amarillo') colorHex = '#eab308';

            const iconoPersonalizado = L.divIcon({
                className: 'custom-pin',
                html: `
                    <div style="background-color: ${colorHex}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.8); position: relative; ${sev === 'rojo' ? 'animation: pulse 1.5s infinite;' : ''}">
                        <div style="position: absolute; bottom: -10px; left: 5px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 10px solid ${colorHex};"></div>
                    </div>
                `,
                iconSize: [20, 30],
                iconAnchor: [10, 30]
            });

            const marcador = L.marker([parseFloat(eq.latitud), parseFloat(eq.longitud)], { icon: iconoPersonalizado });

            const popupHTML = `
                <div style="text-align: center; color: #333; font-family: 'Inter', sans-serif;">
                    <h4 style="margin: 0 0 5px 0; font-size: 1rem; color: #0f172a;">${eq.tag}</h4>
                    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #64748b;">${eq.nombre}</p>
                    <button class="item-navegable" data-target="${eq.tag.toUpperCase().replace(/\s+/g, '_')}" style="background: #38bdf8; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 600; width: 100%;">
                        Abrir Expediente
                    </button>
                </div>
            `;
            marcador.bindPopup(popupHTML);
            capaMarcadores.addLayer(marcador);
        }
    });
}

// --- MODO KIOSKO ---
document.addEventListener('click', (e) => {
    const btnKiosko = e.target.closest('#kiosko') || e.target.closest('.btn-kiosko') || e.target.closest('#btn-salir-kiosko-flotante');
    if (!btnKiosko) return;

    const esKioskoActivo = document.body.classList.toggle('modo-kiosko-activo');
    const sidebar = document.querySelector('aside') || document.querySelector('.sidebar-principal');
    const topbar = document.querySelector('header') || document.querySelector('.topbar');
    let btnFlotante = document.getElementById('btn-salir-kiosko-flotante');

    if (esKioskoActivo) {
        if (sidebar) sidebar.style.setProperty('display', 'none', 'important');
        if (topbar) topbar.style.setProperty('display', 'none', 'important');
        
        if (!btnFlotante) {
            btnFlotante = document.createElement('button');
            btnFlotante.id = 'btn-salir-kiosko-flotante';
            btnFlotante.className = 'btn-kiosko';
            btnFlotante.innerHTML = '<span class="material-symbols-outlined">fullscreen_exit</span> Salir Kiosko';
            btnFlotante.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 100000; background: rgba(15, 23, 42, 0.85); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 10px 18px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 600; backdrop-filter: blur(5px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-family: inherit;';
            document.body.appendChild(btnFlotante);
        } else {
            btnFlotante.style.display = 'flex';
        }

        const btnOriginal = document.getElementById('kiosko');
        if (btnOriginal) {
            btnOriginal.innerHTML = '<span class="material-symbols-outlined">fullscreen_exit</span> Salir Kiosko';
        }
    } else {
        if (sidebar) sidebar.style.removeProperty('display');
        if (topbar) topbar.style.removeProperty('display');
        
        if (btnFlotante) btnFlotante.style.display = 'none';

        const btnOriginal = document.getElementById('kiosko');
        if (btnOriginal) {
            btnOriginal.innerHTML = '<span class="material-symbols-outlined">fullscreen</span> Kiosko';
        }

        const espacioDinámico = document.getElementById('espacio-trabajo-dinamico');
        if (espacioDinámico && espacioDinámico.innerHTML.includes('Inspección CBM')) {
            renderizarMapaPlanta();
            return;
        }
    }
    
    setTimeout(() => {
        if (window.mapaActivo) window.mapaActivo.invalidateSize();
    }, 150);
});

// --- MODAL DE CREACIÓN DE USUARIOS ---
document.addEventListener('click', (e) => {
    const btnCrearUsr = e.target.closest('#btn-crear-usuario') || e.target.closest('.btn-crear-usuario');
    if (!btnCrearUsr) return;

    const modalAnterior = document.getElementById('modal-crear-usuario');
    if (modalAnterior) modalAnterior.remove();

    const modalHTML = `
        <div id="modal-crear-usuario" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px); z-index: 1000; display: flex; justify-content: center; align-items: center; animation: fadeIn 0.3s ease;">
            <div style="background: var(--bg-card); border: 1px solid var(--border-glass); padding: 30px; border-radius: 12px; width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-glass); padding-bottom: 10px;">
                    <h3 style="color: white; margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: var(--primary-blue);">person_add</span> Registrar Nuevo Usuario
                    </h3>
                    <button id="cerrar-modal-usr" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form id="form-crear-usuario" style="display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Nombre</label>
                        <input type="text" id="usr-nombre" required placeholder="Ej: Carlos" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Apellido</label>
                        <input type="text" id="usr-apellido" required placeholder="Ej: Soto" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Correo Electrónico</label>
                        <input type="email" id="usr-email" required placeholder="carlos.soto@ndtcpf.cl" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Contraseña Temporal</label>
                        <input type="password" id="usr-pass" required minlength="6" placeholder="Mínimo 6 caracteres" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Rol en el Sistema</label>
                        <select id="usr-rol" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-glass); background: var(--bg-input); color: white; outline: none; cursor: pointer;">
                            <option value="ANALISTA CBM">Analista CBM</option>
                            <option value="ADMINISTRADOR">Administrador</option>
                            <option value="OPERADOR TERRENO">Operador de Terreno</option>
                            <option value="JEFE DE MANTENIMIENTO">Jefe de Mantenimiento</option>
                        </select>
                    </div>

                    <button type="submit" id="btn-ejecutar-crear" style="margin-top: 10px; background: rgba(56, 189, 248, 0.15); color: var(--primary-blue); border: 1px solid rgba(56, 189, 248, 0.4); padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 5px;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">check_circle</span> Guardar y Registrar
                    </button>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('cerrar-modal-usr').addEventListener('click', () => {
        document.getElementById('modal-crear-usuario').remove();
    });

    document.getElementById('form-crear-usuario').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nombre = document.getElementById('usr-nombre').value.trim();
        const apellido = document.getElementById('usr-apellido').value.trim();
        const email = document.getElementById('usr-email').value.trim();
        const pass = document.getElementById('usr-pass').value.trim();
        const rol = document.getElementById('usr-rol').value;

        const btnSubmit = document.getElementById('btn-ejecutar-crear');
        btnSubmit.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Registrando...`;
        btnSubmit.disabled = true;

        try {
            const credUser = await auth.createUserWithEmailAndPassword(email, pass);
            const uid = credUser.user.uid;

            await db.ref(`usuarios/${uid}`).set({
                nombre: nombre,
                apellido: apellido,
                email: email,
                rol: rol,
                creadoEn: Date.now()
            });

            UI.mostrarToast(`¡Usuario ${nombre} ${apellido} (${rol}) creado exitosamente!`, "exito");
            document.getElementById('modal-crear-usuario').remove();
        } catch (error) {
            UI.mostrarToast("Error al registrar usuario: " + error.message, "error");
            btnSubmit.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.1rem;">check_circle</span> Guardar y Registrar`;
            btnSubmit.disabled = false;
        }
    });
});