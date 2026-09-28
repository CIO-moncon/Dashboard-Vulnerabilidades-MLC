let mapaGlobal = null;
let capaMarcadores = null;

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

    setTimeout(() => { mapaGlobal.invalidateSize(); }, 200);
});

// Función global llamada desde app.js
window.actualizarPinesMapa = function(alertas) {
    if (!mapaGlobal || !capaMarcadores) return;

    // Limpiamos los pines antiguos antes de dibujar
    capaMarcadores.clearLayers();

    alertas.forEach(alerta => {
        let colorHex = '#23d160'; 
        if (alerta.severidad === 'Rojo') colorHex = '#ff3860';
        if (alerta.severidad === 'Naranja') colorHex = '#fd7e14';
        if (alerta.severidad === 'Amarillo') colorHex = '#ffb300';

// --- LÓGICA DE UBICACIÓN AFINADA ---
        let baseLat, baseLng, spreadLat, spreadLng;
        const faenaInfo = (alerta.faena || '').toLowerCase();

        if (faenaInfo.includes('planta')) {
            // Zona de la Planta / Instalaciones (Círculo rojo al oeste del rajo)
            baseLat = -28.2965; 
            baseLng = -70.7940; 
            spreadLat = 0.002;  // Rango muy acotado para que caigan justo en la planta
            spreadLng = 0.002;
        } else if (faenaInfo.includes('mina') || faenaInfo.includes('rajo')) {
            // Zona del Rajo y botaderos (Centro/Este)
            baseLat = -28.3000;
            baseLng = -70.7820;
            spreadLat = 0.006;
            spreadLng = 0.008;
        } else {
            // Centro general por defecto
            baseLat = -28.298;
            baseLng = -70.785;
            spreadLat = 0.010;
            spreadLng = 0.010;
        }

        // Dispersión aleatoria dentro de las coordenadas específicas
        const lat = baseLat + (Math.random() - 0.5) * spreadLat;
        const lng = baseLng + (Math.random() - 0.5) * spreadLng;

        // Pin con efecto Neón mejorado
        const iconoPersonalizado = L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: ${colorHex}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.8); box-shadow: 0 0 10px ${colorHex}, 0 0 20px ${colorHex};"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7] // Centra el punto exacto
        });

        const marker = L.marker([lat, lng], { icon: iconoPersonalizado }).addTo(capaMarcadores);

        marker.bindPopup(`
            <div style="text-align: center; color: #1a1d20; font-family: 'Segoe UI', sans-serif;">
                <strong style="color: ${colorHex}; font-size: 1.1em;">${alerta.tag || 'SIN TAG'}</strong><br>
                <span style="font-size: 0.9em;">${alerta.faena || 'Área General'}</span><br>
                <div style="margin-top: 5px; font-size: 0.85em; font-weight: bold;">
                    Zona ISO 20816-3: ${alerta.severidad.toUpperCase()}
                </div>
            </div>
        `);
    });
};