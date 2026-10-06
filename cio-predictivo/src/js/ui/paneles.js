// src/js/ui/panel.js

export function inicializarPaneles() {
    // Lógica adicional de inicialización de paneles si la necesitas
    console.log("Módulo de paneles cargado.");
}

// Colocamos la función en window para que el onclick del HTML la reconozca
window.cambiarPestañaLateral = function(vista, btnElement) {
    // 1. Manejo de botones activos
    document.querySelectorAll('.panel-tabs .tab-btn').forEach(b => b.classList.remove('activo'));
    if (btnElement) btnElement.classList.add('activo');

    // 2. Mostrar/Ocultar contenedores
    if (vista === 'catastro') {
        document.getElementById('lista-activos').style.display = 'block';
        document.getElementById('panel-alertas-terreno').style.display = 'none';
    } else if (vista === 'alertas') {
        document.getElementById('lista-activos').style.display = 'none';
        document.getElementById('panel-alertas-terreno').style.display = 'block';
    }
}