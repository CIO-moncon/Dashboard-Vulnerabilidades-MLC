// src/js/api/clima.js

// Traductor de códigos meteorológicos a Iconos Material de Google
function obtenerIconoClima(codigoWMO) {
    if (codigoWMO === 0) return { icono: 'sunny', color: '#fbbf24' }; // Despejado
    if (codigoWMO >= 1 && codigoWMO <= 3) return { icono: 'partly_cloudy_day', color: '#94a3b8' }; // Nubosidad parcial a nublado
    if (codigoWMO >= 45 && codigoWMO <= 48) return { icono: 'foggy', color: '#cbd5e1' }; // Niebla
    if ((codigoWMO >= 51 && codigoWMO <= 67) || (codigoWMO >= 80 && codigoWMO <= 82)) return { icono: 'rainy', color: '#60a5fa' }; // Lluvia
    if ((codigoWMO >= 71 && codigoWMO <= 77) || codigoWMO === 85 || codigoWMO === 86) return { icono: 'ac_unit', color: '#bae6fd' }; // Nieve
    if (codigoWMO >= 95) return { icono: 'thunderstorm', color: '#818cf8' }; // Tormenta
    return { icono: 'cloud', color: '#94a3b8' }; // Por defecto
}

export async function initClimaWidget() {
    const contenedor = document.getElementById('widget-clima-container');
    if (!contenedor) return;

    // Inyectar HTML Base
    contenedor.innerHTML = `
        <div id="clima-wrapper" style="position: relative; cursor: default;">
            <button class="btn-clima" id="btn-clima-live" style="background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border-glass); padding: 8px 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600;">
                <span class="material-symbols-outlined" style="animation: spin 2s linear infinite;">sync</span> Cargando...
            </button>
            
            <div id="panel-clima-extendido" style="display: none; position: absolute; top: calc(100% + 12px); right: 0; width: 360px; z-index: 1000; background: color-mix(in srgb, var(--bg-panel) 85%, transparent); backdrop-filter: blur(16px); border: 1px solid var(--border-glass); border-radius: 12px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
                <h3 style="margin: 0 0 5px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 5px;">
                    <span class="material-symbols-outlined" style="color: var(--status-alarma);">location_on</span> Vallenar, Chile
                </h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 15px 0;">Pronóstico a 5 días (Mina Los Colorados)</p>
                <div id="pronostico-dias" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;"></div>
            </div>
        </div>
    `;

    const btnClima = document.getElementById('btn-clima-live');
    const panelExtendido = document.getElementById('panel-clima-extendido');
    const wrapper = document.getElementById('clima-wrapper');

    wrapper.addEventListener('mouseenter', () => panelExtendido.style.display = 'block');
    wrapper.addEventListener('mouseleave', () => panelExtendido.style.display = 'none');

    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-28.57&longitude=-70.76&daily=weathercode,temperature_2m_max,temperature_2m_min&current_weather=true&timezone=America%2FSantiago');
        const data = await res.json();
        
        // Configurar el botón principal con el icono actual
        const climaActual = obtenerIconoClima(data.current_weather.weathercode);
        btnClima.innerHTML = `<span class="material-symbols-outlined" style="color: ${climaActual.color};">${climaActual.icono}</span> ${Math.round(data.current_weather.temperature)}°C Vallenar`;
        
        // Generar los 5 días
        let htmlDias = '';
        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        for(let i=0; i<5; i++) {
            const fechaObj = new Date(data.daily.time[i] + 'T12:00:00');
            const max = Math.round(data.daily.temperature_2m_max[i]);
            const min = Math.round(data.daily.temperature_2m_min[i]);
            const climaDia = obtenerIconoClima(data.daily.weathercode[i]);
            
            htmlDias += `
                <div style="text-align: center; background: color-mix(in srgb, var(--bg-panel-hover) 60%, transparent); border: 1px solid var(--border-glass); padding: 10px 5px; border-radius: 8px;">
                    <p style="margin: 0; font-size: 0.75rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">${diasSemana[fechaObj.getDay()]}</p>
                    <span class="material-symbols-outlined" style="font-size: 28px; margin: 8px 0; color: ${climaDia.color};">${climaDia.icono}</span>
                    <p style="margin: 0; font-weight: 800; font-size: 1.1rem; color: var(--text-main);">${max}°</p>
                    <p style="margin: 0; font-size: 0.8rem; font-weight: 600; color: var(--primary);">${min}°</p>
                </div>
            `;
        }
        document.getElementById('pronostico-dias').innerHTML = htmlDias;
        
    } catch(e) {
        btnClima.innerHTML = `<span class="material-symbols-outlined">cloud_off</span> Offline`;
    }
}