// ==========================================
// INICIALIZACIÓN DEL MAPA BASE (LEAFLET)
// ==========================================
window.mapa = L.map('mapa-gis', { zoomControl: false }).setView([-28.298, -70.785], 15);
L.control.zoom({ position: 'topleft' }).addTo(window.mapa);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 17
}).addTo(window.mapa);

// ==========================================
// VARIABLES GLOBALES DEL MAPA
// ==========================================
window.filtroActualMapa = 'TODOS';
window.capaMarcadores = L.layerGroup().addTo(window.mapa);

// ==========================================
// FUNCIÓN: CENTRAR MAPA GLOBAL
// ==========================================
window.centrarMapaGlobal = function() {
    if (window.mapa) {
        window.mapa.setView([-28.298, -70.785], 15);
    }
};

// ==========================================
// FUNCIÓN: BUSCADOR DEL MAPA (POR ENTER)
// ==========================================
window.buscarEnMapaEscritorio = function(e) {
    // CORRECCIÓN: Le quitamos el "window." a datosGlobalesActivos
    if (e.key !== 'Enter' || typeof datosGlobalesActivos === 'undefined' || !datosGlobalesActivos) return;
    
    const busqueda = e.target.value.toLowerCase().trim();
    if (!busqueda) return;

    const equipo = Object.values(datosGlobalesActivos).find(eq => 
        (eq.tag && eq.tag.toLowerCase().includes(busqueda)) ||
        (eq.nombre && eq.nombre.toLowerCase().includes(busqueda))
    );

    if (equipo && equipo.latitud && equipo.longitud) {
        window.mapa.flyTo([equipo.latitud, equipo.longitud], 18, { animate: true, duration: 1.5 });
    } else {
        alert(`⚠️ No se encontró ubicación guardada para "${busqueda}".`);
    }
};

// ==========================================
// FUNCIÓN: FILTRAR MAPA POR SEVERIDAD
// ==========================================
window.filtrarMapaPorSeveridad = function(severidad) {
    window.filtroActualMapa = severidad;

    // 1. Apagar visualmente todos los botones
    const botones = document.querySelectorAll('.btn-filtro-mapa');
    botones.forEach(btn => {
        btn.style.opacity = '0.4'; 
        btn.style.transform = 'scale(0.95)';
        btn.style.boxShadow = 'none';
        btn.style.background = btn.style.background.replace('0.2)', '0.1)'); // Bajar intensidad
    });

    // 2. Encender visualmente solo el botón presionado
    let idActivo = 'btn-filt-todos';
    if (severidad === 'Verde') idActivo = 'btn-filt-verde';
    if (severidad === 'Amarillo') idActivo = 'btn-filt-amarillo';
    if (severidad === 'Naranja') idActivo = 'btn-filt-naranja';
    if (severidad === 'Rojo') idActivo = 'btn-filt-rojo';

    const btnActivo = document.getElementById(idActivo);
    if (btnActivo) {
        btnActivo.style.opacity = '1';
        btnActivo.style.transform = 'scale(1.05)';
        btnActivo.style.boxShadow = `0 0 15px ${getComputedStyle(btnActivo).color}`;
        btnActivo.style.background = btnActivo.style.background.replace('0.1)', '0.2)');
    }

    // CORRECCIÓN: Volver a dibujar el mapa quitando el "window."
    if (typeof datosGlobalesActivos !== 'undefined' && datosGlobalesActivos) {
        window.actualizarPinesMapa(datosGlobalesActivos);
    }
};

// ==========================================
// FUNCIÓN: DIBUJAR PINES (CON FILTRO APLICADO)
// ==========================================
window.actualizarPinesMapa = function(datosActivos) {
    if (!window.mapa) return;

    window.capaMarcadores.clearLayers(); 

    if (!datosActivos) return;

    Object.keys(datosActivos).forEach(key => {
        const eq = datosActivos[key];
        
        const lat = eq.latitud;
        const lng = eq.longitud;

        if (lat !== undefined && lng !== undefined) {
            
            // SEGURO DE VIDA: Forzamos la primera letra mayúscula por si en la BD dice "rojo" en vez de "Rojo"
            let sev = eq.severidad || 'Verde';
            sev = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();

            // === APLICAR EL FILTRO MÁGICO ===
            if (window.filtroActualMapa !== 'TODOS' && sev !== window.filtroActualMapa) {
                return; // Si no es del color buscado, abortar dibujo
            }

            // Asignar el color exacto
            let colorPin = '#22c55e'; // Verde
            if (sev === 'Rojo') colorPin = '#ef4444';
            if (sev === 'Naranja') colorPin = '#f97316';
            if (sev === 'Amarillo') colorPin = '#eab308';

            const iconEquipo = L.divIcon({
                className: 'eq-pin-desktop',
                html: `<div style="background-color: ${colorPin}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${colorPin}; transition: 0.2s;"></div>`,
                iconSize: [14, 14]
            });

            // HTML del popup
            const htmlPopup = `
                <div style="font-family: 'Inter', sans-serif; text-align: center; min-width: 140px; padding: 5px;">
                    <strong style="color:#0f172a; font-size: 1.1rem; display:block;">${eq.nombre || eq.tag || 'Sin TAG'}</strong>
                    <span style="color:#64748b; font-size: 0.8rem; display:block; margin-bottom: 8px;">${eq.area || 'Área General'}</span>
                    
                    <span style="background: ${colorPin}22; color: ${colorPin}; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; border: 1px solid ${colorPin};">
                        ${sev.toUpperCase()}
                    </span>
                    
                    <br>
                    <button onclick="window.abrirModalEvidencia('${key}')" style="margin-top: 15px; background: #3b82f6; color: white; border: none; padding: 8px 12px; border-radius: 6px; width: 100%; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                        Abrir Expediente
                    </button>
                </div>
            `;

            const pin = L.marker([lat, lng], { icon: iconEquipo });
            pin.bindPopup(htmlPopup);
            
            // Efecto elegante: abrir globo con solo pasar el mouse por encima
            pin.on('mouseover', function(e) { this.openPopup(); });

            window.capaMarcadores.addLayer(pin); // Añadir el pin filtrado al mapa
        }
    });
};