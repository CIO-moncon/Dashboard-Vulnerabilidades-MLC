let mapaGlobal = null;
let capaMarcadores = null;
let filtroActualMapa = 'TODOS'; // Variable global para recordar qué filtro está activo

// Inicialización base del mapa
document.addEventListener('DOMContentLoaded', () => {
    const lat_MLC = -28.298; 
    const lng_MLC = -70.785;
    const zoomInicial = 14;

    mapaGlobal = L.map('mapa-gis').setView([lat_MLC, lng_MLC], zoomInicial);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    }).addTo(mapaGlobal);

    // Capa dedicada para los pines
    capaMarcadores = L.layerGroup().addTo(mapaGlobal);

    // Primer intento de ajuste rápido
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
    
    // Obtenemos todos los marcadores renderizados en el mapa (que ahora tienen la clase 'custom-pin')
    const marcadoresHTML = document.querySelectorAll('.custom-pin');
    
    marcadoresHTML.forEach(pin => {
        // Leemos el data-estado que inyectamos al crear el marcador
        const estadoPin = pin.getAttribute('data-estado');
        
        if (filtroActualMapa === 'TODOS') {
            pin.style.display = 'block';
        } else if (estadoPin.toUpperCase() === filtroActualMapa.toUpperCase()) {
            pin.style.display = 'block';
        } else {
            pin.style.display = 'none';
        }
    });
};

// ==========================================
// RENDERIZADO DE PINES Y ALERTAS
// ==========================================
window.actualizarPinesMapa = function(alertas) {
    if (!mapaGlobal || !capaMarcadores) return;

    // Limpiamos los pines antiguos antes de dibujar
    capaMarcadores.clearLayers();

    alertas.forEach(alerta => {
        let colorHex = '#23d160'; // Verde por defecto
        let severidadLogica = alerta.severidad || 'Verde';
        
        if (severidadLogica === 'Rojo') colorHex = '#ff3860';
        if (severidadLogica === 'Naranja') colorHex = '#fd7e14';
        if (severidadLogica === 'Amarillo') colorHex = '#ffb300';

        // --- LÓGICA DE UBICACIÓN AFINADA ---
        let baseLat, baseLng, spreadLat, spreadLng;
        const faenaInfo = (alerta.faena || '').toLowerCase();

        if (faenaInfo.includes('planta')) {
            baseLat = -28.2965; 
            baseLng = -70.7940; 
            spreadLat = 0.002;  
            spreadLng = 0.002;
        } else if (faenaInfo.includes('mina') || faenaInfo.includes('rajo')) {
            baseLat = -28.3000;
            baseLng = -70.7820;
            spreadLat = 0.006;
            spreadLng = 0.008;
        } else {
            baseLat = -28.298;
            baseLng = -70.785;
            spreadLat = 0.010;
            spreadLng = 0.010;
        }

        const lat = baseLat + (Math.random() - 0.5) * spreadLat;
        const lng = baseLng + (Math.random() - 0.5) * spreadLng;

        // Pin con efecto Neón mejorado Y AHORA CON EL ATRIBUTO "data-estado"
        const iconoPersonalizado = L.divIcon({
            // Es vital que el contenedor exterior tenga la clase custom-pin y el data-estado
            className: 'custom-pin', 
            html: `<div data-estado="${severidadLogica}" style="background-color: ${colorHex}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.8); box-shadow: 0 0 10px ${colorHex}, 0 0 20px ${colorHex};"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7] 
        });

        const marker = L.marker([lat, lng], { icon: iconoPersonalizado }).addTo(capaMarcadores);

        marker.bindPopup(`
            <div style="text-align: center; color: #1a1d20; font-family: 'Segoe UI', sans-serif;">
                <strong style="color: ${colorHex}; font-size: 1.1em;">${alerta.tag || 'SIN TAG'}</strong><br>
                <span style="font-size: 0.9em;">${alerta.faena || 'Área General'}</span><br>
                <div style="margin-top: 5px; font-size: 0.85em; font-weight: bold;">
                    Zona ISO 20816-3: ${severidadLogica.toUpperCase()}
                </div>
            </div>
        `);
    });
    
    // Al terminar de dibujar, aplicamos el filtro actual por si el usuario ya tenía uno seleccionado
    // Pequeño timeout para dar tiempo a Leaflet a inyectar el HTML en el DOM
    setTimeout(() => {
        filtrarMapa(filtroActualMapa);
    }, 100);
};