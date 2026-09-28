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

let vistaActualPanel = 'AREAS'; // Puede ser 'AREAS' o 'EQUIPOS'
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
            if (datosUsuario && datosUsuario.faena) {
                faenaUsuario = datosUsuario.faena;
                const badgePerfil = document.querySelector('#perfil-analista .badge');
                if(badgePerfil) badgePerfil.innerText = `Analista: ${faenaUsuario}`;
                
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
        datosGlobalesActivos = snapshot.val();
        aplicarFiltroFaena();
    });
    
    // Escucha global de Alertas de Terreno
    alertasRef.on('value', (snapshot) => {
        datosGlobalesAlertas = snapshot.val();
        // Dispara la función para dibujar las alertas en la columna derecha
        renderizarPanelAlertasActivas(datosGlobalesAlertas);
        
        // Si el usuario tiene el modal de un equipo abierto en la pestaña de terreno, lo recargamos
        if (document.getElementById('panel-terreno') && document.getElementById('panel-terreno').style.display === 'block') {
            renderizarAlertasTerreno();
        }
    });
});

window.aplicarFiltroFaena = function() {
    vistaActualPanel = 'AREAS'; 
    areaSeleccionadaPanel = null;
    renderizarCatastro(datosGlobalesActivos);
    // Forzamos actualización del panel derecho al cambiar el filtro
    renderizarPanelAlertasActivas(datosGlobalesAlertas);
};

function renderizarCatastro(activosData) {
    const contenedor = document.getElementById('lista-alertas');
    if(!contenedor) return;
    
    const filtroEl = document.getElementById('filtroFaena');
    const filtroSeleccionado = filtroEl ? filtroEl.value : 'TODAS';
    
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
        document.getElementById('kpi-ok').innerText = 0; document.getElementById('kpi-alert').innerText = 0; document.getElementById('kpi-warn').innerText = 0; document.getElementById('kpi-crit').innerText = 0;
        return;
    }

    // Calcular KPIs Globales
    activosFiltrados.forEach(activo => {
        const severidad = activo.severidad || 'Verde'; 
        if (severidad === 'Rojo') conteoRojo++;
        else if (severidad === 'Naranja') conteoNaranja++;
        else if (severidad === 'Amarillo') conteoAmarillo++;
        else conteoVerde++;
    });
    document.getElementById('kpi-ok').innerText = conteoVerde;
    document.getElementById('kpi-alert').innerText = conteoAmarillo;
    document.getElementById('kpi-warn').innerText = conteoNaranja;
    document.getElementById('kpi-crit').innerText = conteoRojo;

    let htmlInyectado = '';

    // -- NIVEL 1: ÁREAS --
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

            // Sumar si este equipo tiene reportes de terreno
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

            // Badge de terreno para el Área (Sumatoria)
            let badgeTerrenoArea = '';
            if (area.alertasTerreno > 0) {
                badgeTerrenoArea = `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 4px;" title="Hay reportes de terreno en esta área">
                    <span class="material-symbols-outlined" style="font-size: 0.9rem;">engineering</span> ${area.alertasTerreno}
                </span>`;
            }

            htmlInyectado += `
                <div class="alerta-item" onclick="entrarArea('${area.nombre}')" style="border-left: 4px solid ${colorBorde}; background: rgba(255,255,255,0.03); padding: 15px; margin-bottom: 12px; border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: white; font-size: 1.1rem; display: flex; align-items: center;">
                            <span class="material-symbols-outlined" style="font-size: 1.2rem; margin-right: 5px;">account_tree</span> 
                            ${area.nombre} 
                            ${badgeTerrenoArea}
                        </strong>
                        <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px;">${area.total} equipos</span>
                    </div>
                    <div style="display: flex; gap: 10px; font-size: 0.85rem; margin-top: 10px;">
                        ${area.rojos > 0 ? `<span style="color: var(--status-critical); font-weight: bold;">🔴 ${area.rojos}</span>` : ''}
                        ${area.naranjas > 0 ? `<span style="color: var(--status-warning); font-weight: bold;">🟠 ${area.naranjas}</span>` : ''}
                        ${area.amarillos > 0 ? `<span style="color: var(--status-alert); font-weight: bold;">🟡 ${area.amarillos}</span>` : ''}
                        ${(area.rojos === 0 && area.naranjas === 0 && area.amarillos === 0) ? `<span style="color: var(--status-ok); font-weight: bold;">🟢 100% Normal</span>` : ''}
                    </div>
                </div>
            `;
        });
    } 
    // -- NIVEL 2: EQUIPOS DENTRO DEL ÁREA --
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

            // Contar si este equipo específico tiene alertas de terreno
            let cantidadTerreno = 0;
            if (datosGlobalesAlertas) {
                cantidadTerreno = Object.values(datosGlobalesAlertas).filter(al => al.tag && al.tag.toUpperCase() === (activo.nombre || '').toUpperCase()).length;
            }

            // Badge individual para el equipo
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
    const activo = datosGlobalesActivos[idActivo];
    if (!activo) return;
    
    activoSeleccionadoActual = { id_activo: idActivo, ...activo };

    // Configurar cabecera
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

    // 1. Ocultar el panel de inspección de componentes
    document.getElementById('panel-inspeccion').style.display = 'none';
    componenteSeleccionado = null;

    // 2. Mostrar el panel de RESUMEN y calcular sus datos
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

        // Redactar un diagnóstico dinámico según lo que cuente
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
};

window.seleccionarComponente = function(compID) {
    componenteSeleccionado = compID;
    renderizarListaComponentes(); 
    
    const comp = activoSeleccionadoActual.componentes[compID];
    
   // OCULTAR EL RESUMEN, EL TERRENO Y MOSTRAR LA INSPECCIÓN
    const panelResumen = document.getElementById('panel-resumen-equipo');
    if (panelResumen) panelResumen.style.display = 'none';
    const panelTerreno = document.getElementById('panel-terreno');
    if (panelTerreno) panelTerreno.style.display = 'none';
    
    document.getElementById('panel-inspeccion').style.display = 'block';
    
    // Cargar datos en los inputs...
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

// Navegación interna del Modal
window.verResumen = function() {
    document.getElementById('panel-inspeccion').style.display = 'none';
    document.getElementById('panel-terreno').style.display = 'none';
    document.getElementById('panel-resumen-equipo').style.display = 'block';
    componenteSeleccionado = null;
    renderizarListaComponentes(); // Quita la selección verde de los componentes
};

window.verTerreno = function() {
    document.getElementById('panel-inspeccion').style.display = 'none';
    document.getElementById('panel-resumen-equipo').style.display = 'none';
    document.getElementById('panel-terreno').style.display = 'block';
    componenteSeleccionado = null;
    renderizarListaComponentes(); // Quita la selección verde
    renderizarAlertasTerreno(); // Llama a Firebase
};

function renderizarAlertasTerreno() {
    const contenedor = document.getElementById('historial-terreno-lista');
    
    // --- 1. CREACIÓN DEL PROYECTOR GLOBAL (FUERA DEL MODAL) ---
    // Esto asegura que la foto gigante nunca jamás se corte.
    let visorGlobal = document.getElementById('visor-zoom-global');
    if (!visorGlobal) {
        visorGlobal = document.createElement('img');
        visorGlobal.id = 'visor-zoom-global';
        // pointer-events: none evita que el ratón "choque" con la foto y parpadee
        visorGlobal.style.cssText = 'display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 85vw; max-height: 85vh; object-fit: contain; background: rgba(26,28,35,0.95); padding: 10px; border-radius: 8px; border: 2px solid #60a5fa; z-index: 9999999; box-shadow: 0 10px 50px rgba(0,0,0,0.9); pointer-events: none;';
        document.body.appendChild(visorGlobal);
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
        let colorSev = '#22c55e'; // Verde
        if(al.severidad === 'Rojo') colorSev = '#ef4444';
        if(al.severidad === 'Naranja') colorSev = '#f97316';
        if(al.severidad === 'Amarillo') colorSev = '#eab308';

        // Extracción inteligente de URL
        let urlReal = '';
        if (al.evidencias) {
            if (Array.isArray(al.evidencias) && al.evidencias.length > 0) {
                urlReal = typeof al.evidencias[0] === 'string' ? al.evidencias[0] : (al.evidencias[0].url || al.evidencias[0].link || '');
            } else if (typeof al.evidencias === 'string') {
                urlReal = al.evidencias;
            } else if (typeof al.evidencias === 'object') {
                const firstKey = Object.keys(al.evidencias)[0];
                if (firstKey) urlReal = typeof al.evidencias[firstKey] === 'string' ? al.evidencias[firstKey] : (al.evidencias[firstKey].url || '');
            }
        }

        // DETECTOR DE VIDEO
        let esVideo = false;
        if (urlReal && (urlReal.includes('data:video') || urlReal.toLowerCase().includes('.mp4') || urlReal.toLowerCase().includes('.mov') || urlReal.toLowerCase().includes('video%2F'))) {
            esVideo = true;
        }

        html += `
            <div style="background: rgba(0,0,0,0.3); border-left: 4px solid ${colorSev}; padding: 15px; border-radius: 6px; position: relative;">
                
                <button onclick="eliminarAlertaTerreno('${al.id_alerta}')" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--status-critical)'" onmouseout="this.style.color='var(--text-muted)'" title="Eliminar todo el reporte">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
                </button>

                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-right: 35px;">
                    <span style="color: var(--text-muted); font-size: 0.8rem;">📅 ${new Date(al.timestamp).toLocaleString('es-CL')} | Inspector</span>
                    <span style="background: rgba(255,255,255,0.1); color: ${colorSev}; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">
                        ${al.severidad.toUpperCase()}
                    </span>
                </div>
                <p style="color: white; font-size: 0.95rem; margin-bottom: 10px;">${al.detalle}</p>
                
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        `;

        if (urlReal) {
            if (esVideo) {
                // RENDERIZAR REPRODUCTOR DE VIDEO
                html += `
                    <div style="width: 100%; margin-bottom: 10px;">
                        <video controls style="max-width: 100%; max-height: 250px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);">
                            <source src="${urlReal}">
                            Tu navegador no soporta el reproductor de video.
                        </video>
                    </div>
                    <button onclick="borrarSoloFoto('${al.id_alerta}')" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                        <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">videocam_off</span> Borrar Video
                    </button>
                `;
            } else {
                // RENDERIZAR BOTÓN FOTO CON CONEXIÓN AL PROYECTOR GLOBAL
                html += `
                    <a href="${urlReal}" target="_blank" style="position: relative; display: inline-block; text-decoration: none;"
                       onmouseenter="document.getElementById('visor-zoom-global').src='${urlReal}'; document.getElementById('visor-zoom-global').style.display='block';"
                       onmouseleave="document.getElementById('visor-zoom-global').style.display='none';">
                        
                        <div style="display: flex; align-items: center; gap: 8px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 8px 4px 4px; border-radius: 6px;">
                            <img src="${urlReal}" style="height: 35px; width: 35px; object-fit: cover; border-radius: 4px;">
                            <span style="color: #60a5fa; font-size: 0.8rem; font-weight: bold;">Ver Foto</span>
                        </div>
                    </a>
                    
                    <button onclick="borrarSoloFoto('${al.id_alerta}')" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                        <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">image_not_supported</span>
                    </button>
                `;
            }
        } else {
            html += `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">Sin evidencia adjunta</span>`;
        }

        html += `
                    <button onclick="document.getElementById('input-foto-${al.id_alerta}').click()" style="background: rgba(255, 255, 255, 0.1); color: white; border: 1px dashed rgba(255, 255, 255, 0.3); padding: 8px 12px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; margin-left: auto;">
                        <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">upload</span> ${urlReal ? 'Reemplazar' : 'Agregar'}
                    </button>
                    <input type="file" id="input-foto-${al.id_alerta}" accept="image/*,video/*" style="display: none;" onchange="reemplazarFotoTerreno(this, '${al.id_alerta}')">
                </div>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
}

// ------------------------------------------
// FUNCIÓN PARA DESCARTAR REPORTES DE TERRENO
// ------------------------------------------
window.eliminarAlertaTerreno = function(idAlerta) {
    if(confirm("⚠️ ¿Estás seguro de descartar este reporte de terreno?\n\nAl eliminarlo, se borrará del historial de este equipo. (Úsalo para limpiar falsas alarmas o reportes duplicados).")) {
        
        alertasRef.child(idAlerta).remove()
        .then(() => {
            alert("🗑️ Reporte de terreno descartado correctamente.");
            // Recargamos el panel de terreno para que desaparezca la tarjeta
            verTerreno();
        })
        .catch(e => {
            alert("Error al intentar eliminar el reporte: " + e.message);
        });
    }
};

// ------------------------------------------
// BORRAR SOLO LA FOTO DE TERRENO
// ------------------------------------------
window.borrarSoloFoto = function(idAlerta) {
    if(confirm("⚠️ ¿Estás seguro de borrar SOLO la fotografía?\n\nEl texto y severidad reportados por el técnico se mantendrán intactos.")) {
        // Borramos el nodo 'evidencias' de ese reporte específico en Firebase
        alertasRef.child(idAlerta).child('evidencias').remove()
        .then(() => {
            alert("📷 Foto eliminada correctamente.");
            verTerreno(); // Recargamos la vista
        })
        .catch(e => alert("Error al borrar la foto: " + e.message));
    }
};

// ------------------------------------------
// REEMPLAZAR O AGREGAR NUEVA FOTO
// ------------------------------------------
window.reemplazarFotoTerreno = async function(inputElement, idAlerta) {
    if (!inputElement.files || inputElement.files.length === 0) return;
    
    const file = inputElement.files[0];
    
    // Mostramos un aviso para que el usuario espere
    const btnSubir = inputElement.previousElementSibling;
    const textoOriginal = btnSubir.innerHTML;
    btnSubir.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 2s linear infinite; vertical-align: middle;">sync</span> Subiendo...';
    btnSubir.disabled = true;

    try {
        // Usamos la misma función que convierte espectros a Base64 para Gemini
        const base64 = await convertirABase64(file);
        
        // Guardamos la nueva imagen en Firebase (como un array, para no romper compatibilidad con la App)
        await alertasRef.child(idAlerta).update({
            evidencias: [base64]
        });
        
        alert("✅ Foto actualizada con éxito en la base de datos.");
        verTerreno(); // Recargamos la vista para mostrar el botón azul de "Ver Foto"
        
    } catch (error) {
        alert("Error al procesar la imagen: " + error.message);
        btnSubir.innerHTML = textoOriginal;
        btnSubir.disabled = false;
    }
};

// ==========================================
// LÓGICA CRUD DE COMPONENTES (PUNTOS DE MEDICIÓN)
// ==========================================
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
            <button onclick="seleccionarComponente('${key}')" style="width: 100%; text-align: left; padding: 12px; background: ${esActivo ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)'}; border: 1px solid ${esActivo ? 'var(--text-main)' : 'rgba(255,255,255,0.05)'}; color: white; border-radius: 6px; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <span>${comp.nombre}</span>
                <span style="color: ${iconColor}; font-size: 0.8rem;">●</span>
            </button>
        `;
    });
}

window.agregarNuevoComponente = function() {
    const nombreNuevo = prompt("Escribe el nombre del nuevo componente/spot (Ej: P1 LI, M1 LLA):");
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
};

window.guardarDictamenComponente = function() {
    if (!componenteSeleccionado) return;

    const datosComp = {
        es_nuevo: document.getElementById('check-equipo-nuevo').checked,
        ultima_medicion: document.getElementById('fecha-medicion').value,
        avisos_sap: document.getElementById('avisos-sap').value,
        om_sap: document.getElementById('om-sap').value,
        analisis_ia: document.getElementById('texto-analisis-componente').value,
        estado: document.getElementById('select-salud-componente').value,
        ultimo_editor: faenaUsuario,
        fecha_edicion: new Date().toISOString()
    };

    activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(componenteSeleccionado).update(datosComp)
    .then(() => {
        alert("✅ Análisis del componente guardado exitosamente.");
        activoSeleccionadoActual.componentes[componenteSeleccionado] = { ...activoSeleccionadoActual.componentes[componenteSeleccionado], ...datosComp };
        recalcularSaludGlobal();
    });
};

window.eliminarComponente = function() {
    if (!componenteSeleccionado) return;
    const comp = activoSeleccionadoActual.componentes[componenteSeleccionado];
    
    if(confirm(`⚠️ ATENCIÓN: ¿Estás seguro que deseas ELIMINAR el punto de medición "${comp.nombre}"?\n\nEsta acción borrará todos sus datos de la base de datos y no se puede deshacer.`)) {
        activosRef.child(activoSeleccionadoActual.id_activo).child('componentes').child(componenteSeleccionado).remove()
        .then(() => {
            alert(`🗑️ El componente "${comp.nombre}" ha sido eliminado exitosamente.`);
            delete activoSeleccionadoActual.componentes[componenteSeleccionado];
            recalcularSaludGlobal();
            document.getElementById('panel-inspeccion').style.display = 'none';
            componenteSeleccionado = null;
            renderizarListaComponentes();
        })
        .catch(e => alert("Error al intentar eliminar: " + e.message));
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

// ==========================================
// IA GEMINI: ANÁLISIS DE COMPONENTES Y ESPECTROS
// ==========================================
window.ejecutarAnalisisIA_Componente = async function() {
    if (!usuarioActual) {
        alert("🔒 Debes iniciar sesión como Analista para usar la IA.");
        return;
    }
    
    if (!componenteSeleccionado) {
        alert("⚠️ Selecciona un componente primero en el panel izquierdo.");
        return;
    }

    const btn = document.getElementById('btn-analizar-ia');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = 'Analizando Componente... <span class="material-symbols-outlined" style="animation: spin 2s linear infinite; vertical-align: middle;">sync</span>';
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

    const promptExperto = `
    Actúa como Ingeniero Experto en Confiabilidad (Norma ISO 20816) de la Compañía Minera del Pacífico. 
    Analiza la salud de este punto de medición específico:
    - Equipo Principal: ${activoSeleccionadoActual.nombre} (${activoSeleccionadoActual.tipo_equipo})
    - Componente / Spot: ${comp.nombre}
    - Estado actual: ${comp.estado || 'Verde'}
    - ¿Recién cambiado?: ${document.getElementById('check-equipo-nuevo').checked ? 'Sí' : 'No'}
    
    ${base64Image ? "Se adjunta el espectro de vibración o termograma." : "No se adjuntaron gráficas, básate en el contexto."}
    
    REGLA ESTRICTA: Redacta un diagnóstico técnico MUY BREVE Y DIRECTO, ideal para copiar y pegar en un Aviso SAP. 
    NO uses introducciones, saludos ni despedidas.
    Usa máximo 4 líneas separadas por guiones.
    
    Formato obligatorio:
    - Hallazgo principal (qué se ve en el espectro o condición).
    - Causa raíz probable.
    - Acción recomendada para la OM.
    - Severidad sugerida.
    `;

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
        alert(`❌ Error al conectar con Gemini: ${error.message}`);
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
// MÓDULO CIO: MONITOR DE ALERTAS DE TERRENO EN TIEMPO REAL (COLUMNA DERECHA)
// =========================================================================
function renderizarPanelAlertasActivas(datosAlertas) {
    const panelAlertas = document.getElementById('panelAlertasTerreno');
    
    // Si no existe el panel en el HTML, cancelamos
    if(!panelAlertas) return; 

    if (!datosAlertas) {
        panelAlertas.innerHTML = '<p class="text-muted" style="text-align: center; font-size: 0.85rem; padding: 20px;">No hay reportes activos en terreno.</p>';
        return;
    }

    panelAlertas.innerHTML = ''; // Limpiar el panel antes de redibujar
    let hayAlertasActivas = false;

    // Convertir a un arreglo y ordenar de la más nueva a la más antigua
    const listaAlertas = Object.keys(datosAlertas).map(key => {
        return { id: key, ...datosAlertas[key] };
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Dibujar cada alerta
    listaAlertas.forEach(alerta => {
        // Filtramos las que ya fueron cerradas
        if (alerta.estado === 'cerrado') return;
        
        // Filtro de Seguridad RBAC: Si el analista es de una faena específica, solo ve las alertas de esa faena
        const filtroEl = document.getElementById('filtroFaena');
        const filtroSeleccionado = filtroEl ? filtroEl.value : 'TODAS';
        if (filtroSeleccionado !== "TODAS" && alerta.faena && alerta.faena !== filtroSeleccionado) {
            return;
        }

        hayAlertasActivas = true;

        // Formatear hora (Ej: 14:35)
        const fechaObj = new Date(alerta.timestamp);
        const horaStr = fechaObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

        // Crear la tarjeta HTML
        const cardHTML = `
            <div class="tarjeta-alerta-terreno sev-${alerta.severidad}">
                <div class="alerta-t-header">
                    <span class="alerta-t-tag">${alerta.tag}</span>
                    <span class="alerta-t-hora">🕒 ${horaStr}</span>
                </div>
                
                <div style="font-size: 0.75rem; color: #a1a1aa; margin-top: -3px; margin-bottom: 5px;">
                    ${alerta.faena} - ${alerta.area}
                </div>
                
                <div class="alerta-t-detalle">
                    ${alerta.detalle}
                </div>
                
                ${alerta.evidencias && alerta.evidencias.length > 0 ? 
                  `<div style="font-size: 0.75rem; color: #60a5fa; margin-top: 5px;">📎 Contiene fotos/videos</div>` 
                  : ''}
                
                <button class="btn-alerta-accion" onclick="gestionarAlertaRapida('${alerta.id}', '${alerta.tag}')">
                    <span class="material-symbols-outlined" style="font-size: 0.9rem; vertical-align: middle;">search</span> Revisar Expediente
                </button>
            </div>
        `;
        
        panelAlertas.innerHTML += cardHTML;
    });

    if(!hayAlertasActivas) {
        panelAlertas.innerHTML = '<p class="text-muted" style="text-align: center; font-size: 0.85rem; padding: 20px;">Todas las alertas han sido gestionadas.</p>';
    }
}

// Función para abrir directamente el expediente desde una alerta
window.gestionarAlertaRapida = function(idAlerta, tagEquipo) {
    if (!datosGlobalesActivos) {
        alert("El catastro aún está cargando, intenta en un segundo.");
        return;
    }

    // 1. Buscamos el ID interno de Firebase usando el TAG que viene de la alerta
    let idActivoEncontrado = null;
    const keysActivos = Object.keys(datosGlobalesActivos);
    
    for (let i = 0; i < keysActivos.length; i++) {
        const activo = datosGlobalesActivos[keysActivos[i]];
        if (activo.nombre && activo.nombre.toUpperCase() === tagEquipo.toUpperCase()) {
            idActivoEncontrado = keysActivos[i];
            break;
        }
    }

    // 2. Si lo encuentra, abrimos el modal y saltamos a la pestaña de terreno
    if (idActivoEncontrado) {
        abrirModalEvidencia(idActivoEncontrado); // Abre el modal gigante
        verTerreno(); // Pasa automáticamente a la pestaña de "Reportes de Terreno"
        
        // (Opcional) Cambia el estado de la alerta a "En revisión" en Firebase
        // db.ref('alertas_terreno/' + idAlerta).update({ estado: 'en_revision' });
    } else {
        alert(`❌ No se encontró el equipo "${tagEquipo}" en el catastro actual. Es posible que haya sido eliminado o renombrado.`);
    }
};