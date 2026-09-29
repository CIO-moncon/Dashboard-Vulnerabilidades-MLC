// ==========================================
// MÓDULO CIO: MAPA Y GEORREFERENCIA REAL
// ==========================================

let mapaGlobal = null;
let capaMarcadores = null;
let filtroActualMapa = 'TODOS'; // Variable global para recordar qué filtro está activo

// Inicialización base del mapa
document.addEventListener('DOMContentLoaded', () => {
    const lat_MLC = -28.298; 
    const lng_MLC = -70.785;
    const zoomInicial = 14;

    mapaGlobal = L.map('mapa-gis').setView([lat_MLC, lng_MLC], zoomInicial);
    
    // Exponemos el mapa a window para que la función de edición en app.js pueda usarlo
    window.mapa = mapaGlobal; 

    // Capa de vista satelital
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    }).addTo(mapaGlobal);

    // Capa dedicada para los pines
    capaMarcadores = L.layerGroup().addTo(mapaGlobal);

    // Ajuste rápido de carga
    setTimeout(() => { mapaGlobal.invalidateSize(); }, 200);
});

// ==========================================
// FIX ABSOLUTO: RECALCULAR TAMAÑO DEL MAPA
// ==========================================
window.addEventListener('load', function() {
    setTimeout(function() {
        if (mapaGlobal) {
            mapaGlobal.invalidateSize(); 
        }
    }, 500); 
});

window.addEventListener('resize', function() {
    setTimeout(function() {
        if (mapaGlobal) {
            mapaGlobal.invalidateSize();
        }
    }, 200);
});

// ==========================================
// LÓGICA DE FILTRADO DEL MAPA
// ==========================================
window.filtrarMapa = function(estadoDeseado) {
    filtroActualMapa = estadoDeseado;
    
    // Obtenemos todos los marcadores renderizados en el mapa
    const marcadoresHTML = document.querySelectorAll('.custom-pin');
    
    marcadoresHTML.forEach(pin => {
        const estadoPin = pin.getAttribute('data-estado');
        
        if (filtroActualMapa === 'TODOS') {
            pin.style.display = 'block';
        } else if (estadoPin && estadoPin.toUpperCase() === filtroActualMapa.toUpperCase()) {
            pin.style.display = 'block';
        } else {
            pin.style.display = 'none';
        }
    });
};

// ==========================================
// RENDERIZADO DE PINES Y ALERTAS (USANDO COORDENADAS DE FIREBASE)
// ==========================================
window.actualizarPinesMapa = function(activos) {
    // Si pasamos "activos" como un array (desde Firebase), lo iteramos. 
    // Si no hay mapa o activos, abortamos.
    if (!mapaGlobal || !capaMarcadores || !activos) return;

    // Limpiamos los pines antiguos antes de dibujar
    capaMarcadores.clearLayers();

    // Iteramos sobre los activos (equipos)
    Object.keys(activos).forEach(key => {
        const equipo = activos[key];
        
        // 1. Verificar si el equipo tiene coordenadas reales guardadas
        if (!equipo.latitud || !equipo.longitud) {
            // Si el equipo no tiene coordenadas, lo saltamos (no dibujamos pin falso)
            return; 
        }

        const lat = parseFloat(equipo.latitud);
        const lng = parseFloat(equipo.longitud);

        // 2. Determinar el color basado en la severidad del equipo
        let colorHex = '#23d160'; // Verde
        let severidadLogica = equipo.severidad || 'Verde';
        
        if (severidadLogica === 'Rojo') colorHex = '#ff3860';
        if (severidadLogica === 'Naranja') colorHex = '#fd7e14';
        if (severidadLogica === 'Amarillo') colorHex = '#ffb300';

        // 3. Crear el Pin con efecto Neón interactivo
        const iconoPersonalizado = L.divIcon({
            className: 'custom-pin', 
            // Inyectamos el 'data-estado' para que el filtro funcione y el onclick para abrir el modal
            html: `<div data-estado="${severidadLogica}" onclick="abrirModalEvidencia('${key}')" style="cursor: pointer; background-color: ${colorHex}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 0 10px ${colorHex}, 0 0 20px ${colorHex}; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8] 
        });

        // 4. Agregar el marcador al mapa
        const marker = L.marker([lat, lng], { icon: iconoPersonalizado }).addTo(capaMarcadores);

        // 5. Popup informativo (opcional, al pasar el mouse por encima)
        marker.bindPopup(`
            <div style="text-align: center; color: #1a1d20; font-family: 'Segoe UI', sans-serif;">
                <strong style="color: ${colorHex}; font-size: 1.1em;">${equipo.nombre || equipo.tag || 'SIN TAG'}</strong><br>
                <span style="font-size: 0.9em;">${equipo.tipo_equipo || 'Equipo General'}</span><br>
                <div style="margin-top: 5px; font-size: 0.85em; font-weight: bold;">
                    Salud Global: ${severidadLogica.toUpperCase()}
                </div>
            </div>
        `);
        
        // Hacemos que el popup se abra al pasar el mouse en lugar del clic
        marker.on('mouseover', function (e) { this.openPopup(); });
        marker.on('mouseout', function (e) { this.closePopup(); });
    });
    
    // Al terminar de dibujar, aplicamos el filtro actual por si el usuario ya tenía uno seleccionado
    setTimeout(() => {
        filtrarMapa(filtroActualMapa);
    }, 100);
};