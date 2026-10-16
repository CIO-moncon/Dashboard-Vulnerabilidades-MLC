// ==========================================
// MÓDULO UI TERRENO: WIZARD, FUSE.JS Y MAPA GPS
// ==========================================
import { activosRef, dbAlertas } from './terreno-core.js';

window.catalogoGlobal = [];
window.equipoSeleccionadoActual = null;
window.arregloEvidencias = []; 
window.chipsSeleccionados = [];
const CACHE_CATASTRO_KEY = 'cio_cached_catastro';
window.mapaPWA = null;
window.fuseInstance = null;

const HALLAZGOS_POR_TIPO = {
    motor: [
        { frase: '📢 Ruido anómalo en rodamientos', label: '📢 Ruido rodamiento' },
        { frase: '🔥 Gradiente térmico elevado en carcasa', label: '🔥 Sobrecalentamiento' },
        { frase: '🛢️ Expulsión o degradación de grasa', label: '🛢️ Fuga de grasa' },
        { frase: '⚠️ Alta vibración predominante', label: '⚠️ Alta Vibración' }
    ],
    reductor: [
        { frase: '🛢️ Fuga activa de lubricante por retenes', label: '🛢️ Fuga de aceite' },
        { frase: '⚙️ Golpeteo o ruido cíclico en engranajes', label: '⚙️ Ruido engranajes' },
        { frase: '🔥 Temperatura crítica en descansos', label: '🔥 Temperatura alta' },
        { frase: '📊 Nivel de aceite bajo en visor', label: '📊 Nivel bajo / Sin aceite' }
    ],
    polea: [
        { frase: '⛓️ Desgaste severo o corte de correa', label: '⛓️ Correa dañada' },
        { frase: '📐 Desalineamiento angular o paralelo', label: '📐 Desalineamiento' }
    ],
    general: [
        { frase: '🛢️ Fuga visible de fluido/lubricante', label: '🛢️ Fuga de fluido' },
        { frase: '📢 Ruido mecánico anómalo general', label: '📢 Ruido anómalo' },
        { frase: '⚠️ Vibración mecánica severa', label: '⚠️ Alta Vibración' },
        { frase: '🔥 Temperatura elevada fuera de rango', label: '🔥 Alta Temperatura' }
    ]
};

window.mostrarIndicadorSync = function(mostrar) {
    const indicador = document.getElementById('indicadorSincronizando');
    if (indicador) {
        indicador.style.display = mostrar ? 'flex' : 'none';
    }
}

window.salirATelefonoOSuperior = function() {
    window.avanzarPaso(1);
    const selectTag = document.getElementById('fieldTagSelect');
    if (selectTag) selectTag.value = '';
    const inputBuscador = document.getElementById('buscador-fuse-local');
    if (inputBuscador) inputBuscador.value = '';
    window.arregloEvidencias = [];
    window.chipsSeleccionados = [];
    renderizarGaleria();
    window.mostrarNotificacion("🔄 Formulario reiniciado.");
};

window.cambiarVistaPWA = function(vista) {
    document.getElementById('vista-reporte').style.display = vista === 'reporte' ? 'block' : 'none';
    document.getElementById('vista-mapa').style.display = vista === 'mapa' ? 'flex' : 'none';
    
    document.querySelectorAll('nav button').forEach(btn => btn.style.color = 'var(--text-muted)');
    const btnNav = document.getElementById('nav-btn-' + vista);
    if (btnNav) btnNav.style.color = '#38bdf8';

    if (vista === 'mapa') {
        if (!window.mapaPWA) { setTimeout(() => { window.inicializarMapaPWA(); }, 200); } 
        else { setTimeout(() => { window.mapaPWA.invalidateSize(); }, 200); }
    }
}

window.avanzarPaso = function(numPaso) {
    document.querySelectorAll('.wizard-step').forEach(step => step.style.display = 'none');
    const siguientePaso = document.getElementById(`step-${numPaso}`);
    if (siguientePaso) { siguientePaso.style.display = 'flex'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

window.mostrarNotificacion = function(msg) {
    const t = document.getElementById('toastNotificacion');
    if (t) { t.innerText = msg; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 4000); }
}

function cargarDeCacheLocalInmediato() {
    const cached = localStorage.getItem(CACHE_CATASTRO_KEY);
    if (cached) { 
        try { 
            window.catalogoGlobal = JSON.parse(cached); 
            inicializarFuse();
            window.cargarAreasPorFaena(); 
        } catch(e) {} 
    }
}
cargarDeCacheLocalInmediato();

function inicializarFuse() {
    if (window.Fuse && window.catalogoGlobal.length > 0) {
        window.fuseInstance = new window.Fuse(window.catalogoGlobal, {
            keys: ['tag', 'area', 'id'],
            threshold: 0.35,
            distance: 100
        });
    }
}

if (activosRef) {
    if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(true);
    activosRef.on('value', snap => {
        const raw = snap.val();
        if (raw) {
            window.catalogoGlobal = Object.keys(raw).map(k => {
                const data = raw[k] || {};
                let rawComponents = [];
                const src = data.components || data.spots || data.puntos || data.mediciones || data.puntosMedicion || data.puntos_medicion;
                
                if (src) {
                    if (Array.isArray(src)) {
                        rawComponents = src;
                    } else if (typeof src === 'object') {
                        rawComponents = Object.values(src);
                    }
                }

                return {
                    id: k,
                    tag: String(data.tag || data.Tag || data.TAG || data.equipo || k || 'SIN-TAG').trim(),
                    area: String(data.area || data.Area || 'Área General').trim(),
                    siteId: String(data.siteId || data.faena || 'Planta, Mina los Colorados').trim(),
                    lat: data.latitud ? parseFloat(data.latitud) : null,
                    lng: data.longitud ? parseFloat(data.longitud) : null,
                    sev: data.severidad || data.estado || 'Verde',
                    components: rawComponents
                };
            });
            localStorage.setItem(CACHE_CATASTRO_KEY, JSON.stringify(window.catalogoGlobal));
            inicializarFuse();
            window.cargarAreasPorFaena(); 
        }
        if (window.mostrarIndicadorSync) window.mostrarIndicadorSync(false);
    });
}

window.cargarAreasPorFaena = function() {
    const filtered = window.catalogoGlobal.filter(e => e.siteId.includes('Colorados') || !e.siteId);
    const areasUnicas = [...new Set(filtered.map(e => e.area))].filter(Boolean).sort();
    
    const selectArea = document.getElementById('fieldArea');
    if (selectArea) {
        selectArea.innerHTML = '<option value="">-- Selecciona el Área --</option>' + areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
    }
    document.getElementById('fieldTagSelect').innerHTML = '<option value="">-- Selecciona el equipo --</option>';
}

window.cargarEquiposPorArea = function() {
    const areaVal = document.getElementById('fieldArea').value;
    const filtered = window.catalogoGlobal.filter(e => e.area === areaVal);
    
    const selectEquipo = document.getElementById('fieldTagSelect');
    if (selectEquipo) {
        selectEquipo.innerHTML = '<option value="">-- Selecciona el equipo --</option>' + filtered.sort((a,b) => a.tag.localeCompare(b.tag)).map(e => `<option value="${e.tag}">${e.tag}</option>`).join('');
    }
}

window.filtrarEquiposFuse = function(query) {
    if (!query || query.trim().length < 2 || !window.fuseInstance) return;
    const resultados = window.fuseInstance.search(query.trim()).map(res => res.item);
    if (resultados.length > 0) {
        const match = resultados[0];
        const selectArea = document.getElementById('fieldArea');
        if (selectArea) {
            selectArea.value = match.area;
            window.cargarEquiposPorArea();
            const selectEquipo = document.getElementById('fieldTagSelect');
            if (selectEquipo) {
                selectEquipo.value = match.tag;
                window.seleccionarEquipoTag(match.tag);
                window.mostrarNotificacion(`🎯 Encontrado: ${match.tag}`);
            }
        }
    }
}

window.seleccionarEquipoTag = function(tagVal) {
    window.equipoSeleccionadoActual = window.catalogoGlobal.find(e => e.tag === tagVal);
    window.poblarSpotsEquipo(window.equipoSeleccionadoActual ? window.equipoSeleccionadoActual.components : []);
}

window.poblarSpotsEquipo = function(componentsList) {
    const selSpot = document.getElementById('fieldSpot');
    selSpot.innerHTML = '<option value="Condición Global del Equipo">🌐 Condición Global (Todo el equipo)</option>';

    if (componentsList && componentsList.length > 0) {
        componentsList.forEach(comp => {
            let nombreComp = 'Componente';
            if (typeof comp === 'string') {
                nombreComp = comp;
            } else if (typeof comp === 'object' && comp !== null) {
                nombreComp = comp.name || comp.nombre || comp.descripcion || comp.tag_punto || comp.tag || comp.punto || JSON.stringify(comp);
            }
            selSpot.innerHTML += `<option value="${nombreComp}">⚙️ ${nombreComp}</option>`;
        });
    }
    window.actualizarHallazgosPorSpot(selSpot.value);
}

window.actualizarHallazgosPorSpot = function(spotName) {
    const lower = spotName.toLowerCase();
    let tipo = 'general';
    if (lower.includes('motor')) tipo = 'motor';
    else if (lower.includes('reductor') || lower.includes('transmisi')) tipo = 'reductor';
    else if (lower.includes('polea') || lower.includes('correa')) tipo = 'polea';

    const fallas = HALLAZGOS_POR_TIPO[tipo] || HALLAZGOS_POR_TIPO.general;
    const contenedor = document.getElementById('contenedor-chips-dinamicos');
    
    if (contenedor) {
        contenedor.innerHTML = '';
        window.chipsSeleccionados = [];
        document.getElementById('fieldDetalle').value = ''; 
        
        fallas.forEach(falla => { 
            contenedor.innerHTML += `<div onclick="window.toggleChip(this, '${falla.frase}')" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 8px 12px; border-radius: 16px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">${falla.label}</div>`; 
        });
    }
}

window.toggleChip = function(chipEl, fraseCompleta) {
    if (chipEl.style.background.includes('rgb')) {
        chipEl.style.background = 'rgba(56, 189, 248, 0.1)';
        chipEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        window.chipsSeleccionados = window.chipsSeleccionados.filter(c => c !== fraseCompleta);
    } else {
        chipEl.style.background = '#0284c7';
        chipEl.style.borderColor = '#38bdf8';
        chipEl.style.color = 'white';
        window.chipsSeleccionados.push(fraseCompleta);
    }
}

window.iniciarDictado = function() {
    try {
        const cajaTexto = document.getElementById('fieldDetalle');
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { alert("Navegador sin soporte de voz."); return; }
        const rec = new SpeechRecognition();
        rec.lang = 'es-CL';
        rec.onstart = () => window.mostrarNotificacion("🎙️ Escuchando dictado...");
        rec.onresult = (e) => { cajaTexto.value = (cajaTexto.value + " " + e.results[0][0].transcript).trim(); };
        rec.start();
    } catch (e) { alert("Error con el micrófono."); }
}

window.procesarYComprimirMedia = async function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) { await procesarImagen(files[i]); } 
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
                    let width = img.width, height = img.height;
                    if (width > 640) { height = Math.round((height * 640) / width); width = 640; }
                    canvas.width = width; canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    window.arregloEvidencias.push({ tipo: 'imagen', data: canvas.toDataURL('image/jpeg', 0.6) });
                } catch(err) {} resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

window.eliminarEvidenciaPWA = function(index) {
    window.arregloEvidencias.splice(index, 1); renderizarGaleria();
}

function renderizarGaleria() {
    const gallery = document.getElementById('mediaGallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    window.arregloEvidencias.forEach((ev, index) => {
        gallery.innerHTML += `<div style="position:relative; display:inline-block;"><img src="${ev.data}" style="border-radius:6px; height:70px; width:70px; object-fit:cover; border: 1px solid var(--border-glass);"><button type="button" onclick="window.eliminarEvidenciaPWA(${index})" style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:10px; cursor:pointer; font-weight:bold;">X</button></div>`;
    });
}

window.selectSevFat = function(sev) {
    document.getElementById('fieldSev').value = sev;
    ['Verde', 'Amarillo', 'Naranja', 'Rojo'].forEach(s => {
        const btn = document.getElementById('sev_' + s);
        if (btn) btn.style.border = (s === sev) ? '2px solid white' : '1px solid var(--border-glass)';
    });
}

window.enviarAlertaSegura = function() {
    const tagSelect = document.getElementById('fieldTagSelect').value;
    if (!tagSelect) { alert("⚠️ Selecciona un equipo en el Paso 1."); window.avanzarPaso(1); return; }

    const spotFinal = document.getElementById('fieldSpot').value;
    const sev = document.getElementById('fieldSev').value;
    const notasManuales = document.getElementById('fieldDetalle').value.trim();
    const btnTransmitir = document.getElementById('btn-transmitir-final');

    let textoFinal = `[COMPONENTE: ${spotFinal}]\n`;
    if (window.chipsSeleccionados.length > 0) textoFinal += "📌 Hallazgos: " + window.chipsSeleccionados.join(" | ") + "\n";
    if (notasManuales !== "") textoFinal += "📝 Notas: " + notasManuales;

    const primerFoto = window.arregloEvidencias.find(e => e.tipo === 'imagen');

    const payload = {
        faena: "Mina Los Colorados (MLC)",
        area: document.getElementById('fieldArea').value,
        tag: tagSelect,
        componente: spotFinal,
        severidad: sev,
        detalle: textoFinal,
        fotoBase64: primerFoto ? primerFoto.data : '',
        evidencias: window.arregloEvidencias,
        timestamp: new Date().toISOString(),
        estado: 'nuevo'
    };

    btnTransmitir.disabled = true;
    btnTransmitir.innerHTML = `<span class="material-symbols-outlined">sync</span> TRANSMITIENDO...`;
    window.mostrarNotificacion("⚡ Transmitiendo reporte optimizado...");

    if (navigator.onLine && dbAlertas) {
        dbAlertas.push(payload).then(() => { 
            window.mostrarNotificacion("✅ Reporte entregado al CIO."); 
            limpiarTrasEnvio(btnTransmitir); 
        }).catch(() => { 
            window.guardarEnBoveda(payload); 
            limpiarTrasEnvio(btnTransmitir); 
        });
    } else { 
        window.guardarEnBoveda(payload); 
        limpiarTrasEnvio(btnTransmitir); 
    }
}

function limpiarTrasEnvio(btn) {
    document.getElementById('fieldDetalle').value = '';
    window.chipsSeleccionados = []; window.arregloEvidencias = []; renderizarGaleria();
    document.getElementById('fieldTagSelect').value = '';
    document.getElementById('buscador-fuse-local').value = '';
    window.poblarSpotsEquipo(null);
    
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined">send</span> TRANSMITIR AL CIO`;
    window.avanzarPaso(1); 
}

// MAPA GPS
window.inicializarMapaPWA = function() {
    try {
        const divMapa = document.getElementById('mapa-gps-pwa');
        if (!divMapa || typeof L === 'undefined') return;
        
        window.mapaPWA = L.map('mapa-gps-pwa').setView([-28.290846, -70.813030], 16);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri', maxNativeZoom: 17, maxZoom: 21
        }).addTo(window.mapaPWA);

        renderizarPinesEnMapaPWA();
        setTimeout(() => { window.mapaPWA.invalidateSize(); window.centrarEnMiUbicacion(); }, 300);
    } catch(e) {}
}

function renderizarPinesEnMapaPWA() {
    if (!window.mapaPWA || !window.catalogoGlobal || window.catalogoGlobal.length === 0) return;
    window.catalogoGlobal.forEach(equipo => {
        if (equipo.lat && equipo.lng && !isNaN(equipo.lat) && !isNaN(equipo.lng)) {
            const sev = (equipo.sev || 'verde').toLowerCase();
            let colorPin = '#10b981';
            if (sev === 'rojo' || sev === 'critico') colorPin = '#ef4444';
            else if (sev === 'naranja') colorPin = '#f97316';
            else if (sev === 'amarillo') colorPin = '#eab308';

            const iconEquipo = L.divIcon({
                className: 'custom-pin-pwa',
                html: `<div style="background-color: ${colorPin}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(0,0,0,0.8);"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8]
            });

            const htmlPopup = `
                <div style="font-family: sans-serif; padding: 4px; min-width: 140px;">
                    <strong style="color:#0f172a; font-size: 0.95rem; font-family: monospace;">${equipo.tag}</strong><br>
                    <span style="color:#64748b; font-size: 0.75rem;">Área: ${equipo.area}</span><br>
                    <button onclick="window.reportarDesdeMapa('${equipo.tag}', '${equipo.area}')" 
                            style="margin-top:8px; background:#0284c7; color:white; border:none; padding:6px 10px; border-radius:6px; width:100%; cursor:pointer; font-weight:bold; font-size: 0.75rem;">
                        🎯 Reportar en este equipo
                    </button>
                </div>`;
            L.marker([equipo.lat, equipo.lng], { icon: iconEquipo }).addTo(window.mapaPWA).bindPopup(htmlPopup);
        }
    });
}

window.centrarEnMiUbicacion = function() {
    if (!window.mapaPWA) return;
    window.mapaPWA.locate({setView: true, maxZoom: 17});
    window.mapaPWA.on('locationfound', function(e) {
        if (window.marcadorGPS_PWA) window.mapaPWA.removeLayer(window.marcadorGPS_PWA);
        const iconoGPS = L.divIcon({ className: 'gps-pin', html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #3b82f6;"></div>`, iconSize: [16, 16] });
        window.marcadorGPS_PWA = L.marker(e.latlng, {icon: iconoGPS}).addTo(window.mapaPWA);
    });
}

window.reportarDesdeMapa = function(tag, area) {
    window.cambiarVistaPWA('reporte');
    window.avanzarPaso(1);
    const selectArea = document.getElementById('fieldArea');
    if (selectArea) {
        selectArea.value = area;
        window.cargarEquiposPorArea();
        setTimeout(() => {
            const selectTag = document.getElementById('fieldTagSelect');
            if (selectTag) { selectTag.value = tag; window.seleccionarEquipoTag(tag); }
            window.mostrarNotificacion("📍 Equipo seleccionado desde el mapa.");
        }, 50);
    }
};

window.buscarEnMapaPWA = function(e) {
    if (e.key !== 'Enter' || !window.mapaPWA) return;
    const busqueda = e.target.value.toLowerCase().trim();
    if (!busqueda) return;
    const equipo = window.catalogoGlobal.find(eq => eq.tag && eq.tag.toLowerCase().includes(busqueda));
    if (!equipo) { alert(`⚠️ No se encontró el equipo "${busqueda}".`); return; }
    if (!equipo.lat || !equipo.lng) { alert(`⚠️ El equipo "${equipo.tag}" no tiene coordenadas GPS.`); return; }
    window.mapaPWA.flyTo([equipo.lat, equipo.lng], 18, { animate: true, duration: 1.5 });
};