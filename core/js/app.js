// ==========================================
// NÚCLEO CIO - CONEXIÓN FIREBASE Y CONFIGURACIÓN
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const activosRef = db.ref('activos_criticos');
const alertasRef = db.ref('alertas_terreno');
const usuariosRef = db.ref('usuarios_cio');
const auth = firebase.auth();

// ==========================================
// VARIABLES GLOBALES (ÚNICAS)
// ==========================================
let datosGlobalesActivos = null;
let datosGlobalesAlertas = null;
let usuarioActual = null;
let faenaUsuario = "TODAS"; 

let vistaActualPanel = 'AREAS'; 
let areaSeleccionadaPanel = null;

let activoSeleccionadoActual = null;
let componenteSeleccionado = null; 

const GEMINI_API_KEY = "AQ.Ab8RN6InJ7WtTb7_f46hFhyVkXtfV2s343nI-JHftagY7j-amg"; 

// ==========================================
// CONTROL DE ACCESO (RBAC) E INACTIVIDAD
// ==========================================
let timeoutInactividad;
const TIEMPO_MAXIMO_MS = 15 * 60 * 1000; 

function reiniciarTemporizador() {
    clearTimeout(timeoutInactividad);
    if (usuarioActual) timeoutInactividad = setTimeout(cerrarSesionPorInactividad, TIEMPO_MAXIMO_MS);
}

document.addEventListener('mousemove', reiniciarTemporizador);
document.addEventListener('keypress', reiniciarTemporizador);
document.addEventListener('click', reiniciarTemporizador);

function cerrarSesionPorInactividad() {
    auth.signOut().then(() => {
        const modalTo = document.getElementById('modal-timeout');
        if(modalTo) modalTo.style.display = 'flex';
    });
}

auth.onAuthStateChanged((user) => {
    const elementosProtegidos = document.querySelectorAll('.auth-only');
    if (user) {
        usuarioActual = user;
        const btnAbrir = document.getElementById('btn-abrir-login');
        if(btnAbrir) btnAbrir.style.display = 'none';
        
        const perfilAn = document.getElementById('perfil-analista');
        if(perfilAn) perfilAn.style.display = 'flex';
        
        elementosProtegidos.forEach(el => el.style.display = '');
        
        usuariosRef.child(user.uid).once('value').then(snapshot => {
            const datosUsuario = snapshot.val();
            if (datosUsuario) {
                // 1. Mostrar el nombre de pila del usuario registrado
                if (datosUsuario.nombre) {
                    const nombreNav = document.getElementById('nombre-usuario-nav');
                    if (nombreNav) {
                        // Extrae solo el primer nombre para no ocupar tanto espacio
                        const primerNombre = datosUsuario.nombre.split(' ')[0];
                        nombreNav.innerText = `Hola, ${primerNombre}`;
                    }
                }

                // 2. Configurar el filtro de Faena automático
                if (datosUsuario.faena) {
                    faenaUsuario = datosUsuario.faena;
                    const selector = document.getElementById('filtroFaena');
                    if(selector) {
                        for(let i=0; i<selector.options.length; i++) {
                            if(selector.options[i].value.includes(faenaUsuario)) {
                                selector.selectedIndex = i;
                                break;
                            }
                        }
                    }
                    aplicarFiltroFaena();
                }
            }
        });
        reiniciarTemporizador(); 
    } else {
        usuarioActual = null;
        faenaUsuario = "TODAS";
        clearTimeout(timeoutInactividad);
        const btnAbrir = document.getElementById('btn-abrir-login');
        if(btnAbrir) btnAbrir.style.display = 'inline-block';
        
        const perfilAn = document.getElementById('perfil-analista');
        if(perfilAn) perfilAn.style.display = 'none';
        
        elementosProtegidos.forEach(el => el.style.display = 'none');
    }
});

window.cambiarTabAuth = function(tab) {
    if(tab === 'login') {
        document.getElementById('form-login').style.display = 'block';
        document.getElementById('form-registro').style.display = 'none';
        document.getElementById('tab-login').style.borderBottom = '2px solid var(--accent-color)';
        document.getElementById('tab-login').style.color = 'white';
        document.getElementById('tab-registro').style.borderBottom = 'none';
        document.getElementById('tab-registro').style.color = 'var(--text-muted)';
    } else {
        document.getElementById('form-login').style.display = 'none';
        document.getElementById('form-registro').style.display = 'block';
        document.getElementById('tab-registro').style.borderBottom = '2px solid var(--accent-color)';
        document.getElementById('tab-registro').style.color = 'white';
        document.getElementById('tab-login').style.borderBottom = 'none';
        document.getElementById('tab-login').style.color = 'var(--text-muted)';
    }
};

window.registrarUsuario = function() {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const nombre = document.getElementById('reg-nombre').value;
    const faena = document.getElementById('reg-faena').value;
    const errorMsg = document.getElementById('reg-error');
    if(!nombre || !faena) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "Por favor, completa todos los campos.";
        return;
    }
    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            const uid = userCredential.user.uid;
            return usuariosRef.child(uid).set({ nombre, email, faena, rol: 'Analista', fechaRegistro: new Date().toISOString() });
        })
        .then(() => document.getElementById('modal-auth').style.display = 'none')
        .catch(error => { errorMsg.style.display = 'block'; errorMsg.innerText = "Error: " + error.message; });
};

window.iniciarSesion = function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const errorMsg = document.getElementById('login-error');
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            document.getElementById('modal-auth').style.display = 'none';
            errorMsg.style.display = 'none';
            document.getElementById('login-email').value = '';
            document.getElementById('login-pass').value = '';
        })
        .catch(error => { errorMsg.style.display = 'block'; errorMsg.innerText = "Credenciales incorrectas."; });
};

window.cerrarSesion = function() {
    if(confirm("¿Cerrar sesión de Analista? Volverás al modo Lector.")) auth.signOut();
};

// ==========================================
// ESCUCHA FIREBASE Y RENDERIZADO DEL CATASTRO (ÁREAS Y EQUIPOS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    activosRef.on('value', (snapshot) => {
        const rawActivos = snapshot.val();
        
        // --- PARCHE DE TOLERANCIA GPS PARA ESCRITORIO ---
        if (rawActivos) {
            Object.keys(rawActivos).forEach(key => {
                let eq = rawActivos[key];
                // Intentamos capturar la latitud y longitud sin importar cómo se llamen en Firebase
                const rawLat = eq.latitud ?? eq.Latitud ?? eq.lat ?? eq.Lat ?? eq.latitude;
                const rawLng = eq.longitud ?? eq.Longitud ?? eq.lng ?? eq.Lng ?? eq.lon ?? eq.longitude;
                
                // Normalizamos forzosamente a variables que Leaflet entienda
                if (rawLat !== undefined && rawLng !== undefined) {
                    eq.latitud = parseFloat(rawLat);
                    eq.longitud = parseFloat(rawLng);
                }
            });
        }
        // -------------------------------------------------

        datosGlobalesActivos = rawActivos;
        aplicarFiltroFaena();
    });
    
    alertasRef.on('value', (snapshot) => {
        datosGlobalesAlertas = snapshot.val();
        renderizarPanelAlertasActivas(datosGlobalesAlertas);
        
        // Pasamos el catastro global al mapa, porque ahí están las coordenadas
        if (typeof actualizarPinesMapa === 'function' && datosGlobalesActivos) {
            actualizarPinesMapa(datosGlobalesActivos);
        }

        if (document.getElementById('panel-terreno') && document.getElementById('panel-terreno').style.display === 'block') {
            renderizarAlertasTerreno();
        }
    });
});

window.aplicarFiltroFaena = function() {
    vistaActualPanel = 'AREAS'; 
    areaSeleccionadaPanel = null;
    renderizarCatastro(datosGlobalesActivos);
    renderizarPanelAlertasActivas(datosGlobalesAlertas);
};

function renderizarCatastro(activosData) {
    const contenedor = document.getElementById('lista-alertas');
    if(!contenedor) return;
    
    const filtroEl = document.getElementById('filtroFaena');
    const filtroSeleccionado = filtroEl ? filtroEl.value : 'TODAS';

    // NUEVO: Leer el contenido del buscador
    const inputBuscar = document.getElementById('input-buscar-catastro');
    const textoBusqueda = inputBuscar ? inputBuscar.value.toLowerCase().trim() : '';
    
    let conteoVerde = 0, conteoAmarillo = 0, conteoNaranja = 0, conteoRojo = 0;

    if (!activosData) {
        contenedor.innerHTML = '<p class="text-muted" style="text-align:center; padding-top: 20px;">Sin equipos en el catastro.</p>';
        return;
    }

    let activosArray = Object.keys(activosData).map(key => { return { id_activo: key, ...activosData[key] }; });
    
    let activosFiltrados = activosArray;
    if (filtroSeleccionado !== 'TODAS') {
        activosFiltrados = activosArray.filter(a => !a.faena || a.faena === filtroSeleccionado);
    }

    if (activosFiltrados.length === 0) {
        contenedor.innerHTML = `<p class="text-muted" style="text-align:center; padding-top: 20px;">Sin equipos registrados.</p>`;
        if(document.getElementById('kpi-ok')) {
            document.getElementById('kpi-ok').innerText = 0; document.getElementById('kpi-alert').innerText = 0; document.getElementById('kpi-warn').innerText = 0; document.getElementById('kpi-crit').innerText = 0;
        }
        return;
    }

    activosFiltrados.forEach(activo => {
        const severidad = activo.severidad || 'Verde'; 
        if (severidad === 'Rojo') conteoRojo++;
        else if (severidad === 'Naranja') conteoNaranja++;
        else if (severidad === 'Amarillo') conteoAmarillo++;
        else conteoVerde++;
    });

    if(document.getElementById('kpi-ok')) {
        document.getElementById('kpi-ok').innerText = conteoVerde;
        document.getElementById('kpi-alert').innerText = conteoAmarillo;
        document.getElementById('kpi-warn').innerText = conteoNaranja;
        document.getElementById('kpi-crit').innerText = conteoRojo;
    }

    let htmlInyectado = '';

    // ==========================================
    // MODO BÚSQUEDA GLOBAL
    // ==========================================
    if (textoBusqueda !== '') {
        let equiposEncontrados = activosFiltrados.filter(a => {
            const nombreEq = (a.nombre || a.tag || '').toLowerCase();
            return nombreEq.includes(textoBusqueda);
        });

        htmlInyectado += `
            <button onclick="limpiarBusquedaCatastro()" style="width: 100%; padding: 10px; margin-bottom: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s;">
                <span class="material-symbols-outlined">close</span> Limpiar búsqueda
            </button>
            <h3 style="color: var(--accent-color); font-size: 0.9rem; margin-bottom: 15px; text-align: center;">🔍 Encontrados: ${equiposEncontrados.length}</h3>
        `;

        if (equiposEncontrados.length === 0) {
            htmlInyectado += `<p class="text-muted" style="text-align:center;">No se encontraron equipos.</p>`;
        } else {
            const ordenSalud = { 'Rojo': 1, 'Naranja': 2, 'Amarillo': 3, 'Verde': 4 };
            equiposEncontrados.sort((a, b) => (ordenSalud[a.severidad] || 5) - (ordenSalud[b.severidad] || 5));

            equiposEncontrados.forEach(activo => {
                const severidad = activo.severidad || 'Verde'; 
                let colorBorde = 'var(--status-ok)'; 
                if (severidad === 'Rojo') colorBorde = 'var(--status-critical)';
                if (severidad === 'Naranja') colorBorde = 'var(--status-warning)';
                if (severidad === 'Amarillo') colorBorde = 'var(--status-alert)';

                let cantidadTerreno = 0;
                if (datosGlobalesAlertas) {
                    cantidadTerreno = Object.values(datosGlobalesAlertas).filter(al => al.tag && al.tag.toUpperCase() === (activo.nombre || '').toUpperCase()).length;
                }

                let badgeTerrenoEquipo = '';
                if (cantidadTerreno > 0) {
                    badgeTerrenoEquipo = `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; margin-left: 8px; display: inline-flex; align-items: center; gap: 3px;" title="${cantidadTerreno} reportes de inspectores">
                        <span class="material-symbols-outlined" style="font-size: 0.8rem;">engineering</span> ${cantidadTerreno}
                    </span>`;
                }

                htmlInyectado += `
                    <div class="alerta-item" onclick="abrirModalEvidencia('${activo.id_activo}')" style="border-left: 4px solid ${colorBorde}; background: rgba(0,0,0,0.3); padding: 12px; margin-bottom: 12px; border-radius: 8px; cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <strong style="color: white; font-size: 1.05rem; display: flex; align-items: center;">
                                ${activo.nombre || 'SIN TAG'}
                                ${badgeTerrenoEquipo}
                            </strong>
                            <span style="font-size: 0.75rem; color: ${colorBorde}; font-weight: bold; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">
                                ${severidad.toUpperCase()}
                            </span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-main);">
                            <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">account_tree</span> ${activo.area || 'Planta'}
                        </div>
                    </div>
                `;
            });
        }
        contenedor.innerHTML = htmlInyectado;
        return; // Terminamos aquí si hay búsqueda
    }

    // ==========================================
    // VISTA NORMAL (ÁREAS O EQUIPOS)
    // ==========================================
    if (vistaActualPanel === 'AREAS') {
        const agrupacionAreas = {};
        activosFiltrados.forEach(activo => {
            const nombreArea = activo.area || 'Área General';
            if (!agrupacionAreas[nombreArea]) {
                agrupacionAreas[nombreArea] = { nombre: nombreArea, rojos: 0, naranjas: 0, amarillos: 0, verdes: 0, total: 0, alertasTerreno: 0 };
            }
            const sev = activo.severidad || 'Verde';
            if (sev === 'Rojo') agrupacionAreas[nombreArea].rojos++;
            else if (sev === 'Naranja') agrupacionAreas[nombreArea].naranjas++;
            else if (sev === 'Amarillo') agrupacionAreas[nombreArea].amarillos++;
            else agrupacionAreas[nombreArea].verdes++;
            
            agrupacionAreas[nombreArea].total++;

            if (datosGlobalesAlertas) {
                const reportesDelEquipo = Object.values(datosGlobalesAlertas).filter(al => al.tag && al.tag.toUpperCase() === (activo.nombre || '').toUpperCase()).length;
                agrupacionAreas[nombreArea].alertasTerreno += reportesDelEquipo;
            }
        });

        const listaAreas = Object.values(agrupacionAreas);
        listaAreas.sort((a, b) => {
            if (b.rojos !== a.rojos) return b.rojos - a.rojos;
            if (b.naranjas !== a.naranjas) return b.naranjas - a.naranjas;
            return b.amarillos - a.amarillos;
        });

        listaAreas.forEach(area => {
            let colorBorde = 'var(--status-ok)';
            if (area.rojos > 0) colorBorde = 'var(--status-critical)';
            else if (area.naranjas > 0) colorBorde = 'var(--status-warning)';
            else if (area.amarillos > 0) colorBorde = 'var(--status-alert)';

            let badgeTerrenoArea = '';
            if (area.alertasTerreno > 0) {
                badgeTerrenoArea = `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 4px;" title="Hay reportes de terreno en esta área">
                    <span class="material-symbols-outlined" style="font-size: 0.9rem;">engineering</span> ${area.alertasTerreno}
                </span>`;
            }

            htmlInyectado += `
                <div class="alerta-item" onclick="entrarArea('${area.nombre}')" style="border-left: 4px solid ${colorBorde}; background: rgba(255,255,255,0.03); padding: 10px 12px; margin-bottom: 8px; border-radius: 6px; cursor: pointer; transition: 0.2s; display: flex; flex-direction: column; justify-content: center; min-height: 60px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="color: white; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                            <span class="material-symbols-outlined" style="font-size: 1.1rem; color: #a1a1aa;">account_tree</span> 
                            ${area.nombre} 
                        </strong>
                        ${badgeTerrenoArea}
                    </div>
                    <div style="display: flex; gap: 12px; font-size: 0.75rem; align-items: center;">
                        ${area.rojos > 0 ? `<div style="display: flex; align-items: center; gap: 4px;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--status-critical); box-shadow: 0 0 5px var(--status-critical);"></div> <span style="color: var(--status-critical); font-weight: bold;">${area.rojos}</span></div>` : ''}
                        ${area.naranjas > 0 ? `<div style="display: flex; align-items: center; gap: 4px;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--status-warning); box-shadow: 0 0 5px var(--status-warning);"></div> <span style="color: var(--status-warning); font-weight: bold;">${area.naranjas}</span></div>` : ''}
                        ${area.amarillos > 0 ? `<div style="display: flex; align-items: center; gap: 4px;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--status-alert); box-shadow: 0 0 5px var(--status-alert);"></div> <span style="color: var(--status-alert); font-weight: bold;">${area.amarillos}</span></div>` : ''}
                        ${(area.rojos === 0 && area.naranjas === 0 && area.amarillos === 0) ? `<div style="display: flex; align-items: center; gap: 4px;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--status-ok); box-shadow: 0 0 5px var(--status-ok);"></div> <span style="color: var(--status-ok); font-weight: bold;">100% Normal</span></div>` : ''}
                    </div>
                </div>
            `;
        });
    } 
    else if (vistaActualPanel === 'EQUIPOS') {
        htmlInyectado += `
            <button onclick="volverAreas()" style="width: 100%; padding: 10px; margin-bottom: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s;">
                <span class="material-symbols-outlined">arrow_back</span> Volver a vista de Áreas
            </button>
            <h3 style="color: var(--accent-color); font-size: 1rem; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">📍 ${areaSeleccionadaPanel}</h3>
        `;

        let equiposArea = activosFiltrados.filter(a => (a.area || 'Área General') === areaSeleccionadaPanel);
        const ordenSalud = { 'Rojo': 1, 'Naranja': 2, 'Amarillo': 3, 'Verde': 4 };
        equiposArea.sort((a, b) => (ordenSalud[a.severidad] || 5) - (ordenSalud[b.severidad] || 5));

        equiposArea.forEach(activo => {
            const severidad = activo.severidad || 'Verde'; 
            let colorBorde = 'var(--status-ok)'; 
            if (severidad === 'Rojo') colorBorde = 'var(--status-critical)';
            if (severidad === 'Naranja') colorBorde = 'var(--status-warning)';
            if (severidad === 'Amarillo') colorBorde = 'var(--status-alert)';

            let cantidadTerreno = 0;
            if (datosGlobalesAlertas) {
                cantidadTerreno = Object.values(datosGlobalesAlertas).filter(al => al.tag && al.tag.toUpperCase() === (activo.nombre || '').toUpperCase()).length;
            }

            let badgeTerrenoEquipo = '';
            if (cantidadTerreno > 0) {
                badgeTerrenoEquipo = `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; margin-left: 8px; display: inline-flex; align-items: center; gap: 3px;" title="${cantidadTerreno} reportes de inspectores">
                    <span class="material-symbols-outlined" style="font-size: 0.8rem;">engineering</span> ${cantidadTerreno}
                </span>`;
            }

            htmlInyectado += `
                <div class="alerta-item" onclick="abrirModalEvidencia('${activo.id_activo}')" style="border-left: 4px solid ${colorBorde}; background: rgba(0,0,0,0.3); padding: 12px; margin-bottom: 12px; border-radius: 8px; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="color: white; font-size: 1.05rem; display: flex; align-items: center;">
                            ${activo.nombre || 'SIN TAG'}
                            ${badgeTerrenoEquipo}
                        </strong>
                        <span style="font-size: 0.75rem; color: ${colorBorde}; font-weight: bold; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">
                            ${severidad.toUpperCase()}
                        </span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-main);">
                        <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">precision_manufacturing</span> ${activo.tipo_equipo || 'Equipo Industrial'}
                    </div>
                </div>
            `;
        });
    }

    contenedor.innerHTML = htmlInyectado;
}

window.entrarArea = function(nombreArea) {
    vistaActualPanel = 'EQUIPOS';
    areaSeleccionadaPanel = nombreArea;
    renderizarCatastro(datosGlobalesActivos);
};

window.volverAreas = function() {
    vistaActualPanel = 'AREAS';
    areaSeleccionadaPanel = null;
    renderizarCatastro(datosGlobalesActivos);
};

// ==========================================
// MODAL DE COMPONENTES DEL EQUIPO
// ==========================================
window.abrirModalEvidencia = function(idActivo) {
    // --- 1. SABER SI ES ANALISTA O LECTOR ---
    const estaLogueado = (typeof faenaUsuario !== 'undefined' && faenaUsuario !== null && faenaUsuario !== "");
    
    const activo = datosGlobalesActivos[idActivo];
    if (!activo) return;
    
    activoSeleccionadoActual = { id_activo: idActivo, ...activo };

    document.getElementById('asset-tag-title').innerText = activo.nombre || 'Desconocido';
    const severidadActivo = activo.severidad || 'Verde';
    
    const badge = document.getElementById('asset-health-badge');
    badge.innerText = `SALUD GLOBAL: ${severidadActivo.toUpperCase()}`;
    let colorGlobal = 'var(--status-ok)';
    if (severidadActivo === 'Rojo') colorGlobal = 'var(--status-critical)';
    if (severidadActivo === 'Naranja') colorGlobal = 'var(--status-warning)';
    if (severidadActivo === 'Amarillo') colorGlobal = 'var(--status-alert)';
    badge.style.color = colorGlobal;
    badge.style.borderColor = colorGlobal;
    badge.style.background = `rgba(${colorGlobal === 'var(--status-critical)'?'239,68,68': colorGlobal === 'var(--status-warning)'?'249,115,22': colorGlobal === 'var(--status-alert)'?'234,179,8':'34,197,94'}, 0.1)`;

    document.getElementById('panel-inspeccion').style.display = 'none';
    componenteSeleccionado = null;

    const panelResumen = document.getElementById('panel-resumen-equipo');
    if (panelResumen) {
        panelResumen.style.display = 'block';
        
        let totalComp = 0, rojos = 0, alertas = 0;
        let compCriticoNombre = "";

        if (activo.componentes) {
            const comps = Object.values(activo.componentes);
            totalComp = comps.length;
            comps.forEach(c => {
                if (c.estado === 'Rojo') {
                    rojos++;
                    compCriticoNombre = c.nombre;
                } else if (c.estado === 'Naranja' || c.estado === 'Amarillo') {
                    alertas++;
                }
            });
        }

        document.getElementById('resumen-total-comp').innerText = totalComp;
        document.getElementById('resumen-rojos').innerText = rojos;
        document.getElementById('resumen-alertas').innerText = alertas;

        let textoEstado = "";
        if (totalComp === 0) {
            textoEstado = "⚠️ <strong>El equipo no tiene puntos de medición registrados.</strong><br>Haz clic en '+ Añadir Componente' en el menú lateral para comenzar a armar el árbol de esta máquina.";
        } else if (rojos > 0) {
            textoEstado = `🚨 <strong>El equipo se encuentra en estado CRÍTICO.</strong><br>El componente que requiere atención inmediata es: <strong style="color: var(--status-critical);">${compCriticoNombre}</strong>. Se recomienda revisar su inspección y asegurar la creación de Avisos/Órdenes SAP urgentes.`;
        } else if (alertas > 0) {
            textoEstado = `⚠️ <strong>El equipo presenta desgaste o desviaciones.</strong><br>Existen componentes en estado de Alarma o Seguimiento. Revise los puntos amarillos o naranjas en el menú lateral para planificar el mantenimiento preventivo.`;
        } else {
            textoEstado = `✅ <strong>Operación Normal.</strong><br>El equipo y todos sus puntos de medición se encuentran operando dentro de los parámetros de confiabilidad aceptables.`;
        }
        document.getElementById('resumen-texto-estado').innerHTML = textoEstado;
    }

    renderizarListaComponentes();
    document.getElementById('modal-evidencia').style.display = 'flex';

    // === REVISIÓN FINAL DE SEGURIDAD VISUAL ===
    setTimeout(() => {
        const usuarioReal = firebase.auth().currentUser;
        const btnOculto = document.getElementById('btn-add-spot-oculto');
        
        if (btnOculto) {
            if (usuarioReal) {
                btnOculto.style.display = 'block'; 
            } else {
                btnOculto.style.display = 'none';  
            }
        }
        
        document.querySelectorAll('.auth-only').forEach(btn => {
            btn.style.display = usuarioReal ? 'flex' : 'none';
        });
    }, 100);
};

window.seleccionarComponente = function(compID) {
    componenteSeleccionado = compID;
    renderizarListaComponentes(); 
    
    const comp = activoSeleccionadoActual.componentes[compID];
    
    const panelResumen = document.getElementById('panel-resumen-equipo');
    if (panelResumen) panelResumen.style.display = 'none';
    const panelTerreno = document.getElementById('panel-terreno');
    if (panelTerreno) panelTerreno.style.display = 'none';
    
    document.getElementById('panel-inspeccion').style.display = 'block';
    
    document.getElementById('titulo-componente').innerText = `Inspección: ${comp.nombre}`;
    document.getElementById('check-equipo-nuevo').checked = comp.es_nuevo || false;
    document.getElementById('fecha-medicion').value = comp.ultima_medicion || '';
    document.getElementById('avisos-sap').value = comp.avisos_sap || '';
    document.getElementById('om-sap').value = comp.om_sap || '';
    document.getElementById('texto-analisis-componente').value = comp.analisis_ia || '';
    document.getElementById('select-salud-componente').value = comp.estado || 'Verde';
    document.getElementById('input-espectro').value = '';
};

window.cerrarModal = function() {
    document.getElementById('modal-evidencia').style.display = 'none';
};

window.verResumen = function() {
    document.getElementById('panel-inspeccion').style.display = 'none';
    document.getElementById('panel-terreno').style.display = 'none';
    document.getElementById('panel-resumen-equipo').style.display = 'block';
    componenteSeleccionado = null;
    renderizarListaComponentes(); 
};

window.verTerreno = function() {
    document.getElementById('panel-inspeccion').style.display = 'none';
    document.getElementById('panel-resumen-equipo').style.display = 'none';
    document.getElementById('panel-terreno').style.display = 'block';
    componenteSeleccionado = null;
    renderizarListaComponentes(); 
    renderizarAlertasTerreno(); 
};

function renderizarAlertasTerreno() {
    const contenedor = document.getElementById('historial-terreno-lista');
    
    if (!document.getElementById('modal-lightbox')) {
        inyectarLightboxHTML();
    }

    if (!datosGlobalesAlertas) {
        contenedor.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No hay conexión con la base de datos de terreno.</p>';
        return;
    }

    const nombreEquipo = activoSeleccionadoActual.nombre;
    
    let alertasDelEquipo = [];
    Object.keys(datosGlobalesAlertas).forEach(key => {
        const al = datosGlobalesAlertas[key];
        if (al.tag && al.tag.toUpperCase() === (nombreEquipo || '').toUpperCase()) {
            alertasDelEquipo.push({ id_alerta: key, ...al });
        }
    });

    alertasDelEquipo.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); 

    if (alertasDelEquipo.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No hay reportes de terreno enviados para este equipo.</p>';
        return;
    }

    let html = '';
    alertasDelEquipo.forEach(al => {
        let colorSev = '#22c55e'; 
        if(al.severidad === 'Rojo') colorSev = '#ef4444';
        if(al.severidad === 'Naranja') colorSev = '#f97316';
        if(al.severidad === 'Amarillo') colorSev = '#eab308';

        let detalleFormateado = (al.detalle || '').replace(/\n/g, '<br>');

        html += `
            <div style="background: rgba(0,0,0,0.3); border-left: 4px solid ${colorSev}; padding: 15px; border-radius: 6px; position: relative;">
                
                ${usuarioActual ? `
                <button onclick="eliminarAlertaTerreno('${al.id_alerta}')" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--status-critical)'" onmouseout="this.style.color='var(--text-muted)'" title="Eliminar todo el reporte">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
                </button>
                ` : ''}

                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-right: 35px;">
                    <span style="color: var(--text-muted); font-size: 0.8rem;">📅 ${new Date(al.timestamp).toLocaleString('es-CL')} | Inspector</span>
                    <span style="background: rgba(255,255,255,0.1); color: ${colorSev}; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">
                        ${al.severidad.toUpperCase()}
                    </span>
                </div>
                
                <p style="color: white; font-size: 0.95rem; margin-bottom: 15px; line-height: 1.5;">${detalleFormateado}</p>
                
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap;">
        `;

        let dataEvidencias = al.evidencias || al.evidencia || [];
        if (!Array.isArray(dataEvidencias) && dataEvidencias) {
            dataEvidencias = [dataEvidencias];
        }

        if (dataEvidencias.length > 0) {
            dataEvidencias.forEach((ev, index) => {
                let urlReal = '';
                let esVideo = false;

                if (typeof ev === 'string') { urlReal = ev; } 
                else if (ev.data) { urlReal = ev.data; esVideo = ev.tipo === 'video'; } 
                else if (ev.url || ev.base64) { urlReal = ev.url || ev.base64; }

                if (urlReal && (urlReal.includes('data:video') || urlReal.toLowerCase().includes('.mp4'))) {
                    esVideo = true;
                }

                if (urlReal) {
                    if (esVideo) {
                        html += `
                            <div onclick="abrirLightbox('${al.id_alerta}', ${index})" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Ver Video">
                                <div style="display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.8); border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px; border-radius: 6px; height: 60px; width: 80px;">
                                    <span class="material-symbols-outlined" style="color: #f87171; font-size: 2rem;">play_circle</span>
                                </div>
                            </div>
                        `;
                    } else {
                        html += `
                            <div onclick="abrirLightbox('${al.id_alerta}', ${index})" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Ampliar Imagen">
                                <div style="display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px; border-radius: 6px; height: 60px; width: 60px; overflow: hidden;">
                                    <img src="${urlReal}" style="height: 100%; width: 100%; object-fit: cover; border-radius: 4px;">
                                </div>
                            </div>
                        `;
                    }
                }
            });

            if (usuarioActual) {
                html += `
                    <button onclick="borrarSoloFoto('${al.id_alerta}')" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; align-self: center; margin-left: auto;" title="Borrar toda la evidencia adjunta">
                        <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">delete_sweep</span> Borrar Adjuntos
                    </button>
                `;
            }
        } else {
            html += `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">Sin evidencia adjunta</span>`;
        }

        html += `
                </div>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
}

window.eliminarAlertaTerreno = function(idAlerta) {
    if(confirm("⚠️ ¿Estás seguro de descartar este reporte de terreno?")) {
        alertasRef.child(idAlerta).remove()
        .then(() => {
            alert("🗑️ Reporte descartado.");
            verTerreno();
        })
        .catch(e => alert("Error: " + e.message));
    }
};

window.borrarSoloFoto = function(idAlerta) {
    if(confirm("⚠️ ¿Borrar SOLO la fotografía?")) {
        alertasRef.child(idAlerta).child('evidencias').remove()
        .then(() => {
            alert("📷 Foto eliminada.");
            verTerreno();
        })
        .catch(e => alert("Error: " + e.message));
    }
};

window.reemplazarFotoTerreno = async function(inputElement, idAlerta) {
    if (!inputElement.files || inputElement.files.length === 0) return;
    const file = inputElement.files[0];
    const btnSubir = inputElement.previousElementSibling;
    const textoOriginal = btnSubir.innerHTML;
    btnSubir.innerHTML = 'Subiendo...';
    btnSubir.disabled = true;

    try {
        const base64 = await convertirABase64(file);
        await alertasRef.child(idAlerta).update({ evidencias: [base64] });
        alert("✅ Foto actualizada.");
        verTerreno(); 
    } catch (error) {
        alert("Error: " + error.message);
        btnSubir.innerHTML = textoOriginal;
        btnSubir.disabled = false;
    }
};

function renderizarListaComponentes() {
    const lista = document.getElementById('lista-componentes');
    lista.innerHTML = '';
    const componentes = activoSeleccionadoActual.componentes || {};
    const keysComponentes = Object.keys(componentes);

    if (keysComponentes.length === 0) {
        lista.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin-top: 10px;">Sin componentes creados.</p>';
        return; 
    }

    keysComponentes.forEach(key => {
        const comp = componentes[key];
        const sev = comp.estado || 'Verde';
        let iconColor = 'var(--status-ok)';
        
        if (sev === 'Rojo') iconColor = 'var(--status-critical)';
        if (sev === 'Naranja') iconColor = 'var(--status-warning)';
        if (sev === 'Amarillo') iconColor = 'var(--status-alert)';

        const esActivo = (componenteSeleccionado === key);

        lista.innerHTML += `
            <button onclick="seleccionarComponente('${key}')" style="width: 100%; text-align: left; padding: 12px; background: ${esActivo ? 'rgba(255,255,255,0.1)' : 'transparent'}; border: none; border-bottom: 1px solid rgba(255,255,255,0.05); color: white; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='${esActivo ? 'rgba(255,255,255,0.1)' : 'transparent'}'">
                <span>${comp.nombre}</span>
                <span style="color: ${iconColor}; font-size: 1rem;">●</span>
            </button>
        `;
    });
}

// ====================================================================
// FUNCIÓN REPARADA CON LA LLAVE DE CIERRE CORRECTA
// ====================================================================
window.agregarNuevoComponente = function() {
    const usuarioReal = firebase.auth().currentUser;
    if (!usuarioReal) {
        alert("🔒 Acceso denegado. La sesión de Firebase no está activa. Inicia sesión para crear componentes.");
        return;
    }

    const nombreNuevo = prompt("Escribe el nombre del nuevo componente/spot:");
    if (!nombreNuevo || nombreNuevo.trim() === '') return;
    
    const compID = 'comp_' + new Date().getTime();

    activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(compID).set({
        nombre: nombreNuevo.trim(),
        estado: 'Verde',
        es_nuevo: false,
        fecha_creacion: new Date().toISOString()
    }).then(() => {
        if (!activoSeleccionadoActual.componentes) activoSeleccionadoActual.componentes = {};
        activoSeleccionadoActual.componentes[compID] = { nombre: nombreNuevo.trim(), estado: 'Verde' };
        renderizarListaComponentes();
    });
}; // <--- ¡AQUÍ ESTÁ LA LLAVE QUE FALTABA!


window.guardarDictamenComponente = function() {
    if (!componenteSeleccionado) return;

    const fechaIngresada = document.getElementById('fecha-medicion').value;
    const tipoInspeccion = document.getElementById('tipo-inspeccion') ? document.getElementById('tipo-inspeccion').value : 'Seguimiento Específico';

    const datosComp = {
        es_nuevo: document.getElementById('check-equipo-nuevo').checked,
        ultima_medicion: fechaIngresada,
        avisos_sap: document.getElementById('avisos-sap').value,
        om_sap: document.getElementById('om-sap').value,
        analisis_ia: document.getElementById('texto-analisis-componente').value,
        estado: document.getElementById('select-salud-componente').value,
        ultimo_editor: faenaUsuario,
        fecha_edicion: new Date().toISOString()
    };

    activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(componenteSeleccionado).update(datosComp)
    .then(() => {
        if (fechaIngresada && tipoInspeccion.includes("Ruta")) {
            const fechaIso = new Date(fechaIngresada + 'T12:00:00Z').toISOString();
            activosRef.child(activoSeleccionadoActual.id_activo).update({ ultima_medicion: fechaIso });
        }

        const registroHistorico = {
            ...datosComp,
            tipo_evento: tipoInspeccion,
            timestamp_registro: new Date().toISOString()
        };
        activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(componenteSeleccionado).child('historial').push(registroHistorico);

        alert(`✅ Diagnóstico guardado.\nTipo: ${tipoInspeccion}`);
        activoSeleccionadoActual.componentes[componenteSeleccionado] = { ...activoSeleccionadoActual.componentes[componenteSeleccionado], ...datosComp };
        recalcularSaludGlobal();
    });
};

window.eliminarComponente = function() {
    if (!componenteSeleccionado) return;
    const comp = activoSeleccionadoActual.componentes[componenteSeleccionado];
    
    if(confirm(`⚠️ ¿Eliminar "${comp.nombre}"?`)) {
        activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(componenteSeleccionado).remove()
        .then(() => {
            alert("🗑️ Eliminado.");
            delete activoSeleccionadoActual.componentes[componenteSeleccionado];
            recalcularSaludGlobal();
            document.getElementById('panel-inspeccion').style.display = 'none';
            componenteSeleccionado = null;
            renderizarListaComponentes();
        })
        .catch(e => alert("Error: " + e.message));
    }
};

function recalcularSaludGlobal() {
    let peorEstado = 'Verde';
    const orden = { 'Verde': 1, 'Amarillo': 2, 'Naranja': 3, 'Rojo': 4 };
    
    if (activoSeleccionadoActual.componentes) {
        Object.values(activoSeleccionadoActual.componentes).forEach(comp => {
            if (orden[comp.estado] > orden[peorEstado]) peorEstado = comp.estado;
        });
    }

    if (peorEstado !== activoSeleccionadoActual.severidad) {
        activosRef.child(activoSeleccionadoActual.id_activo).update({ severidad: peorEstado });
    }
}

window.ejecutarAnalisisIA_Componente = async function() {
    if (!usuarioActual) {
        alert("🔒 Inicia sesión para usar la IA.");
        return;
    }
    
    if (!componenteSeleccionado) {
        alert("⚠️ Selecciona un componente.");
        return;
    }

    const btn = document.getElementById('btn-analizar-ia');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = 'Analizando...';
    btn.disabled = true;

    const comp = activoSeleccionadoActual.componentes[componenteSeleccionado];
    const inputArchivo = document.getElementById('input-espectro');
    let base64Image = null; 
    let mimeType = null;

    if (inputArchivo.files && inputArchivo.files[0]) {
        const file = inputArchivo.files[0];
        mimeType = file.type;
        const fullBase64 = await convertirABase64(file);
        base64Image = fullBase64.split(',')[1];
    }

    const promptExperto = `Actúa como Ingeniero en Confiabilidad (ISO 20816). Analiza: Equipo ${activoSeleccionadoActual.nombre}, Componente ${comp.nombre}, Estado ${comp.estado || 'Verde'}. Da un diagnóstico breve ideal para SAP.`;

    try {
        let parts = [{ "text": promptExperto }];
        if (base64Image) parts.push({ "inline_data": { "mime_type": mimeType, "data": base64Image } });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "contents": [{ "parts": parts }] })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        let textoRespuesta = data.candidates[0].content.parts[0].text;
        textoRespuesta = textoRespuesta.replace(/\*\*/g, '').replace(/\*/g, '-'); 
        document.getElementById('texto-analisis-componente').value = textoRespuesta;
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }

    btn.innerHTML = textoOriginal;
    btn.disabled = false;
};

function convertirABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// =========================================================================
// MÓDULO CIO: MONITOR DE ALERTAS DE TERRENO (FILTRADO Y ELÁSTICO)
// =========================================================================
function renderizarPanelAlertasActivas(datosAlertas) {
    const panelAlertas = document.getElementById('panelAlertasTerreno');
    if(!panelAlertas) return; 

    if (!datosAlertas) {
        panelAlertas.innerHTML = '<p class="text-muted" style="text-align: center; font-size: 0.85rem; padding: 20px;">No hay reportes activos.</p>';
        return;
    }

    panelAlertas.innerHTML = '';
    let hayAlertasActivas = false;

    const listaAlertas = Object.keys(datosAlertas).map(key => {
        return { id: key, ...datosAlertas[key] };
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const filtroEl = document.getElementById('filtroFaena');
    const filtroSeleccionado = filtroEl ? filtroEl.value.toLowerCase() : 'todas';

    listaAlertas.forEach(alerta => {
        if (alerta.estado === 'cerrado') return;
        
        if (filtroSeleccionado !== "todas" && alerta.faena) {
            const faenaAlerta = alerta.faena.toLowerCase();
            const pasaElFiltro = filtroSeleccionado.includes(faenaAlerta) || faenaAlerta.includes(filtroSeleccionado);
            if (!pasaElFiltro) return; 
        }

        hayAlertasActivas = true;

        const fechaObj = new Date(alerta.timestamp);
        const horaStr = fechaObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        
        // Búsqueda inteligente de la faena cruzando con el catálogo
        let faenaCompleta = alerta.faena;
        if (!faenaCompleta && datosGlobalesActivos) {
            const eqAsociado = Object.values(datosGlobalesActivos).find(e => (e.tag || e.nombre || '').toUpperCase() === (alerta.tag || '').toUpperCase());
            if (eqAsociado) faenaCompleta = eqAsociado.siteId || eqAsociado.faena;
        }
        const faenaCorta = faenaCompleta ? faenaCompleta.split(',')[0] : 'Ubicación Desconocida';

        const cardHTML = `
            <div class="tarjeta-alerta-terreno sev-${alerta.severidad}" style="padding: 10px 12px; cursor: pointer; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 10px;" onclick="gestionarAlertaRapida('${alerta.id}', '${alerta.tag}')" title="Clic para ver detalle">
                
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem; color: ${alerta.severidad === 'Rojo' ? '#ef4444' : alerta.severidad === 'Naranja' ? '#f97316' : '#eab308'}">
                        ${alerta.severidad === 'Rojo' ? 'error' : 'warning'}
                    </span>
                    <div style="display: flex; flex-direction: column; overflow: hidden;">
                        <span style="font-family: 'Roboto Mono', monospace; font-weight: bold; color: white; font-size: 1rem; line-height: 1.1; white-space: nowrap; text-overflow: ellipsis;">${alerta.tag}</span>
                        <span style="font-size: 0.65rem; color: #a1a1aa; line-height: 1; margin-top: 3px; white-space: nowrap; text-overflow: ellipsis;">${faenaCorta}</span>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    ${alerta.evidencias && alerta.evidencias.length > 0 ? `<span class="material-symbols-outlined" style="color: #60a5fa; font-size: 1.1rem;" title="Contiene fotos/videos">attach_file</span>` : ''}
                    <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">
                        ${horaStr}
                    </span>
                </div>
                
            </div>
        `;
        
        panelAlertas.innerHTML += cardHTML;
    });

    if(!hayAlertasActivas) {
        panelAlertas.innerHTML = '<p class="text-muted" style="text-align: center; font-size: 0.85rem; padding: 20px;">Todas las alertas gestionadas.</p>';
    }
}

window.gestionarAlertaRapida = function(idAlerta, tagEquipo) {
    if (!datosGlobalesActivos) {
        alert("El catastro aún está cargando.");
        return;
    }

    let idActivoEncontrado = null;
    const keysActivos = Object.keys(datosGlobalesActivos);
    
    for (let i = 0; i < keysActivos.length; i++) {
        const activo = datosGlobalesActivos[keysActivos[i]];
        if (activo.nombre && activo.nombre.toUpperCase() === tagEquipo.toUpperCase()) {
            idActivoEncontrado = keysActivos[i];
            break;
        }
    }

    if (idActivoEncontrado) {
        abrirModalEvidencia(idActivoEncontrado); 
        verTerreno(); 
    } else {
        alert(`❌ No se encontró el equipo "${tagEquipo}".`);
    }
};

// =========================================================================
// WIDGET CLIMA EN TIEMPO REAL (VALLENAR)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    obtenerClimaVallenar();
    setInterval(obtenerClimaVallenar, 30 * 60 * 1000); 
});

window.toggleClima = function() {
    const panel = document.getElementById('panel-clima-extendido');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
};

function obtenerIconoClima(codigo) {
    if (codigo === 0) return '☀️'; 
    if (codigo === 1 || codigo === 2) return '🌤️'; 
    if (codigo === 3) return '☁️'; 
    if (codigo >= 45 && codigo <= 48) return '🌫️'; 
    if (codigo >= 51 && codigo <= 67) return '🌧️'; 
    if (codigo >= 71 && codigo <= 82) return '❄️'; 
    if (codigo >= 95) return '⛈️'; 
    return '🌡️';
}

function obtenerNombreDia(fechaString) {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const fecha = new Date(fechaString + "T12:00:00Z");
    return dias[fecha.getUTCDay()];
}

async function obtenerClimaVallenar() {
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-28.57&longitude=-70.76&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=America%2FSantiago';
        
        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        const tempActual = Math.round(datos.current_weather.temperature);
        const iconActual = obtenerIconoClima(datos.current_weather.weathercode);
        document.getElementById('btn-clima-live').innerHTML = `${iconActual} ${tempActual}°C Vallenar`;

        const panelDias = document.getElementById('pronostico-dias');
        let htmlDias = '';

        for(let i = 1; i <= 3; i++) {
            const tempMax = Math.round(datos.daily.temperature_2m_max[i]);
            const tempMin = Math.round(datos.daily.temperature_2m_min[i]);
            const iconDia = obtenerIconoClima(datos.daily.weathercode[i]);
            const nombreDia = obtenerNombreDia(datos.daily.time[i]);

            htmlDias += `
                <div class="pronostico-card">
                    <span style="display: block; color: var(--text-muted); font-size: 0.75rem; font-weight: bold; margin-bottom: 5px;">${nombreDia.substring(0,3)}</span>
                    <span style="display: block; font-size: 1.5rem; margin-bottom: 5px;">${iconDia}</span>
                    <div style="font-size: 0.8rem;">
                        <span style="color: #ef4444; font-weight: bold;">${tempMax}°</span> 
                        <span style="color: #60a5fa;">${tempMin}°</span>
                    </div>
                </div>
            `;
        }
        panelDias.innerHTML = htmlDias;

    } catch (error) {
        console.error("Error cargando clima:", error);
        document.getElementById('btn-clima-live').innerHTML = '<span class="material-symbols-outlined">cloud_off</span> Clima Offline';
    }
}

// =========================================================================
// MÓDULO CIO: CARRUSEL MULTIMEDIA (LIGHTBOX)
// =========================================================================

let lightboxEvidencias = [];
let lightboxIndex = 0;

function inyectarLightboxHTML() {
    const lbHtml = `
    <div id="modal-lightbox" class="modal-overlay" style="display: none; z-index: 99999999;">
        <div style="position: relative; width: 90%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            
            <button onclick="cerrarLightbox()" style="position: absolute; top: -10px; right: 0; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='red'">
                <span class="material-symbols-outlined">close</span>
            </button>
            
            <button onclick="cambiarMediaLightbox(-1)" id="btn-lb-prev" style="position: absolute; left: -50px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 15px; cursor: pointer; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(59, 130, 246, 0.5)'">
                <span class="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
            
            <div id="lightbox-content" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(9, 11, 16, 0.9); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.8);">
            </div>

            <button onclick="cambiarMediaLightbox(1)" id="btn-lb-next" style="position: absolute; right: -50px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 15px; cursor: pointer; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(59, 130, 246, 0.5)'">
                <span class="material-symbols-outlined">arrow_forward_ios</span>
            </button>
            
            <div id="lightbox-counter" style="position: absolute; bottom: -40px; background: rgba(0,0,0,0.5); padding: 5px 15px; border-radius: 20px; color: white; font-family: 'Roboto Mono', monospace; font-size: 0.9rem; border: 1px solid rgba(255,255,255,0.1);">1 / 3</div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', lbHtml);
}

window.abrirLightbox = function(idAlerta, startIndex) {
    const al = datosGlobalesAlertas[idAlerta];
    if (!al) return;
    
    let dataEvidencias = al.evidencias || al.evidencia || [];
    if (!Array.isArray(dataEvidencias)) dataEvidencias = [dataEvidencias];
    
    lightboxEvidencias = dataEvidencias.map(ev => {
        let url = '';
        let isVideo = false;
        if (typeof ev === 'string') { url = ev; }
        else if (ev.data) { url = ev.data; isVideo = ev.tipo === 'video'; }
        else if (ev.url || ev.base64) { url = ev.url || ev.base64; }
        
        if (url && (url.includes('data:video') || url.toLowerCase().includes('.mp4'))) {
            isVideo = true;
        }
        return { url, isVideo };
    }).filter(e => e.url !== ''); 
    
    if (lightboxEvidencias.length === 0) return;
    
    lightboxIndex = startIndex;
    document.getElementById('modal-lightbox').style.display = 'flex';
    actualizarVistaLightbox();
};

window.cerrarLightbox = function() {
    document.getElementById('modal-lightbox').style.display = 'none';
    document.getElementById('lightbox-content').innerHTML = ''; 
};

window.cambiarMediaLightbox = function(dir) {
    lightboxIndex += dir;
    if (lightboxIndex < 0) lightboxIndex = lightboxEvidencias.length - 1;
    if (lightboxIndex >= lightboxEvidencias.length) lightboxIndex = 0;
    actualizarVistaLightbox();
};

window.actualizarVistaLightbox = function() {
    const ev = lightboxEvidencias[lightboxIndex];
    const container = document.getElementById('lightbox-content');
    
    if (ev.isVideo) {
        container.innerHTML = `<video controls autoplay style="max-width: 100%; max-height: 100%; border-radius: 8px;"><source src="${ev.url}"></video>`;
    } else {
        container.innerHTML = `<img src="${ev.url}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">`;
    }
    
    document.getElementById('lightbox-counter').innerText = `Evidencia ${lightboxIndex + 1} de ${lightboxEvidencias.length}`;
    
    const displayArrows = lightboxEvidencias.length > 1 ? 'flex' : 'none';
    document.getElementById('btn-lb-prev').style.display = displayArrows;
    document.getElementById('btn-lb-next').style.display = displayArrows;
};

// =========================================================================
// MÓDULO CIO (FASE 2): PLANIFICADOR INTELIGENTE DE RUTAS CBM
// =========================================================================

window.abrirPlanificadorCBM = function() {
    document.getElementById('modalPlanificadorCBM').style.display = 'flex';
    if(datosGlobalesActivos) renderizarTablaCBM();
};

window.cerrarPlanificadorCBM = function() {
    document.getElementById('modalPlanificadorCBM').style.display = 'none';
};

window.renderizarTablaCBM = function() {
    const tbody = document.getElementById('tablaRutasCBM');
    const filtro = document.getElementById('filtroCBM') ? document.getElementById('filtroCBM').value : 'todos';
    
    const inputBuscar = document.getElementById('input-buscar-rutas');
    const textoBusqueda = inputBuscar ? inputBuscar.value.toLowerCase().trim() : '';

    tbody.innerHTML = '';
    
    if (!datosGlobalesActivos) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">Cargando catastro de activos...</td></tr>';
        return;
    }

    const hoy = new Date();
    let procesados = [];

    Object.keys(datosGlobalesActivos).forEach(key => {
        let eq = datosGlobalesActivos[key];
        
        if (!eq.ultima_medicion) {
            eq.ultima_medicion = hoy.toISOString();
            eq.frecuencia_dias = 30;
            activosRef.child(key).update({ ultima_medicion: eq.ultima_medicion, frecuencia_dias: 30 });
        }

        const fUltima = new Date(eq.ultima_medicion);
        const dias = Math.ceil(Math.abs(hoy - fUltima) / (1000 * 60 * 60 * 24)) - 1;
        const limite = eq.frecuencia_dias || 30;
        
        let estado = dias >= limite ? '🔴' : (dias >= limite * 0.8 ? '🟡' : '🟢');
        let bg = dias >= limite ? 'background: rgba(239, 68, 68, 0.08);' : '';
        
        procesados.push({ id_activo: key, ...eq, dias, limite, estado, bg });
    });

    procesados.sort((a, b) => (b.dias / b.limite) - (a.dias / a.limite));

    if (textoBusqueda !== '') {
        procesados = procesados.filter(eq => {
            const nombreEq = (eq.nombre || eq.tag || eq.Tag || '').toLowerCase();
            return nombreEq.includes(textoBusqueda);
        });
    }

    if (procesados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron equipos para "${textoBusqueda}".</td></tr>`;
        return;
    }

    procesados.forEach(eq => {
        if (filtro === 'vencidos' && eq.estado !== '🔴') return;
        if (filtro === 'seguimiento' && eq.limite === 30) return; 

        const fFormato = new Date(eq.ultima_medicion).toLocaleDateString('es-CL');
        
        let avisosComponentes = "";
        if (eq.componentes) {
            const fechaRutaGlobal = new Date(eq.ultima_medicion);
            Object.values(eq.componentes).forEach(comp => {
                if (comp.ultima_medicion) {
                    const fechaComp = new Date(comp.ultima_medicion + 'T12:00:00Z');
                    if (fechaComp > fechaRutaGlobal) {
                        const diasComp = Math.ceil(Math.abs(hoy - fechaComp) / (1000 * 60 * 60 * 24)) - 1;
                        avisosComponentes += `<div style="font-size: 0.75rem; color: #fbbf24; margin-top: 4px; display: flex; align-items: center; gap: 4px;" title="Medido de forma aislada">
                            <span class="material-symbols-outlined" style="font-size: 0.9rem;">warning</span> 
                            ${comp.nombre} medido hace ${diasComp} días
                        </div>`;
                    }
                }
            });
        }
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${eq.bg} transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='${eq.bg ? 'rgba(239, 68, 68, 0.08)' : 'transparent'}'">
                <td style="padding: 15px 20px; font-size: 1.5rem; text-align: center;">${eq.estado}</td>
                <td style="padding: 15px 20px;">
                    <strong style="color: white; font-size: 1rem;">${eq.nombre || eq.tag || eq.Tag || 'SIN TAG'}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">${eq.tipo_equipo || 'Activo General'}</div>
                </td>
                <td style="padding: 15px 20px; color: var(--text-muted);">${eq.area || 'Planta'}</td>
                <td style="padding: 15px 20px;">
                    <div style="font-family: 'Roboto Mono', monospace; font-size: 0.9rem;">${fFormato}</div>
                    ${avisosComponentes}
                </td>
                <td style="padding: 15px 20px;">
                    <span style="background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1);">${eq.limite} días</span>
                </td>
                <td style="padding: 15px 20px; font-weight: bold; font-size: 1.1rem; color: ${eq.estado === '🔴' ? '#ef4444' : 'var(--status-ok)'};">
                    ${eq.dias} días
                </td>
                <td style="padding: 15px 20px; text-align: center; display: flex; gap: 10px; justify-content: center;">
                    <button onclick="registrarMedicionCBM('${eq.id_activo}')" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px; transition: 0.2s;" onmouseover="this.style.background='rgba(34, 197, 94, 0.3)'" onmouseout="this.style.background='rgba(34, 197, 94, 0.15)'">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">check_circle</span> Medido
                    </button>
                    <button onclick="cambiarCicloCBM('${eq.id_activo}', '${eq.nombre || eq.tag}')" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px; transition: 0.2s;" onmouseover="this.style.background='rgba(245, 158, 11, 0.3)'" onmouseout="this.style.background='rgba(245, 158, 11, 0.15)'">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">timer</span> Ciclo
                    </button>
                </td>
            </tr>
        `;
    });
};

window.registrarMedicionCBM = function(id) {
    if(confirm("¿Confirmas que se ejecutó la ruta CBM de todo el conjunto? Esto actualizará la fecha del equipo y de TODOS sus componentes.")) {
        const fechaHoyIso = new Date().toISOString();
        const fechaHoyInput = fechaHoyIso.split('T')[0]; 

        let actualizaciones = { ultima_medicion: fechaHoyIso };

        const activo = datosGlobalesActivos[id];
        if (activo && activo.componentes) {
            Object.keys(activo.componentes).forEach(compId => {
                actualizaciones[`componentes/${compId}/ultima_medicion`] = fechaHoyInput;
            });
        }

        activosRef.child(id).update(actualizaciones)
        .then(() => { 
            alert("Ruta registrada. Fechas sincronizadas en cascada."); 
            renderizarTablaCBM(); 
        });
    }
};

window.cambiarCicloCBM = function(id, tag) {
    let n = parseInt(prompt(`Analista CIO, ingresa el nuevo ciclo de seguimiento (DÍAS) para el equipo: ${tag}\n\nRecomendaciones:\n- 30 (Normal / Mensual)\n- 15 (Alarma / Quincenal)\n- 7 (Crítico / Semanal)`));
    if (n && n > 0) {
        activosRef.child(id).update({ frecuencia_dias: n }).then(() => renderizarTablaCBM());
    }
};

// =========================================================================
// MÓDULO CIO: BUSCADORES EN TIEMPO REAL (BARRAS LATERALES)
// =========================================================================

window.filtrarCatastro = function() {
    if (datosGlobalesActivos) {
        renderizarCatastro(datosGlobalesActivos);
    }
};

window.limpiarBusquedaCatastro = function() {
    const input = document.getElementById('input-buscar-catastro');
    if (input) input.value = '';
    vistaActualPanel = 'AREAS';
    areaSeleccionadaPanel = null;
    renderizarCatastro(datosGlobalesActivos);
};

window.filtrarAlertas = function() {
    const input = document.getElementById('input-buscar-alertas');
    if(!input) return;

    const texto = input.value.toLowerCase();
    const items = document.querySelectorAll('#panelAlertasTerreno .tarjeta-alerta-terreno');

    items.forEach(item => {
        const contenidoTarjeta = item.innerText.toLowerCase();

        if (contenidoTarjeta.includes(texto)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

// =========================================================================
// MÓDULO CIO: EDICIÓN INTERACTIVA DE MAPA (LEAFLET)
// =========================================================================

let marcadorEdicion = null; // Variable para guardar el pin temporal

// NUEVA FUNCIÓN: Teletransporta el pin a donde el usuario hace clic
window.manejarClickMapa = function(e) {
    if (marcadorEdicion) {
        marcadorEdicion.setLatLng(e.latlng); // Mueve el pin a las coordenadas del clic
    }
};

window.iniciarEdicionGeorreferencia = function() {
    const usuarioReal = firebase.auth().currentUser;
    if (!usuarioReal) {
        alert("🔒 Acceso denegado.");
        return;
    }

    if (!activoSeleccionadoActual) {
        alert("⚠️ Error: No hay equipo seleccionado.");
        return;
    }

    // 1. Ocultar el modal para ver el mapa
    document.getElementById('modal-evidencia').style.display = 'none';

    // 2. Mostrar el panel de Guardar/Cancelar y cambiar su texto
    const panel = document.getElementById('panel-edicion-mapa');
    if(panel) {
        panel.style.display = 'flex';
        // Ajustamos el texto dinámicamente para que diga "haz clic"
        const subtitulo = panel.querySelector('span:nth-child(2)');
        if (subtitulo) subtitulo.innerText = "Haz clic en cualquier punto del mapa para ubicar el equipo.";
    }

    // 3. Coordenadas iniciales (Usa las del equipo o las del centro de MLC)
    let lat = activoSeleccionadoActual.latitud ? parseFloat(activoSeleccionadoActual.latitud) : -28.298;
    let lng = activoSeleccionadoActual.longitud ? parseFloat(activoSeleccionadoActual.longitud) : -70.785; 

    // 4. Capturar el mapa de Leaflet
    const mapaReferencia = window.mapa; 
    if (!mapaReferencia) {
        alert("❌ Error: El mapa no está cargado correctamente.");
        return;
    }

    // 5. Crear el Pin (Aún se puede arrastrar por si acaso)
    if (marcadorEdicion) {
        mapaReferencia.removeLayer(marcadorEdicion);
    }
    
    marcadorEdicion = L.marker([lat, lng], {
        draggable: true,
        title: "Haz clic en el mapa para ubicarme"
    }).addTo(mapaReferencia);

    mapaReferencia.setView([lat, lng], 17); // Zoom de cerca

    // 6. ¡LA MAGIA!: Escuchar los clics del mouse en el mapa
    mapaReferencia.on('click', window.manejarClickMapa);
    
    // Cambiamos el cursor a una mirilla para mejor experiencia de usuario
    document.getElementById('mapa-gis').style.cursor = 'crosshair'; 
};

window.guardarCoordenadasMapa = function() {
    if (!marcadorEdicion || !activoSeleccionadoActual) return;

    const posicion = marcadorEdicion.getLatLng();
    const btnGuardar = document.getElementById('btn-guardar-coords');
    btnGuardar.innerHTML = "Guardando...";

    activosRef.child(activoSeleccionadoActual.id_activo).update({
        latitud: posicion.lat,
        longitud: posicion.lng
    }).then(() => {
        alert("✅ Coordenadas guardadas con éxito.");
        
        // Actualizar en memoria local
        if (datosGlobalesActivos[activoSeleccionadoActual.id_activo]) {
            datosGlobalesActivos[activoSeleccionadoActual.id_activo].latitud = posicion.lat;
            datosGlobalesActivos[activoSeleccionadoActual.id_activo].longitud = posicion.lng;
        }
        
        window.limpiarModoEdicionMapa();
        
        // Volver a abrir el modal
        window.abrirModalEvidencia(activoSeleccionadoActual.id_activo);
        
        // Refrescar los pines del mapa automáticamente
        if (typeof window.actualizarPinesMapa === 'function') {
            window.actualizarPinesMapa(datosGlobalesActivos);
        }

    }).catch(e => {
        alert("Error: " + e.message);
        btnGuardar.innerHTML = "Guardar Ubicación";
    });
};

window.cancelarEdicionMapa = function() {
    window.limpiarModoEdicionMapa();
    // Volver al expediente del equipo
    if (activoSeleccionadoActual && activoSeleccionadoActual.id_activo) {
        window.abrirModalEvidencia(activoSeleccionadoActual.id_activo);
    }
};

window.limpiarModoEdicionMapa = function() {
    const mapaReferencia = window.mapa;
    
    if (mapaReferencia) {
        // MUY IMPORTANTE: Apagamos la escucha de clics para que el mapa vuelva a la normalidad
        mapaReferencia.off('click', window.manejarClickMapa);
        // Restauramos el cursor estándar
        document.getElementById('mapa-gis').style.cursor = ''; 
    }

    if (marcadorEdicion && mapaReferencia) {
        mapaReferencia.removeLayer(marcadorEdicion);
    }
    marcadorEdicion = null;
    
    const panel = document.getElementById('panel-edicion-mapa');
    if(panel) panel.style.display = 'none';
    
    const btnGuardar = document.getElementById('btn-guardar-coords');
    if(btnGuardar) btnGuardar.innerHTML = "Guardar Ubicación";
};