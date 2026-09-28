// ==========================================
// 1. INICIALIZACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc",
    storageBucket: "dashboard-vulnerabilidades-mlc.firebasestorage.app",
    messagingSenderId: "1043912631590",
    appId: "1:1043912631590:web:14638fc1503882f1268de7",
    measurementId: "G-MBLS9ZNJJL"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const activosRef = db.ref('activos_criticos'); 
const dbAlertas = db.ref('alertas_terreno');

// ==========================================
// 2. VARIABLES GLOBALES
// ==========================================
let catalogoGlobal = [];
let arregloEvidencias = []; 
let chipsSeleccionados = [];
const QUEUE_KEY = 'cio_offline_alertas_queue';
const CACHE_CATASTRO_KEY = 'cio_cached_catastro';

// ==========================================
// 3. MONITOR DE CONEXIÓN
// ==========================================
const indicadorRed = document.getElementById('badgeOfflineCount');

function actualizarEstadoConexion(online) {
    let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    let msjCola = queue.length > 0 ? ` | 📴 Cola: ${queue.length}` : '';

    if (online) {
        indicadorRed.innerHTML = '🟢 ONLINE' + msjCola;
        indicadorRed.style.color = '#4ade80'; 
        indicadorRed.style.borderColor = 'rgba(74,197,94,0.4)';
        indicadorRed.style.background = 'rgba(34,197,94,0.2)';
        sincronizarColaOffline();
    } else {
        indicadorRed.innerHTML = '🔴 OFFLINE' + msjCola;
        indicadorRed.style.color = '#ef4444'; 
        indicadorRed.style.borderColor = '#ef4444';
        indicadorRed.style.background = 'rgba(239, 68, 68, 0.2)';
    }
}

window.addEventListener('online', () => actualizarEstadoConexion(true));
window.addEventListener('offline', () => actualizarEstadoConexion(false));

const connectedRef = firebase.database().ref(".info/connected");
connectedRef.on("value", (snap) => {
    actualizarEstadoConexion(snap.val() === true);
});

// ==========================================
// 4. DESCARGA Y CACHÉ DEL CATASTRO
// ==========================================
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
                tag: String(data.tag || data.Tag || data.TAG || data.equipo || data.Equipo || data.nombre || k || 'SIN-TAG').trim(),
                tipo: String(data.tipo || data.Tipo || 'Activo').trim(),
                area: String(data.area || data.Area || 'Área General').trim(),
                siteId: String(data.siteId || data.site || data.faena || 'Planta, Mina los Colorados').trim()
            };
        });
        localStorage.setItem(CACHE_CATASTRO_KEY, JSON.stringify(catalogoGlobal));
        cargarAreasPorFaena(); 
    }
});

window.cargarAreasPorFaena = function() {
    const faenaVal = document.getElementById('fieldFaena').value;
    const areaSelect = document.getElementById('fieldArea');
    const filtered = catalogoGlobal.filter(e => e.siteId === faenaVal);
    const areasUnicas = [...new Set(filtered.map(e => e.area))].filter(Boolean).sort();
    
    areaSelect.innerHTML = '<option value="">-- Selecciona el Área --</option>' + areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
    document.getElementById('fieldTagSelect').innerHTML = '<option value="">-- Selecciona el equipo --</option>';
}

window.cargarEquiposPorArea = function() {
    const faenaVal = document.getElementById('fieldFaena').value;
    const areaVal = document.getElementById('fieldArea').value;
    const tagSelect = document.getElementById('fieldTagSelect');
    const filtered = catalogoGlobal.filter(e => e.siteId === faenaVal && e.area === areaVal);
    
    tagSelect.innerHTML = '<option value="">-- Selecciona el equipo --</option>' + filtered.map(e => `<option value="${e.tag}">${e.tag} (${e.tipo})</option>`).join('');
}

window.syncTagInputFromSelect = function() {
    const val = document.getElementById('fieldTagSelect').value;
    if (val) document.getElementById('fieldTagCustom').value = val;
}

// ==========================================
// 5. LÓGICA DE TEXTO INTELIGENTE (BOTONES)
// ==========================================
window.toggleChip = function(chipEl, text) {
    // Solo enciende o apaga el botón (ya no mancha la caja de texto)
    if (chipEl.classList.contains('active')) {
        chipEl.classList.remove('active');
        chipsSeleccionados = chipsSeleccionados.filter(c => c !== text);
    } else {
        chipEl.classList.add('active');
        chipsSeleccionados.push(text);
    }
};

// ==========================================
// 6. LÓGICA MULTIMEDIA Y COMPRESIÓN
// ==========================================
async function handleMultiFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sizeMB = file.size / (1024 * 1024);
        
        // Aumentamos el límite de video a 8MB para darles margen a los técnicos
        const limiteMB = file.type.startsWith('video/') ? 8 : 15; 

        if (sizeMB > limiteMB) {
            if (file.type.startsWith('video/')) {
                alert(`⚠️ El video pesa ${sizeMB.toFixed(1)}MB (Máx 8MB por seguridad Firebase). Graba solo 3 a 5 segundos.`);
            } else {
                alert(`⚠️ La foto es demasiado pesada (${sizeMB.toFixed(1)}MB).`);
            }
            continue;
        }

        if (file.type.startsWith('image/')) {
            await procesarImagen(file);
        } else if (file.type.startsWith('video/')) {
            await procesarVideo(file);
        }
    }
    renderizarGaleria();
    
    // Limpiamos los inputs para que puedan seguir sacando más fotos
    document.getElementById('inputCamaraFoto').value = ''; 
    document.getElementById('inputCamaraVideo').value = ''; 
    document.getElementById('inputGaleria').value = ''; 
}

function procesarImagen(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.getElementById('resizeCanvas');
                const ctx = canvas.getContext('2d');
                
                // Algoritmo de Reducción Proporcional
                const MAX_WIDTH = 800; // Buena calidad para web, bajo peso
                let width = img.width, height = img.height;
                
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Comprime la imagen en JPEG al 60% de calidad
                const fotoComprimida = canvas.toDataURL('image/jpeg', 0.6);
                
                arregloEvidencias.push({ tipo: 'imagen', data: fotoComprimida });
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

function renderizarGaleria() {
    const gallery = document.getElementById('mediaGallery');
    gallery.innerHTML = '';
    
    arregloEvidencias.forEach((ev, index) => {
        let contenido = ev.tipo === 'imagen' ? `<img src="${ev.data}">` : `<div class="video-icon">🎥</div>`;
        gallery.innerHTML += `
            <div class="media-thumb-container">
                ${contenido}
                <button class="btn-remove-media" onclick="eliminarEvidencia(${index})">X</button>
            </div>
        `;
    });
}

window.eliminarEvidencia = function(index) {
    arregloEvidencias.splice(index, 1);
    renderizarGaleria();
};

// ==========================================
// 7. LÓGICA DE FORMULARIO BASE Y ENVÍO
// ==========================================
window.selectSev = function(sev) {
    document.getElementById('fieldSev').value = sev;
    ['Rojo', 'Naranja', 'Amarillo'].forEach(s => {
        document.getElementById('sev_' + s).className = 'sev-btn' + (s === sev ? ` sel-${sev.toLowerCase()}` : '');
    });
}

function mostrarToast(msg) {
    const t = document.getElementById('toastConfirm');
    t.innerText = msg; t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function guardarEnColaLocal(payload) {
    let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    queue.push(payload);
    
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        actualizarEstadoConexion(navigator.onLine);
    } catch (e) {
        alert("⚠️ ALERTA DE MEMORIA: Tienes demasiados reportes multimedia en espera. Sincroniza pronto.");
        queue.pop(); 
    }
}

function sincronizarColaOffline() {
    if (!navigator.onLine || !dbAlertas) return;
    let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    const item = queue.shift();
    dbAlertas.push(item).then(() => {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        actualizarEstadoConexion(true); 
        if (queue.length > 0) sincronizarColaOffline();
    }).catch(() => {
        queue.unshift(item);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    });
}

window.enviarReporteCampo = function() {
    const faena = document.getElementById('fieldFaena').value;
    const area = document.getElementById('fieldArea').value || 'Área General';
    const tagFinal = (document.getElementById('fieldTagCustom').value || document.getElementById('fieldTagSelect').value || '').trim().toUpperCase();
    const notasManuales = document.getElementById('fieldDetalle').value.trim();
    const sev = document.getElementById('fieldSev').value;

    if (!tagFinal) { alert("⚠️ Selecciona o escribe el Tag del equipo."); return; }

    // ARMADO INTELIGENTE DEL TEXTO (Viñetas humanas)
    let textoFinal = "";
    
    if (chipsSeleccionados.length > 0) {
        textoFinal += "📌 HALLAZGOS:\n" + chipsSeleccionados.map(c => "• " + c).join("\n") + "\n\n";
    }
    if (notasManuales !== "") {
        textoFinal += "📝 NOTAS ADICIONALES:\n" + notasManuales;
    }
    
    if (textoFinal === "") {
        textoFinal = "Reporte preventivo de rutina sin anomalías detectadas.";
    }

    const payload = {
        faena: faena,
        area: area,
        tag: tagFinal,
        severidad: sev,
        detalle: textoFinal,
        evidencias: arregloEvidencias,
        timestamp: new Date().toISOString(),
        estado: 'nuevo'
    };

    if (navigator.onLine && dbAlertas) {
        dbAlertas.push(payload).then(() => {
            mostrarToast(`📡 Alerta transmitida para ${tagFinal}`);
            limpiarFormularioTerreno();
        }).catch(() => {
            guardarEnColaLocal(payload); mostrarToast(`📴 Guardado offline.`); limpiarFormularioTerreno();
        });
    } else {
        guardarEnColaLocal(payload); mostrarToast(`📴 Sin red: Guardado offline.`); limpiarFormularioTerreno();
    }
}

function limpiarFormularioTerreno() {
    document.getElementById('fieldDetalle').value = '';
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    
    chipsSeleccionados = [];
    arregloEvidencias = [];
    renderizarGaleria();
    
    actualizarEstadoConexion(navigator.onLine);
}