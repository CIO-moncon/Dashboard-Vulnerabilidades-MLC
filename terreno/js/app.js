// =========================================================================
// MÓDULO PWA CIO: NÚCLEO OPERATIVO BLINDADO
// =========================================================================

// 1. INICIALIZACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc",
    storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
    messagingSenderId: "1043912631590",
    appId: "1:1043912631590:web:14638fc1503882f1268de7"
};

try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Error al iniciar Firebase:", e);
}

const db = firebase.database();
const activosRef = db.ref('activos_criticos'); 
const dbAlertas = db.ref('alertas_terreno');

// 2. VARIABLES GLOBALES
let catalogoGlobal = [];
let arregloEvidencias = []; 
let chipsSeleccionados = [];
const CACHE_CATASTRO_KEY = 'cio_cached_catastro';
let mapaPWA = null;

// =========================================================================
// MÓDULO 1: LA BÓVEDA OFFLINE (BLINDADA)
// =========================================================================
const DB_NAME = 'CIO_BovedaOffline';
const STORE_NAME = 'reportes_pendientes';
let dbLocal = null;

function inicializarBoveda() {
    try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id_local' });
            }
        };
        request.onsuccess = function(e) {
            dbLocal = e.target.result;
            actualizarContadorOffline();
            sincronizarBovedaOffline();
        };
        request.onerror = function(e) {
            console.warn("Bóveda Offline bloqueada (Normal si usas file://).");
        };
    } catch (error) {
        console.error("El navegador bloqueó IndexedDB.", error);
    }
}
inicializarBoveda();

function guardarEnBoveda(payload) {
    if (!dbLocal) return;
    payload.id_local = Date.now().toString();
    const tx = dbLocal.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(payload);
    tx.oncomplete = () => {
        mostrarNotificacion("📴 Guardado en bóveda offline.");
        actualizarContadorOffline();
    };
}

function sincronizarBovedaOffline() {
    if (!navigator.onLine || !dbLocal) return;
    const tx = dbLocal.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = function() {
        const reportes = request.result;
        if (reportes.length === 0) return;

        mostrarNotificacion(`🟢 Sincronizando ${reportes.length} reportes...`);
        reportes.forEach(reporte => {
            const idTemp = reporte.id_local;
            delete reporte.id_local;
            dbAlertas.push(reporte).then(() => {
                const deleteTx = dbLocal.transaction(STORE_NAME, 'readwrite');
                deleteTx.objectStore(STORE_NAME).delete(idTemp);
                deleteTx.oncomplete = () => actualizarContadorOffline();
            });
        });
    };
}

function actualizarContadorOffline() {
    if (!dbLocal) return;
    const tx = dbLocal.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = function() {
        const count = request.result;
        const contadorDiv = document.getElementById('contadorOffline');
        if (contadorDiv) contadorDiv.innerText = count;
        if(count > 0 && navigator.onLine) sincronizarBovedaOffline();
    };
}

window.addEventListener('online', () => {
    const badge = document.getElementById('badgeConexion');
    if (badge) { badge.innerText = '🟢 ONLINE'; badge.className = 'badge-status online'; }
    sincronizarBovedaOffline();
});
window.addEventListener('offline', () => {
    const badge = document.getElementById('badgeConexion');
    if (badge) { badge.innerText = '🔴 OFFLINE'; badge.className = 'badge-status offline'; }
});

// =========================================================================
// MÓDULO 2: INTERFAZ Y NAVEGACIÓN
// =========================================================================
window.cambiarVistaPWA = function(vista) {
    document.getElementById('vista-reporte').style.display = vista === 'reporte' ? 'block' : 'none';
    document.getElementById('vista-mapa').style.display = vista === 'mapa' ? 'flex' : 'none';
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-btn-' + vista).classList.add('active');

    // Inicializar mapa solo la primera vez que se abre la pestaña
    if (vista === 'mapa' && !mapaPWA) {
        setTimeout(() => { inicializarMapaPWA(); }, 200);
    }
}

window.avanzarPaso = function(numPaso) {
    document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
    const siguientePaso = document.getElementById(`step-${numPaso}`);
    if (siguientePaso) {
        siguientePaso.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function mostrarNotificacion(msg) {
    const t = document.getElementById('toastNotificacion');
    if (t) {
        t.innerText = msg; 
        t.style.display = 'block';
        setTimeout(() => { t.style.display = 'none'; }, 4000);
    }
}

// =========================================================================
// MÓDULO 3: CARGA DE EQUIPOS Y ÁREAS
// =========================================================================
function cargarDeCacheLocalInmediato() {
    const cached = localStorage.getItem(CACHE_CATASTRO_KEY);
    if (cached) {
        try {
            catalogoGlobal = JSON.parse(cached);
            cargarAreasPorFaena();
        } catch(e) {}
    }
}
cargarDeCacheLocalInmediato();

activosRef.on('value', snap => {
    const raw = snap.val();
    if (raw) {
        catalogoGlobal = Object.keys(raw).map(k => {
            const data = raw[k] || {};
            return {
                id: k,
                tag: String(data.tag || data.Tag || data.TAG || data.nombre || 'SIN-TAG').trim(),
                area: String(data.area || data.Area || 'Área General').trim(),
                siteId: String(data.siteId || data.faena || data.Faena || 'Planta, Mina los Colorados').trim(),
                lat: data.latitud || null,
                lng: data.longitud || null,
                sev: data.severidad || 'Verde'
            };
        });
        localStorage.setItem(CACHE_CATASTRO_KEY, JSON.stringify(catalogoGlobal));
        cargarAreasPorFaena(); 
    }
});

window.cargarAreasPorFaena = function() {
    const faenaVal = document.getElementById('fieldFaena').value;
    const filtered = catalogoGlobal.filter(e => e.siteId === faenaVal);
    
    // Obtener áreas únicas
    const areasUnicas = [...new Set(filtered.map(e => e.area))].filter(Boolean).sort();
    
    const selectArea = document.getElementById('fieldArea');
    if (selectArea) {
        selectArea.innerHTML = '<option value="">-- Selecciona el Área --</option>' + 
                               areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
    }
    
    const selectEquipo = document.getElementById('fieldTagSelect');
    if (selectEquipo) selectEquipo.innerHTML = '<option value="">-- Selecciona el equipo --</option>';
}

window.cargarEquiposPorArea = function() {
    const faenaVal = document.getElementById('fieldFaena').value;
    const areaVal = document.getElementById('fieldArea').value;
    const filtered = catalogoGlobal.filter(e => e.siteId === faenaVal && e.area === areaVal);
    
    const selectEquipo = document.getElementById('fieldTagSelect');
    if (selectEquipo) {
        selectEquipo.innerHTML = '<option value="">-- Selecciona el equipo --</option>' + 
                                 filtered.map(e => `<option value="${e.tag}">${e.tag}</option>`).join('');
    }
}

// Prevenir error si HTML llama a esta función
window.syncTagInputFromSelect = function() {
    // Ya no usamos input libre, pero mantenemos la función para evitar error de referencia
}

// =========================================================================
// MÓDULO 4: HALLAZGOS Y DICTADO POR VOZ
// =========================================================================
const diccionarioFallas = {
    'General': ['💧 Fuga detectada', '🔊 Ruido anormal', '⚠️ Alta vibración', '🔥 Alta temperatura'],
    'Motor': ['📻 Ruido rodamiento M', '🔥 Motor sobrecalentado', '⚙️ Fuga de grasa', '🔌 Problema eléctrico/caja', '🦵 Pata coja/soltura'],
    'Reductor': ['🛢️ Fuga de aceite', '📻 Ruido de engranajes', '🌡️ Temperatura elevada', '📉 Nivel bajo aceite'],
    'Polea_Correa': ['⛓️ Correa cortada/dañada', '📐 Desalineamiento visible', '⚙️ Polea desgastada', '💨 Correa patinando'],
    'Estructura': ['🔩 Pernos cortados/sueltos', '🛑 Polín trabado', '⚡ Fisura estructural visible', '🛡️ Falta protección']
};

window.cargarHallazgosDinamicos = function() {
    const comp = document.getElementById('fieldComponente').value;
    const fallas = diccionarioFallas[comp] || diccionarioFallas['General'];
    const contenedor = document.getElementById('contenedor-chips-dinamicos');
    
    if (contenedor) {
        contenedor.innerHTML = '';
        chipsSeleccionados = [];
        fallas.forEach(falla => {
            contenedor.innerHTML += `<div class="chip" onclick="toggleChip(this, '${falla}')">${falla}</div>`;
        });
    }
}

window.toggleChip = function(chipEl, text) {
    if (chipEl.classList.contains('active')) {
        chipEl.classList.remove('active');
        chipsSeleccionados = chipsSeleccionados.filter(c => c !== text);
    } else {
        chipEl.classList.add('active');
        chipsSeleccionados.push(text);
    }
}

window.iniciarDictado = function() {
    try {
        const btn = document.getElementById('btn-dictado');
        const cajaTexto = document.getElementById('fieldDetalle');
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Tu navegador no soporta dictado por voz. Usa el teclado.");
            return;
        }

        const rec = new SpeechRecognition();
        rec.lang = 'es-CL';
        rec.continuous = false;
        rec.interimResults = false;

        rec.onstart = () => {
            btn.style.background = '#ef4444';
            btn.innerHTML = '<span class="material-symbols-outlined" style="animation: pulse 1s infinite;">mic</span>';
            mostrarNotificacion("🎙️ Escuchando...");
        };

        rec.onresult = (e) => {
            const textoHablado = e.results[0][0].transcript;
            const textoPrevio = cajaTexto.value;
            cajaTexto.value = (textoPrevio + (textoPrevio ? " " : "") + textoHablado).trim();
        };

        rec.onend = () => {
            btn.style.background = '#3b82f6';
            btn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
        };

        rec.start();
    } catch (e) {
        alert("Error al iniciar micrófono. Revisa los permisos.");
    }
}

// =========================================================================
// MÓDULO 5: COMPRESIÓN MULTIMEDIA EXTREMA
// =========================================================================
window.procesarYComprimirMedia = async function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            await procesarImagen(file);
        } else if (file.type.startsWith('video/')) {
            const sizeMB = file.size / (1024 * 1024);
            if(sizeMB > 8) {
                alert(`⚠️ Video muy pesado (${sizeMB.toFixed(1)}MB). Máximo 8MB.`);
                continue;
            }
            await procesarVideo(file);
        }
    }
    renderizarGaleria();
}

function procesarImagen(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                try {
                    const canvas = document.getElementById('resizeCanvas');
                    const ctx = canvas.getContext('2d');
                    
                    const MAX_WIDTH = 640; 
                    let width = img.width, height = img.height;
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const fotoComprimida = canvas.toDataURL('image/jpeg', 0.5);
                    arregloEvidencias.push({ tipo: 'imagen', data: fotoComprimida });
                } catch(err) {
                    console.error("Error comprimiendo imagen", err);
                }
                resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function procesarVideo(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            arregloEvidencias.push({ tipo: 'video', data: e.target.result });
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

window.eliminarEvidenciaPWA = function(index) {
    arregloEvidencias.splice(index, 1);
    renderizarGaleria();
}

function renderizarGaleria() {
    const gallery = document.getElementById('mediaGallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';
    arregloEvidencias.forEach((ev, index) => {
        let contenido = ev.tipo === 'imagen' ? `<img src="${ev.data}" style="border-radius:8px; height:80px;">` : `<div style="font-size:2rem;">🎥</div>`;
        gallery.innerHTML += `<div style="position:relative; display:inline-block; margin:5px;">
            ${contenido}
            <button type="button" onclick="eliminarEvidenciaPWA(${index})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; font-weight:bold; cursor:pointer; z-index:10;">X</button>
        </div>`;
    });
}

// =========================================================================
// MÓDULO 6: ENVIAR DATOS
// =========================================================================
window.selectSevFat = function(sev) {
    document.getElementById('fieldSev').value = sev;
    ['Verde', 'Amarillo', 'Naranja', 'Rojo'].forEach(s => {
        const btn = document.getElementById('sev_' + s);
        if (btn) btn.className = 'sev-fat-btn' + (s === sev ? ` sel-${sev.toLowerCase()}` : '');
    });
}

window.enviarAlertaSegura = function() {
    const tagSelect = document.getElementById('fieldTagSelect').value;
    if (!tagSelect) { alert("⚠️ Debes seleccionar un equipo en el Paso 1."); avanzarPaso(1); return; }

    const comp = document.getElementById('fieldComponente').value;
    const sev = document.getElementById('fieldSev').value;
    const notasManuales = document.getElementById('fieldDetalle').value.trim();

    let textoFinal = `[COMPONENTE: ${comp}]\n`;
    if (chipsSeleccionados.length > 0) textoFinal += "📌 " + chipsSeleccionados.join(" | ") + "\n";
    if (notasManuales !== "") textoFinal += "📝 " + notasManuales;

    const payload = {
        faena: document.getElementById('fieldFaena').value,
        area: document.getElementById('fieldArea').value,
        tag: tagSelect,
        severidad: sev,
        detalle: textoFinal,
        evidencias: arregloEvidencias,
        timestamp: new Date().toISOString(),
        estado: 'nuevo'
    };

    if (navigator.onLine) {
        dbAlertas.push(payload).then(() => {
            mostrarNotificacion("✅ Reporte enviado al CIO.");
            limpiarTrasEnvio();
        }).catch(() => {
            guardarEnBoveda(payload);
            limpiarTrasEnvio();
        });
    } else {
        guardarEnBoveda(payload);
        limpiarTrasEnvio();
    }
}

function limpiarTrasEnvio() {
    document.getElementById('fieldDetalle').value = '';
    chipsSeleccionados = [];
    arregloEvidencias = [];
    renderizarGaleria();
    cargarHallazgosDinamicos(); 
    avanzarPaso(1); 
}

window.forzarSincronizacionOffline = function() {
    sincronizarBovedaOffline();
}

// =========================================================================
// MÓDULO 7: MAPA GPS
// =========================================================================
window.inicializarMapaPWA = function() {
    try {
        const divMapa = document.getElementById('mapa-gps-pwa');
        if (!divMapa || typeof L === 'undefined') return;

        mapaPWA = L.map('mapa-gps-pwa').setView([-28.298, -70.785], 14);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,          // Cuánto puede acercarse el usuario con el mouse/dedos
    maxNativeZoom: 17     // El límite de fotos reales. ¡Pasado esto, Leaflet estira la imagen!
}).addTo(mapaPWA);    // (O .addTo(mapaPWA) en el caso del celular)

        setTimeout(() => { 
            mapaPWA.invalidateSize(); 
            centrarEnMiUbicacion(); 
        }, 500);
    } catch(e) {
        console.error("Error al cargar el mapa de Leaflet", e);
    }
}

window.centrarEnMiUbicacion = function() {
    if (!mapaPWA) return;
    mapaPWA.locate({setView: true, maxZoom: 17});
    
    mapaPWA.on('locationfound', function(e) {
        if (window.marcadorGPS_PWA) mapaPWA.removeLayer(window.marcadorGPS_PWA);
        
        const iconoGPS = L.divIcon({
            className: 'gps-pin',
            html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #3b82f6; animation: pulse 1s infinite;"></div>`,
            iconSize: [16, 16]
        });
        window.marcadorGPS_PWA = L.marker(e.latlng, {icon: iconoGPS}).addTo(mapaPWA);
        mostrarNotificacion("📍 Ubicación GPS encontrada.");
    });
}

window.buscarEnMapaPWA = function(e) {
    if (e.key !== 'Enter' || !mapaPWA) return;
    
    const busqueda = e.target.value.toLowerCase().trim();
    const equipo = catalogoGlobal.find(eq => eq.tag.toLowerCase().includes(busqueda));

    if (equipo && equipo.lat && equipo.lng) {
        mapaPWA.flyTo([equipo.lat, equipo.lng], 18, { animate: true, duration: 1.5 });
        
        let colorPin = equipo.sev === 'Rojo' ? '#ef4444' : equipo.sev === 'Naranja' ? '#f97316' : '#22c55e';
        const iconEquipo = L.divIcon({
            className: 'eq-pin',
            html: `<div style="background-color: ${colorPin}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${colorPin};"></div>`,
            iconSize: [14, 14]
        });
        
        L.marker([equipo.lat, equipo.lng], {icon: iconEquipo}).addTo(mapaPWA)
         .bindPopup(`<strong style="color:black;">${equipo.tag}</strong><br><button onclick="cambiarVistaPWA('reporte')" style="margin-top:5px; background:#3b82f6; color:white; border:none; padding:5px; border-radius:4px; width:100%;">Reportar Aquí</button>`).openPopup();
    } else {
        alert("Equipo no encontrado o sin georreferencia en el mapa.");
    }
}


        window.reportarDesdeMapa = function(tag, area, faena) {
            // 1. Cambiamos a la vista de reporte y aseguramos estar en el Paso 1
            cambiarVistaPWA('reporte');
            avanzarPaso(1);

            // 2. Setear la Faena y disparar manualmente la carga de sus áreas
            const selectFaena = document.getElementById('fieldFaena');
            if (selectFaena) {
                selectFaena.value = faena;
                cargarAreasPorFaena(); 
            }

            // 3. Setear el Área y disparar manualmente la carga de sus equipos
            const selectArea = document.getElementById('fieldArea');
            if (selectArea) {
                selectArea.value = area;
                cargarEquiposPorArea(); 
            }

            // 4. Finalmente, dejar el Equipo seleccionado
            const selectTag = document.getElementById('fieldTagSelect');
            if (selectTag) {
                selectTag.value = tag;
            }
            
            mostrarNotificacion("📍 Equipo pre-cargado desde el mapa.");
        };