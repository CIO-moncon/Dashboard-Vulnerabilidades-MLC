// ============================================================================
// MÓDULO UI TERRENO: WIZARD, BUSCADOR FUSE.JS, EVIDENCIAS Y MAPA GPS (v2.1.0)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Orden Cinemático y Normalización de Payload
// ============================================================================

import { activosRef, dbAlertas, guardarCatastroLocal, cargarCatastroLocal } from './terreno-core.js';

window.catalogoGlobal = [];
window.equipoSeleccionadoActual = null;
window.arregloEvidencias = []; 
window.chipsSeleccionados = [];
window.mapaPWA = null;
window.fuseInstance = null;
window.marcadorGPS_PWA = null;

let capaMarcadoresPWA = null;
let debounceFuseTimer = null;

const HALLAZGOS_POR_TIPO = Object.freeze({
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
});

function escaparHTML(texto = '') {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const clasificarPuntoCinematico = (puntoRaw = '') => {
    const p = String(puntoRaw || '').toUpperCase().trim();
    const match = p.match(/^([A-Z]+)(\d+)?(?:[_\-\s]?([A-Z0-9]+))?$/i);

    const prefijo = match && match[1] ? match[1].toUpperCase() : p;
    const num = match && match[2] ? parseInt(match[2], 10) : 0;
    const sufijo = match && match[3] ? match[3].toUpperCase() : '';

    let peso = 99;
    if (prefijo === 'M' || prefijo === 'MOT') peso = 10;
    else if (prefijo === 'A' || prefijo === 'ACOP') peso = 20;
    else if (prefijo === 'G' || prefijo === 'R' || prefijo === 'RED') peso = 30;
    else if (prefijo === 'E' || prefijo === 'EJE') peso = 40;
    else if (prefijo === 'PL' || prefijo === 'P' || prefijo === 'POL') peso = 50;
    else if (prefijo === 'CH' || prefijo === 'CHUM' || prefijo === 'D' || prefijo === 'C') peso = 60;
    else if (prefijo === 'T' || prefijo === 'TAM' || prefijo === 'B') peso = 70;

    let pesoSufijo = 50;
    if (sufijo.includes('LD') || sufijo.includes('DE') || sufijo.includes('CARGA')) pesoSufijo = 10;
    if (sufijo.includes('LI') || sufijo.includes('NDE') || sufijo.includes('LIBRE')) pesoSufijo = 20;

    return { punto: p, peso, num, pesoSufijo, sufijo };
};

const ordenarPuntosCinematicos = (a, b) => {
    const puntoA = typeof a === 'string' ? a : (a.punto || a.id || '');
    const puntoB = typeof b === 'string' ? b : (b.punto || b.id || '');
    const infoA = clasificarPuntoCinematico(puntoA);
    const infoB = clasificarPuntoCinematico(puntoB);
    if (infoA.peso !== infoB.peso) return infoA.peso - infoB.peso;
    if (infoA.num !== infoB.num) return infoA.num - infoB.num;
    if (infoA.pesoSufijo !== infoB.pesoSufijo) return infoA.pesoSufijo - infoB.pesoSufijo;
    return infoA.sufijo.localeCompare(infoB.sufijo);
};

const deducirNombreComponente = (puntoStr, nombreOriginal) => {
    if (nombreOriginal && nombreOriginal !== 'Componente' && nombreOriginal !== 'Punto' && nombreOriginal.trim() !== '') {
        return nombreOriginal;
    }
    const p = String(puntoStr || '').toUpperCase();
    if (p === 'M1') return 'Motor NDE (Lado Libre)';
    if (p === 'M2') return 'Motor DE (Lado Acople)';
    if (p.startsWith('G') || p.startsWith('R')) {
        const num = p.replace(/\D/g, '');
        return `Reductor Etapa ${num || 'Principal'}`;
    }
    if (p.startsWith('PL') || p.startsWith('P')) {
        const lado = p.includes('LD') ? 'Lado Derecho' : (p.includes('LI') ? 'Lado Izquierdo' : '');
        return `Polea de Transmisión ${lado}`;
    }
    if (p.startsWith('CH') || p.startsWith('D')) return 'Chumacera / Descanso';
    return nombreOriginal || p || 'Punto de Medición';
};

function cargarAreasPorFaena() {
    const catalogo = window.catalogoGlobal || [];
    const filtered = catalogo.filter((e) => e.siteId?.includes('Colorados') || !e.siteId);
    const areasUnicas = [...new Set(filtered.map((e) => e.area))].filter(Boolean).sort();

    const selectArea = document.getElementById('fieldArea');
    if (selectArea) {
        selectArea.innerHTML = '<option value="">-- Selecciona el Área --</option>' +
            areasUnicas.map((a) => `<option value="${escaparHTML(a)}">${escaparHTML(a)}</option>`).join('');
    }

    const selectTag = document.getElementById('fieldTagSelect');
    if (selectTag) {
        selectTag.innerHTML = '<option value="">-- Selecciona el equipo --</option>';
    }
}

function cargarEquiposPorArea() {
    const selectArea = document.getElementById('fieldArea');
    const areaVal = selectArea?.value ?? '';
    const filtered = (window.catalogoGlobal || []).filter((e) => e.area === areaVal);

    const selectEquipo = document.getElementById('fieldTagSelect');
    if (selectEquipo) {
        selectEquipo.innerHTML = '<option value="">-- Selecciona el equipo --</option>' +
            filtered
                .sort((a, b) => a.tag.localeCompare(b.tag))
                .map((e) => `<option value="${escaparHTML(e.tag)}">${escaparHTML(e.tag)}</option>`)
                .join('');
    }
}

function inicializarFuse() {
    if (window.Fuse && window.catalogoGlobal && window.catalogoGlobal.length > 0) {
        window.fuseInstance = new window.Fuse(window.catalogoGlobal, {
            keys: ['tag', 'area', 'id'],
            threshold: 0.35,
            distance: 100
        });
    }
}

function seleccionarEquipoTag(tagVal) {
    window.equipoSeleccionadoActual = (window.catalogoGlobal || []).find((e) => e.tag === tagVal) ?? null;
    poblarSpotsEquipo(window.equipoSeleccionadoActual?.components ?? []);
}

function poblarSpotsEquipo(componentsList = []) {
    const selSpot = document.getElementById('fieldSpot');
    if (!selSpot) return;

    let optionsHTML = '<option value="Condición Global del Equipo">🌐 Condición Global (Todo el equipo)</option>';

    if (componentsList && componentsList.length > 0) {
        const puntosNormalizados = componentsList.map((comp, idx) => {
            let puntoId = 'P' + (idx + 1);
            let nombreComp = 'Componente';

            if (typeof comp === 'string') {
                puntoId = comp;
                nombreComp = deducirNombreComponente(comp, '');
            } else if (typeof comp === 'object' && comp !== null) {
                puntoId = comp.punto || comp.tag || comp.id || ('P' + (idx + 1));
                const rawName = comp.componente || comp.name || comp.nombre || comp.descripcion || comp.tag_punto;
                nombreComp = deducirNombreComponente(puntoId, rawName);
            }
            return { punto: puntoId, componente: nombreComp };
        });

        puntosNormalizados.sort(ordenarPuntosCinematicos);

        optionsHTML += puntosNormalizados.map((item) => {
            return `<option value="${escaparHTML(item.componente)}">⚙️ [${escaparHTML(item.punto)}] ${escaparHTML(item.componente)}</option>`;
        }).join('');
    }

    selSpot.innerHTML = optionsHTML;
    actualizarHallazgosPorSpot(selSpot.value);
}

function actualizarHallazgosPorSpot(spotName = '') {
    const lower = spotName.toLowerCase();
    let tipo = 'general';
    if (lower.includes('motor')) tipo = 'motor';
    else if (lower.includes('reductor') || lower.includes('transmisi')) tipo = 'reductor';
    else if (lower.includes('polea') || lower.includes('correa')) tipo = 'polea';

    const fallas = HALLAZGOS_POR_TIPO[tipo] ?? HALLAZGOS_POR_TIPO.general;
    const contenedor = document.getElementById('contenedor-chips-dinamicos');
    
    if (contenedor) {
        window.chipsSeleccionados = [];
        const fieldDetalle = document.getElementById('fieldDetalle');
        if (fieldDetalle) fieldDetalle.value = '';

        contenedor.innerHTML = fallas.map((falla) => `
            <button type="button" 
                    class="chip-hallazgo"
                    role="button"
                    aria-pressed="false"
                    data-seleccionado="false"
                    data-frase="${escaparHTML(falla.frase)}"
                    onclick="window.toggleChip(this, '${escaparHTML(falla.frase)}')" 
                    style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 8px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease;">
                ${escaparHTML(falla.label)}
            </button>
        `).join('');
    }
}

async function cargarDeCacheLocalInmediato() {
    const equiposGuardados = await cargarCatastroLocal();
    if (equiposGuardados && equiposGuardados.length > 0) {
        window.catalogoGlobal = equiposGuardados;
        inicializarFuse();
        cargarAreasPorFaena();
    }
}

window.cargarAreasPorFaena = cargarAreasPorFaena;
window.cargarEquiposPorArea = cargarEquiposPorArea;
window.seleccionarEquipoTag = seleccionarEquipoTag;
window.poblarSpotsEquipo = poblarSpotsEquipo;
window.actualizarHallazgosPorSpot = actualizarHallazgosPorSpot;

cargarDeCacheLocalInmediato();

if (activosRef) {
    window.mostrarIndicadorSync?.(true);

    activosRef.on('value', async (snap) => {
        const raw = snap.val();
        if (raw) {
            window.catalogoGlobal = Object.keys(raw).map((k) => {
                const data = raw[k] ?? {};
                let rawComponents = [];
                const src = data.components ?? data.spots ?? data.puntos ?? data.mediciones ?? data.puntosMedicion ?? data.puntos_medicion;

                if (src) {
                    rawComponents = Array.isArray(src) ? src : Object.values(src);
                }

                return {
                    id: k,
                    tag: String(data.tag ?? data.Tag ?? data.TAG ?? data.equipo ?? k ?? 'SIN-TAG').trim(),
                    area: String(data.area ?? data.Area ?? 'Área General').trim(),
                    siteId: String(data.siteId ?? data.faena ?? 'Planta, Mina los Colorados').trim(),
                    lat: data.latitud ? parseFloat(data.latitud) : null,
                    lng: data.longitud ? parseFloat(data.longitud) : null,
                    sev: data.severidad ?? data.estado ?? 'Verde',
                    components: rawComponents
                };
            });

            await guardarCatastroLocal(window.catalogoGlobal);
            inicializarFuse();
            cargarAreasPorFaena();

            if (window.mapaPWA) {
                renderizarPinesEnMapaPWA();
            }
        }
        window.mostrarIndicadorSync?.(false);
    });
}

window.filtrarEquiposFuse = function(query) {
    clearTimeout(debounceFuseTimer);
    const busquedaLimpia = query?.trim() ?? '';
    if (busquedaLimpia.length < 2 || !window.fuseInstance) return;

    debounceFuseTimer = setTimeout(() => {
        const resultados = window.fuseInstance.search(busquedaLimpia).map((res) => res.item);
        if (resultados.length > 0) {
            const match = resultados[0];
            const selectArea = document.getElementById('fieldArea');

            if (selectArea) {
                selectArea.value = match.area;
                cargarEquiposPorArea();

                const selectEquipo = document.getElementById('fieldTagSelect');
                if (selectEquipo) {
                    selectEquipo.value = match.tag;
                    seleccionarEquipoTag(match.tag);
                    window.mostrarNotificacion(`🎯 Coincidencia: ${match.tag}`);
                }
            }
        }
    }, 200);
};

window.toggleChip = function(chipEl, fraseCompleta) {
    const estaActivo = chipEl.getAttribute('data-seleccionado') === 'true';

    if (estaActivo) {
        chipEl.setAttribute('data-seleccionado', 'false');
        chipEl.setAttribute('aria-pressed', 'false');
        chipEl.style.background = 'rgba(56, 189, 248, 0.1)';
        chipEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        chipEl.style.color = '#38bdf8';
        window.chipsSeleccionados = window.chipsSeleccionados.filter((c) => c !== fraseCompleta);
    } else {
        chipEl.setAttribute('data-seleccionado', 'true');
        chipEl.setAttribute('aria-pressed', 'true');
        chipEl.style.background = '#0284c7';
        chipEl.style.borderColor = '#38bdf8';
        chipEl.style.color = '#ffffff';
        window.chipsSeleccionados.push(fraseCompleta);
    }
};

window.mostrarIndicadorSync = function(mostrar) {
    const indicador = document.getElementById('indicadorSincronizando');
    if (indicador) {
        indicador.style.display = mostrar ? 'flex' : 'none';
        indicador.setAttribute('aria-hidden', mostrar ? 'false' : 'true');
    }
};

window.mostrarNotificacion = function(msg) {
    const t = document.getElementById('toastNotificacion');
    if (!t) return;

    t.textContent = msg;
    t.style.display = 'block';

    if (t.timerOcultar) clearTimeout(t.timerOcultar);
    t.timerOcultar = setTimeout(() => {
        t.style.display = 'none';
    }, 3800);
};

window.avanzarPaso = function(numPaso) {
    document.querySelectorAll('.wizard-step').forEach((step) => {
        step.style.display = 'none';
        step.setAttribute('aria-hidden', 'true');
    });

    const siguientePaso = document.getElementById(`step-${numPaso}`);
    if (siguientePaso) {
        siguientePaso.style.display = 'flex';
        siguientePaso.setAttribute('aria-hidden', 'false');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.salirATelefonoOSuperior = function() {
    window.avanzarPaso(1);

    const selectTag = document.getElementById('fieldTagSelect');
    if (selectTag) selectTag.value = '';

    const inputBuscador = document.getElementById('buscador-fuse-local');
    if (inputBuscador) inputBuscador.value = '';

    const fieldDetalle = document.getElementById('fieldDetalle');
    if (fieldDetalle) fieldDetalle.value = '';

    window.arregloEvidencias = [];
    window.chipsSeleccionados = [];
    renderizarGaleria();
    window.mostrarNotificacion('🔄 Formulario reiniciado.');
};

window.cambiarVistaPWA = function(vista) {
    const vistaReporte = document.getElementById('vista-reporte');
    const vistaMapa = document.getElementById('vista-mapa');

    if (vistaReporte) vistaReporte.style.display = vista === 'reporte' ? 'block' : 'none';
    if (vistaMapa) vistaMapa.style.display = vista === 'mapa' ? 'flex' : 'none';

    document.querySelectorAll('nav button').forEach((btn) => {
        btn.style.color = 'var(--text-muted, #94a3b8)';
        btn.setAttribute('aria-pressed', 'false');
    });

    const btnNav = document.getElementById(`nav-btn-${vista}`);
    if (btnNav) {
        btnNav.style.color = '#38bdf8';
        btnNav.setAttribute('aria-pressed', 'true');
    }

    if (vista === 'mapa') {
        if (!window.mapaPWA) {
            setTimeout(() => window.inicializarMapaPWA(), 200);
        } else {
            setTimeout(() => window.mapaPWA.invalidateSize(), 200);
        }
    }
};

window.iniciarDictado = function() {
    const cajaTexto = document.getElementById('fieldDetalle');
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert('Este dispositivo no posee soporte nativo para dictado por voz.');
        return;
    }

    try {
        const rec = new SpeechRecognition();
        rec.lang = 'es-CL';
        rec.onstart = () => window.mostrarNotificacion('🎙️ Escuchando dictado...');
        rec.onresult = (e) => {
            if (cajaTexto) {
                cajaTexto.value = `${cajaTexto.value} ${e.results[0][0].transcript}`.trim();
            }
        };
        rec.start();
    } catch {
        alert('Error al acceder al micrófono.');
    }
};

window.procesarYComprimirMedia = async function(event) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                const dataUrl = await comprimirFoto(file);
                window.arregloEvidencias.push({ tipo: 'imagen', data: dataUrl });
            } catch (err) {
                console.error('[PWA] Fallo compresión de imagen:', err);
            }
        }
    }
    renderizarGaleria();
    event.target.value = '';
};

function comprimirFoto(file, maxWidth = 800, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            try {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                canvas.width = 0;
                canvas.height = 0;
                URL.revokeObjectURL(objectUrl);
                resolve(dataUrl);
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(err);
        };

        img.src = objectUrl;
    });
}

window.eliminarEvidenciaPWA = function(index) {
    window.arregloEvidencias.splice(index, 1);
    renderizarGaleria();
};

function renderizarGaleria() {
    const gallery = document.getElementById('mediaGallery');
    if (!gallery) return;

    gallery.innerHTML = window.arregloEvidencias.map((ev, index) => `
        <figure style="position: relative; display: inline-block; margin: 0;">
            <img src="${ev.data}" 
                 style="border-radius: 6px; height: 70px; width: 70px; object-fit: cover; border: 1px solid var(--border-glass, rgba(255,255,255,0.15));" 
                 alt="Foto ${index + 1}">
            <button type="button" 
                    onclick="window.eliminarEvidenciaPWA(${index})" 
                    style="position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center;">
                ✕
            </button>
        </figure>
    `).join('');
}

window.selectSevFat = function(sev) {
    const inputSev = document.getElementById('fieldSev');
    if (inputSev) inputSev.value = sev;

    ['Verde', 'Amarillo', 'Naranja', 'Rojo'].forEach((s) => {
        const btn = document.getElementById(`sev_${s}`);
        if (btn) {
            const seleccionado = s === sev;
            btn.style.border = seleccionado ? '2px solid #ffffff' : '1px solid var(--border-glass, rgba(255,255,255,0.15))';
            btn.setAttribute('aria-checked', seleccionado ? 'true' : 'false');
        }
    });
};

window.enviarAlertaSegura = async function() {
    const tagSelect = document.getElementById('fieldTagSelect')?.value;
    if (!tagSelect) {
        alert('⚠️ Debe seleccionar un equipo en el Paso 1 antes de transmitir.');
        window.avanzarPaso(1);
        return;
    }

    const spotFinal = document.getElementById('fieldSpot')?.value ?? 'Condición Global';
    const sev = document.getElementById('fieldSev')?.value ?? 'Rojo';
    const notasManuales = document.getElementById('fieldDetalle')?.value.trim() ?? '';
    const btnTransmitir = document.getElementById('btn-transmitir-final');

    let textoFinal = `[COMPONENTE: ${spotFinal}]\n`;
    if (window.chipsSeleccionados.length > 0) {
        textoFinal += `📌 Hallazgos: ${window.chipsSeleccionados.join(' | ')}\n`;
    }
    if (notasManuales !== '') {
        textoFinal += `📝 Notas: ${notasManuales}`;
    }

    const primerFoto = window.arregloEvidencias.find((e) => e.tipo === 'imagen');

    const payload = {
        faena: 'Mina Los Colorados (MLC)',
        area: document.getElementById('fieldArea')?.value ?? 'General',
        tag: tagSelect,
        componente: spotFinal,
        severidad: sev,
        severidadPreliminar: `Zona ${sev === 'Rojo' ? 'D' : (sev === 'Naranja' ? 'C' : (sev === 'Amarillo' ? 'B' : 'A'))} (${sev})`,
        detalle: textoFinal,
        descripcion: textoFinal,
        fotoBase64: primerFoto ? primerFoto.data : '',
        evidencias: window.arregloEvidencias,
        timestamp: new Date().toISOString(),
        inspector: 'Inspector de Terreno PWA',
        estado: 'Pendiente'
    };

    if (btnTransmitir) {
        btnTransmitir.disabled = true;
        btnTransmitir.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;" aria-hidden="true">sync</span> TRANSMITIENDO...`;
    }
    window.mostrarNotificacion('⚡ Procesando transmisión...');

    try {
        if (navigator.onLine && dbAlertas) {
            await dbAlertas.push(payload);
            window.mostrarNotificacion('✅ Hallazgo enviado a la Bandeja de Triage.');
        } else {
            await window.guardarEnBoveda?.(payload);
        }
    } catch {
        await window.guardarEnBoveda?.(payload);
    } finally {
        limpiarTrasEnvio(btnTransmitir);
    }
};

function limpiarTrasEnvio(btn) {
    const fieldDetalle = document.getElementById('fieldDetalle');
    if (fieldDetalle) fieldDetalle.value = '';

    window.chipsSeleccionados = [];
    window.arregloEvidencias = [];
    renderizarGaleria();

    const fieldTagSelect = document.getElementById('fieldTagSelect');
    if (fieldTagSelect) fieldTagSelect.value = '';

    const inputBuscador = document.getElementById('buscador-fuse-local');
    if (inputBuscador) inputBuscador.value = '';

    poblarSpotsEquipo(null);

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">send</span> TRANSMITIR AL CIO`;
    }
    window.avanzarPaso(1);
}

window.inicializarMapaPWA = function() {
    try {
        const divMapa = document.getElementById('mapa-gps-pwa');
        if (!divMapa || typeof L === 'undefined') return;

        if (!window.mapaPWA) {
            window.mapaPWA = L.map('mapa-gps-pwa', { preferCanvas: true }).setView([-28.290846, -70.813030], 16);

            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri',
                maxNativeZoom: 17,
                maxZoom: 21
            }).addTo(window.mapaPWA);

            capaMarcadoresPWA = L.layerGroup().addTo(window.mapaPWA);
        }

        renderizarPinesEnMapaPWA();
        setTimeout(() => {
            window.mapaPWA?.invalidateSize();
            window.centrarEnMiUbicacion();
        }, 300);
    } catch (e) {
        console.error('[PWA] Error en mapa:', e);
    }
};

function renderizarPinesEnMapaPWA() {
    if (!window.mapaPWA || !capaMarcadoresPWA || !window.catalogoGlobal?.length) return;

    capaMarcadoresPWA.clearLayers();

    window.catalogoGlobal.forEach((equipo) => {
        if (equipo.lat && equipo.lng && !isNaN(equipo.lat) && !isNaN(equipo.lng)) {
            const sev = (equipo.sev ?? 'verde').toLowerCase();
            let colorPin = '#00e676';
            if (sev === 'rojo' || sev === 'critico') colorPin = '#ef4444';
            else if (sev === 'naranja') colorPin = '#f97316';
            else if (sev === 'amarillo') colorPin = '#eab308';

            const iconEquipo = L.divIcon({
                className: 'custom-pin-pwa',
                html: `<div style="background-color: ${colorPin}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(0,0,0,0.8);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const htmlPopup = `
                <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 140px;">
                    <strong style="color: #0f172a; font-size: 0.95rem; font-family: monospace;">${escaparHTML(equipo.tag)}</strong><br>
                    <span style="color: #64748b; font-size: 0.75rem;">Área: ${escaparHTML(equipo.area)}</span><br>
                    <button type="button" 
                            onclick="window.reportarDesdeMapa('${escaparHTML(equipo.tag)}', '${escaparHTML(equipo.area)}')" 
                            style="margin-top: 8px; background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 6px; width: 100%; cursor: pointer; font-weight: 700; font-size: 0.75rem;">
                        🎯 Reportar en este equipo
                    </button>
                </div>
            `;

            const marcador = L.marker([equipo.lat, equipo.lng], { icon: iconEquipo }).bindPopup(htmlPopup);
            capaMarcadoresPWA.addLayer(marcador);
        }
    });
}

window.centrarEnMiUbicacion = function() {
    if (!window.mapaPWA) return;

    window.mapaPWA.locate({ setView: true, maxZoom: 17 });
    window.mapaPWA.once('locationfound', (e) => {
        if (window.marcadorGPS_PWA) {
            window.mapaPWA.removeLayer(window.marcadorGPS_PWA);
        }
        const iconoGPS = L.divIcon({
            className: 'gps-pin',
            html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #3b82f6;"></div>`,
            iconSize: [16, 16]
        });
        window.marcadorGPS_PWA = L.marker(e.latlng, { icon: iconoGPS }).addTo(window.mapaPWA);
    });
};

window.reportarDesdeMapa = function(tag, area) {
    window.cambiarVistaPWA('reporte');
    window.avanzarPaso(1);

    const selectArea = document.getElementById('fieldArea');
    if (selectArea) {
        selectArea.value = area;
        cargarEquiposPorArea();

        setTimeout(() => {
            const selectTag = document.getElementById('fieldTagSelect');
            if (selectTag) {
                selectTag.value = tag;
                seleccionarEquipoTag(tag);
            }
            window.mostrarNotificacion('📍 Equipo seleccionado desde el mapa.');
        }, 60);
    }
};

window.buscarEnMapaPWA = function(e) {
    if (e.key !== 'Enter' || !window.mapaPWA) return;
    const busqueda = e.target.value.toLowerCase().trim();
    if (!busqueda) return;

    const equipo = (window.catalogoGlobal || []).find((eq) => eq.tag && eq.tag.toLowerCase().includes(busqueda));
    if (!equipo) {
        alert(`⚠️ No se encontró el equipo "${busqueda}".`);
        return;
    }
    if (!equipo.lat || !equipo.lng) {
        alert(`⚠️ El equipo "${equipo.tag}" no tiene coordenadas GPS.`);
        return;
    }

    window.mapaPWA.flyTo([equipo.lat, equipo.lng], 18, { animate: true, duration: 1.5 });
};