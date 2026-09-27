// Esperar a que el HTML cargue completamente antes de iniciar el mapa
document.addEventListener('DOMContentLoaded', () => {
    
    // Coordenadas centrales de Mina Los Colorados (Aproximado)
    const lat_MLC = -28.298; 
    const lng_MLC = -70.785;
    const zoomInicial = 14;

    // 1. Inicializar el mapa en el contenedor con id="mapa-gis"
    const map = L.map('mapa-gis').setView([lat_MLC, lng_MLC], zoomInicial);

    // 2. Agregar la Capa Satelital (Usamos Esri World Imagery porque es gratuita y de altísima resolución)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, and the GIS User Community',
        maxZoom: 19
    }).addTo(map);

    // 3. Crear un Marcador de prueba (Simulando un equipo crítico)
    const marcadorPrueba = L.marker([lat_MLC, lng_MLC]).addTo(map);
    marcadorPrueba.bindPopup(`
        <div style="text-align: center;">
            <strong style="color: #ff3860; font-size: 1.1em;">Chancador Primario</strong><br>
            Alarma de Vibración - Zona C<br>
            <a href="#" style="color: #0056b3; font-weight: bold; text-decoration: none;">Ver Análisis RMS</a>
        </div>
    `);

    // Forzar al mapa a recalcular su tamaño (vital cuando se usa en un grid CSS)
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

});