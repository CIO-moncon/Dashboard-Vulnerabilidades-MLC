// ==========================================
// MÓDULO PRINCIPAL: APP.JS (CON MAPA SATELITAL REAL LEAFLET)
// ==========================================
import { auth, db } from './core/firebase-config.js';
import { inicializarBarraLateral } from './ui/sidebar.js'; 
import { renderizarExpediente } from './ui/expediente.js';

let datosGlobalesEquipos = {}; 
let mapaActivo = null; // Variable global para guardar la instancia del mapa

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
            // Si el mapa ya está dibujado, solo actualizamos los pines, si no, dibujamos todo.
            if (espacioDinámico && (!espacioDinámico.innerHTML.includes('mapa-satelital') || espacioDinámico.innerHTML.includes('Seleccione un Activo'))) {
                renderizarMapaPlanta();
            } else if (mapaActivo) {
                // Función para refrescar solo los pines si cambia el estado en Firebase
                dibujarPinesEnMapa();
            }
        }
    });

    // Delegación de Eventos (Convertido a async para soportar UI.confirmar)
    document.addEventListener('click', async (e) => {
        // Clic en un equipo del menú lateral o del globo del mapa
        const btnEquipo = e.target.closest('.item-navegable');
        if (btnEquipo) {
            // 🚀 Desactivar completamente el modo Kiosko al abrir un expediente
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

            // Si el clic viene del menú lateral, lo marcamos
            if (btnEquipo.closest('.sidebar-principal')) {
                btnEquipo.style.border = '1px solid var(--primary-blue)';
            }

            // Destruimos la instancia del mapa para liberar memoria antes de abrir el expediente
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
            // Limpiamos el mapa miniatura del expediente si existe
            if (window.miniMapaInstancia) { window.miniMapaInstancia.remove(); window.miniMapaInstancia = null; }
            
            // Volvemos a renderizar el mapa principal
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
    });
}

// ---------------------------------------------------------
// MÓDULO NUEVO: MAPA SATELITAL (LEAFLET + ESRI)
// ---------------------------------------------------------
let capaMarcadores = null; // Para borrar los pines viejos al actualizar

function renderizarMapaPlanta() {
    const contenedor = document.getElementById('espacio-trabajo-dinamico');
    if (!contenedor) return;

    // 1. Estructura HTML del visor del mapa
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
            
            <!-- Contenedor donde Leaflet dibujará el mapa -->
            <div id="mapa-satelital" style="flex-grow: 1; min-height: 500px; border-radius: 12px; border: 1px solid var(--border-glass); overflow: hidden; z-index: 1;"></div>
        </div>
    `;

    // 2. Inicializar Leaflet centrado en la faena con restricciones de zoom
    mapaActivo = L.map('mapa-satelital', {
        minZoom: 14, // No permite alejarse demasiado
        maxZoom: 17  // Evita el error "Map data not yet available"
    }).setView([-28.290846, -70.813030], 15);

    // 🚀 Hacerla global explícitamente para que el modo kiosko la detecte siempre
    window.mapaActivo = mapaActivo;

    // 3. Añadir la capa de imagen satelital de Esri
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 17 // Debe coincidir con el límite del mapa superior
    }).addTo(mapaActivo);

    // Inicializamos la capa donde irán los pines
    capaMarcadores = L.layerGroup().addTo(mapaActivo);

    // 4. Dibujar los pines de los equipos
    dibujarPinesEnMapa();
}

function dibujarPinesEnMapa() {
    if (!mapaActivo || !capaMarcadores) return;
    
    // Limpiamos los pines viejos
    capaMarcadores.clearLayers();

    Object.values(datosGlobalesEquipos).forEach(eq => {
        // Solo dibujamos los equipos que tengan coordenadas configuradas
        if (eq.latitud && eq.longitud) {
            
            // Determinar color según severidad
            const sev = (eq.severidad || eq.estado || 'verde').toLowerCase();
            let colorHex = '#10b981'; // Verde
            if (sev === 'rojo' || sev === 'critico') colorHex = '#ef4444';
            else if (sev === 'naranja') colorHex = '#f97316';
            else if (sev === 'amarillo') colorHex = '#eab308';

            // Crear un Pin (Marcador) personalizado dibujado con HTML/CSS
            const iconoPersonalizado = L.divIcon({
                className: 'custom-pin',
                html: `
                    <div style="background-color: ${colorHex}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.8); position: relative; ${sev === 'rojo' ? 'animation: pulse 1.5s infinite;' : ''}">
                        <div style="position: absolute; bottom: -10px; left: 5px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 10px solid ${colorHex};"></div>
                    </div>
                `,
                iconSize: [20, 30],
                iconAnchor: [10, 30] // Punto de anclaje (la punta del triángulo abajo)
            });

            const marcador = L.marker([parseFloat(eq.latitud), parseFloat(eq.longitud)], { icon: iconoPersonalizado });

            // Globo de información (Popup) al hacer clic en el pin
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

// --- MODO KIOSKO (PANTALLA DE CONTROL) ---
document.addEventListener('click', (e) => {
    const btnKiosko = e.target.closest('#kiosko') || e.target.closest('.btn-kiosko') || e.target.closest('#btn-salir-kiosko-flotante');
    if (!btnKiosko) return;

    // Conmutamos la clase en el body
    const esKioskoActivo = document.body.classList.toggle('modo-kiosko-activo');
    
    // Buscamos los elementos de navegación de la interfaz
    const sidebar = document.querySelector('aside') || document.querySelector('.sidebar-principal');
    const topbar = document.querySelector('header') || document.querySelector('.topbar');
    
    // Manejar botón flotante de salida para modo Kiosko
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

        // Si estábamos viendo un expediente y salimos de Kiosko, devolvemos la vista al mapa general
        const espacioDinámico = document.getElementById('espacio-trabajo-dinamico');
        if (espacioDinámico && espacioDinámico.innerHTML.includes('Inspección CBM')) {
            renderizarMapaPlanta();
            return;
        }
    }
    
    // Forzar redibujado del mapa activo
    setTimeout(() => {
        if (window.mapaActivo) {
            window.mapaActivo.invalidateSize();
        }
    }, 150);

    setTimeout(() => {
        if (window.mapaActivo) {
            window.mapaActivo.invalidateSize();
        }
    }, 400);
});

// --- MODAL PROFESIONAL DE CREACIÓN DE USUARIOS ---
document.addEventListener('click', (e) => {
    const btnCrearUsr = e.target.closest('#btn-crear-usuario') || e.target.closest('.btn-crear-usuario');
    if (!btnCrearUsr) return;

    // Si ya existe un modal previo, lo removemos
    const modalAnterior = document.getElementById('modal-crear-usuario');
    if (modalAnterior) modalAnterior.remove();

    // Crear el contenedor del Modal
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

    // Evento Cerrar Modal
    document.getElementById('cerrar-modal-usr').addEventListener('click', () => {
        document.getElementById('modal-crear-usuario').remove();
    });

    // Evento Enviar Formulario REFACTORIZADO
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
            // 1. Crear credencial en Firebase Auth
            const credUser = await auth.createUserWithEmailAndPassword(email, pass);
            const uid = credUser.user.uid;

            // 2. Guardar metadatos extendidos en la Realtime Database
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

// Manejo y validación del formulario de mediciones de terreno
const formMediciones = document.getElementById('form-mediciones-cbm');
const alertaValidacion = document.getElementById('alerta-validacion');

if (formMediciones) {
    formMediciones.addEventListener('submit', function(evento) {
        evento.preventDefault(); // Evita que la página se recargue

        // Recopilar valores de los inputs
        const velRMS = parseFloat(document.getElementById('vib-vel').value);
        const peakVue = parseFloat(document.getElementById('vib-peakvue').value);
        const tempMax = parseFloat(document.getElementById('termo-temp').value);
        
        let errores = [];
        let advertencias = [];

        // 1. Validaciones Críticas (Bloquean el guardado)
        if (velRMS < 0 || isNaN(velRMS)) {
            errores.push("La velocidad RMS debe ser un valor numérico positivo.");
        }
        if (tempMax < -50 || isNaN(tempMax)) {
            errores.push("La temperatura ingresada está fuera del rango del sensor.");
        }

        // 2. Evaluaciones de Severidad (No bloquean, pero levantan advertencia visual)
        // Usando como referencia límites de peligro comunes para equipos rígidos
        if (velRMS >= 7.1) {
            advertencias.push("Alerta: Velocidad RMS en umbral de PELIGRO. Se notificará a planificación.");
        }

        // Procesar Errores
        if (errores.length > 0) {
            mostrarAlerta(errores.join('<br>'), 'error');
            return; // Aborta el proceso de guardado
        }

        // Si hay advertencias pero no errores, se guarda igual pero informando al inspector
        if (advertencias.length > 0) {
            mostrarAlerta(advertencias.join('<br>'), 'advertencia');
        } else {
            mostrarAlerta("Mediciones validadas correctamente. Guardando...", 'exito');
        }

        // Empaquetar datos para Firebase
        const payloadMediciones = {
            fecha: new Date().toISOString(),
            vibraciones: {
                velocidad_rms: velRMS,
                peakvue: isNaN(peakVue) ? null : peakVue
            },
            termografia: {
                temp_max: tempMax
            },
            // Aquí agregas el ID del usuario activo de Firebase Auth y el ID del equipo
            registrado_por: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'Desconocido'
        };

        // TODO: Llamar a la función que sube 'payloadMediciones' a Firebase
        // guardarEnFirebase(equipoActualId, payloadMediciones);
    });
}

// Función auxiliar para manejar las alertas visuales en el UI
function mostrarAlerta(mensaje, tipo) {
    alertaValidacion.innerHTML = mensaje;
    // Resetea las clases y aplica el estilo oscuro correspondiente según el tipo
    alertaValidacion.className = `alerta-mensaje alerta-${tipo} visible`;
    
    // Opcional: Ocultar alertas de éxito automáticamente después de 3 segundos
    if(tipo === 'exito') {
        setTimeout(() => {
            alertaValidacion.className = 'oculto';
        }, 3000);
    }
}

// Función para enviar las mediciones a Firebase Realtime Database
function guardarEnFirebase(equipoId, payloadMediciones) {
    // Referencia a la ruta del historial del equipo específico
    // Ajusta 'activos_criticos' según el nodo exacto que uses en tu base de datos
    const nodoMediciones = firebase.database().ref(`activos_criticos/${equipoId}/historial_mediciones`);

    // push() genera un ID único (timestamp) para cada nueva lectura de ruta
    nodoMediciones.push(payloadMediciones)
        .then(() => {
            // Éxito: Mostrar mensaje y limpiar el formulario para la siguiente inspección
            mostrarAlerta("Mediciones guardadas exitosamente en la nube.", 'exito');
            document.getElementById('form-mediciones-cbm').reset();
            
            // Opcional: Aquí podrías llamar a una función que actualice el gráfico de tendencias
            // actualizarGraficosTendencia(equipoId);
        })
        .catch((error) => {
            // Error de red o permisos
            console.error("Error al registrar en Firebase:", error);
            mostrarAlerta("Fallo al guardar. Verifica la conexión a la red.", 'error');
        });
}
