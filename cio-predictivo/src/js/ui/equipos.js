// src/js/ui/equipos.js

export const PLANTILLAS_EQUIPOS = {
    "transportador": {
        nombre: "Transportador de Correa",
        componentesBase: [
            { id: "motor", nombre: "Motor Principal", icono: "settings" },
            { id: "reductor", nombre: "Reductor de Velocidad", icono: "settings_applications" }
        ],
        generadores: { poleas_izq: { prefijo: "Polea Izq", max: 11 }, poleas_der: { prefijo: "Polea Der", max: 11 } }
    },
    "beltfeeder": {
        nombre: "Belt Feeder (Alimentador)",
        componentesBase: [
            { id: "motor_elec", nombre: "Motor Eléctrico", icono: "settings" },
            { id: "bomba_hid", nombre: "Bomba Hidráulica", icono: "water_pump" },
            { id: "motor_hid", nombre: "Motor Hidráulico", icono: "settings_suggest" }
        ],
        generadores: { poleas_izq: { prefijo: "Estación Izq", max: 4 }, poleas_der: { prefijo: "Estación Der", max: 4 } }
    },
    "chancador_cono": {
        nombre: "Chancador de Cono",
        componentesBase: [
            { id: "motor", nombre: "Motor Principal", icono: "settings" },
            { id: "transmision", nombre: "Transmisión / Poleas", icono: "change_history" },
            { id: "contra_eje", nombre: "Contra-eje (Piñón)", icono: "settings_input_component" },
            { id: "excentrica", nombre: "Excéntrica", icono: "rotate_right" }
        ],
        generadores: {}
    },
    "hpgr": {
        nombre: "Prensa de Rodillos (HPGR)",
        componentesBase: [
            { id: "mot_fijo", nombre: "Motor Rodillo Fijo", icono: "settings" },
            { id: "red_fijo", nombre: "Reductor Rodillo Fijo", icono: "settings_applications" },
            { id: "rod_fijo", nombre: "Chumacera Rodillo Fijo", icono: "radio_button_checked" },
            { id: "mot_movil", nombre: "Motor Rodillo Móvil", icono: "settings" },
            { id: "red_movil", nombre: "Reductor Rodillo Móvil", icono: "settings_applications" },
            { id: "rod_movil", nombre: "Chumacera Rodillo Móvil", icono: "radio_button_unchecked" }
        ],
        generadores: {}
    },
    "harnero": {
        nombre: "Harnero Vibratorio",
        componentesBase: [
            { id: "motor", nombre: "Motor de Accionamiento", icono: "settings" },
            { id: "exc_izq", nombre: "Mecanismo Excitador Izq", icono: "vibration" },
            { id: "exc_der", nombre: "Mecanismo Excitador Der", icono: "vibration" }
        ],
        generadores: {}
    },
    "colector_polvo": {
        nombre: "Colector de Polvo / Extractor",
        componentesBase: [
            { id: "motor", nombre: "Motor Eléctrico", icono: "settings" },
            { id: "chumacera_ac", nombre: "Chumacera Lado Acople", icono: "linear_scale" },
            { id: "chumacera_li", nombre: "Chumacera Lado Libre", icono: "linear_scale" },
            { id: "ventilador", nombre: "Ventilador / Impulsor", icono: "air" }
        ],
        generadores: {}
    },
    "bomba_centrifuga": {
        nombre: "Bomba Centrífuga",
        componentesBase: [
            { id: "motor", nombre: "Motor Principal", icono: "settings" },
            { id: "bomba", nombre: "Bomba", icono: "water_motor" }
        ],
        generadores: {}
    }
};

export function initEquiposModal() {
    
    const selectTipo = document.getElementById('eq-tipo');
    if (selectTipo) {
        selectTipo.innerHTML = '<option value="">Seleccione tipo...</option>';
        Object.keys(PLANTILLAS_EQUIPOS).forEach(key => {
            selectTipo.innerHTML += `<option value="${key}">${PLANTILLAS_EQUIPOS[key].nombre}</option>`;
        });

        // Este es el OÍDO que genera el árbol cuando cambias el tipo
        selectTipo.addEventListener('change', (e) => {
            window.generarArbolDinamico(e.target.value);
        });
    }

    window.generarArbolDinamico = (tipo) => {
        const contenedor = document.getElementById('contenedor-arbol-componentes');
        
        if (!tipo || !PLANTILLAS_EQUIPOS[tipo]) {
            contenedor.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">Seleccione una plantilla arriba para generar el árbol.</p>';
            return;
        }

        const plantilla = PLANTILLAS_EQUIPOS[tipo];
        let htmlArbol = '';

        plantilla.componentesBase.forEach(comp => {
            htmlArbol += crearHTMLComponente(comp.id, comp.nombre, comp.icono);
        });

        const izq = plantilla.generadores?.poleas_izq;
        const der = plantilla.generadores?.poleas_der;

        if (izq && der) {
            const maximoPoleas = Math.max(izq.max, der.max);
            for (let i = 1; i <= maximoPoleas; i++) {
                htmlArbol += `
                    <div id="par_polea_${i}" data-indice="${i}" class="par-estacion" style="display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px dashed var(--border-glass);">
                        <div style="font-size: 0.75rem; color: var(--accent-blue); font-weight: bold; display: flex; justify-content: space-between; align-items: center; padding: 0 5px;">
                            <span>Estación #${i}</span>
                            <button onclick="window.cortarDesdeEstacion(${i})" style="background: transparent; border: none; color: var(--status-critico); cursor: pointer; font-size: 0.75rem; font-weight: bold;">
                                ✂️ Cortar línea aquí
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            ${crearInputComponente(`pi_${i}`, `${izq.prefijo}${i}`, "adjust")}
                            ${crearInputComponente(`pd_${i}`, `${der.prefijo}${i}`, "adjust")}
                        </div>
                    </div>
                `;
            }
        }
        contenedor.innerHTML = htmlArbol;
    };

    window.eliminarRama = (idElemento) => {
        const elemento = document.getElementById(idElemento);
        if(elemento) elemento.remove();
    };

    window.cortarDesdeEstacion = (indiceActual) => {
        document.querySelectorAll('.par-estacion').forEach(estacion => {
            if (parseInt(estacion.getAttribute('data-indice')) >= indiceActual) estacion.remove();
        });
    };
}

function crearHTMLComponente(id, nombre, icono) {
    return `
        <div id="rama-${id}" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-panel-hover); padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border-glass);">
            <div style="display: flex; align-items: center; gap: 10px; width: 80%;">
                <span class="material-symbols-outlined" style="color: var(--text-muted); font-size: 18px;">${icono}</span>
                <input type="text" value="${nombre}" style="background: transparent; border: none; color: var(--text-main); font-weight: 600; width: 100%; outline: none;">
            </div>
            <button onclick="window.eliminarRama('rama-${id}')" style="background: transparent; border: none; color: var(--status-critico); cursor: pointer; padding: 5px;">
                <span class="material-symbols-outlined" style="font-size: 20px;">delete</span>
            </button>
        </div>
    `;
}

function crearInputComponente(id, nombre, icono) {
    return `
        <div id="rama-${id}" style="display: flex; align-items: center; background: var(--bg-panel-hover); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-glass);">
            <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                <span class="material-symbols-outlined" style="color: var(--text-muted); font-size: 16px;">${icono}</span>
                <input type="text" value="${nombre}" style="background: transparent; border: none; color: var(--text-main); font-size: 0.85rem; font-weight: 600; width: 100%; outline: none;">
            </div>
        </div>
    `;
}