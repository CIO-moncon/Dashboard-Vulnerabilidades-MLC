// src/js/ui/mapa.js

export let mapaPrincipal; 

export function initMapa() {
    const contenedorMapa = document.getElementById('mapa-principal');
    if (!contenedorMapa) return;

    // Inicializar el mapa de Leaflet
    mapaPrincipal = L.map('mapa-principal', {
        zoomControl: false
    }).setView([-28.290543, -70.812849], 16);

    // Reposicionar el control de zoom abajo a la derecha
    L.control.zoom({ position: 'bottomright' }).addTo(mapaPrincipal);

    // Capa Satelital Híbrida (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 18
    }).addTo(mapaPrincipal);

    // MAGIA NUCLEAR: Obligamos a Leaflet a recalcular sus dimensiones después de cargar
    setTimeout(() => {
        mapaPrincipal.invalidateSize();
    }, 500);

    // Por si cambias el tamaño de la ventana del navegador
    window.addEventListener('resize', () => {
        mapaPrincipal.invalidateSize();
    });

    console.log("🗺️ Módulo de Mapa Satelital cargado y anclado.");
}