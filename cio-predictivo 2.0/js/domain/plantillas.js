// ============================================================================
// MÓDULO DOMAIN: PLANTILLAS Y ESTRUCTURAS CINEMÁTICAS CBM (MINA LOS COLORADOS)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Inmutabilidad Deep-Freeze y Resolución O(1)
// ============================================================================

/**
 * Función auxiliar para congelar objetos en profundidad (Deep Freeze)
 */
const deepFreeze = (obj) => {
    Object.keys(obj).forEach((prop) => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// ----------------------------------------------------------------------------
// GENERADORES AUXILIARES DE COMPONENTES ESTÁNDAR
// ----------------------------------------------------------------------------
const motorElectricoEstandar = Object.freeze({
    id: 'motor',
    nombre: 'Motor Eléctrico Principal',
    icono: 'electric_bolt',
    spots: Object.freeze(['M1', 'M2'])
});

const generarPoleas = (cantidad) => {
    const spots = [];
    for (let i = 1; i <= cantidad; i++) {
        spots.push(`PL${i}_LI`, `PL${i}_LD`);
    }
    return Object.freeze(spots);
};

const generarReductores = (cantidad) => {
    const spots = [];
    for (let i = 1; i <= cantidad; i++) {
        spots.push(`G${i}`);
    }
    return Object.freeze(spots);
};

// ----------------------------------------------------------------------------
// MATRIZ CINEMÁTICA CANÓNICA DE ACTIVOS CRÍTICOS (MLC)
// ----------------------------------------------------------------------------
export const ESTRUCTURAS_MLC = deepFreeze({
    // Beltfeeders
    beltfeeder_pesado: {
        nombre: 'Beltfeeder Pesado (Ejes Múltiples)',
        familia: 'Alimentación',
        icono: 'conveyor_belt',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductor_10ejes',
                nombre: 'Reductor Multieje',
                icono: 'settings',
                spots: generarReductores(10)
            },
            {
                id: 'poleas',
                nombre: 'Conjunto de Poleas',
                icono: 'radio_button_checked',
                spots: generarPoleas(2)
            }
        ]
    },
    beltfeeder_estandar: {
        nombre: 'Beltfeeder Hidráulico Estándar',
        familia: 'Alimentación',
        icono: 'conveyor_belt',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'bombas_hidraulicas',
                nombre: 'Bombas Hidráulicas',
                icono: 'water_pump',
                spots: ['P1', 'P2']
            },
            {
                id: 'motores_hidraulicos',
                nombre: 'Motores Hidráulicos',
                icono: 'speed',
                spots: ['MH1', 'MH2']
            },
            {
                id: 'poleas',
                nombre: 'Poleas Motrices y Retorno',
                icono: 'radio_button_checked',
                spots: generarPoleas(2)
            }
        ]
    },

    // Chancado
    chancador: {
        nombre: 'Chancador de Cono / Mandíbula',
        familia: 'Chancado',
        icono: 'precision_manufacturing',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'contraeje',
                nombre: 'Conjunto Contraeje',
                icono: 'sync_alt',
                spots: ['C1', 'C2']
            }
        ]
    },

    // Transporte y Correas Overland
    transportador: {
        nombre: 'Correa Transportadora / Overland',
        familia: 'Transporte',
        icono: 'conveyor_belt',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductor',
                nombre: 'Reductor Principal',
                icono: 'settings',
                spots: generarReductores(10)
            },
            {
                id: 'poleas',
                nombre: 'Poleas de Cabeza, Cola y Tensor',
                icono: 'radio_button_checked',
                spots: generarPoleas(11)
            }
        ]
    },

    // Clasificación y Harneros
    harnero_secundario: {
        nombre: 'Harnero Secundario / Criba Vibratoria',
        familia: 'Harneros',
        icono: 'grid_view',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'descansos_mecanicos',
                nombre: 'Descansos Mecánicos',
                icono: 'album',
                spots: ['D1', 'D2', 'D3', 'D4']
            }
        ]
    },
    harnero_terciario: {
        nombre: 'Harnero Terciario Exitatriz',
        familia: 'Harneros',
        icono: 'grid_view',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'descansos',
                nombre: 'Descansos Base',
                icono: 'album',
                spots: ['D1', 'D2']
            },
            {
                id: 'exitatrices',
                nombre: 'Mecanismo Exitatriz Motriz y Flotante',
                icono: 'vibration',
                spots: ['EX_LM_SUP', 'EX_LM_INF', 'EX_LF_SUP', 'EX_LF_INF']
            }
        ]
    },

    // Distribución y Apilamiento
    tripper: {
        nombre: 'Carro Tripper Distribuidor',
        familia: 'Transporte',
        icono: 'swap_horiz',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductor',
                nombre: 'Reductores de Traslación',
                icono: 'settings',
                spots: generarReductores(10)
            },
            {
                id: 'poleas',
                nombre: 'Poleas de Descarga',
                icono: 'radio_button_checked',
                spots: generarPoleas(2)
            }
        ]
    },
    grasshopper: {
        nombre: 'Correa Móvil Grasshopper',
        familia: 'Transporte',
        icono: 'linear_scale',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductor',
                nombre: 'Reductor',
                icono: 'settings',
                spots: generarReductores(6)
            },
            {
                id: 'poleas',
                nombre: 'Poleas Motrices y Deflectoras',
                icono: 'radio_button_checked',
                spots: generarPoleas(2)
            }
        ]
    },
    modulo: {
        nombre: 'Módulo de Lixiviación / Apilamiento',
        familia: 'Lixiviación',
        icono: 'view_module',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductor',
                nombre: 'Reductor Modular',
                icono: 'settings',
                spots: generarReductores(6)
            },
            {
                id: 'poleas',
                nombre: 'Poleas de Módulo',
                icono: 'radio_button_checked',
                spots: generarPoleas(4)
            }
        ]
    },

    // Equipos Auxiliares y Molienda
    prensa: {
        nombre: 'Prensa de Rodillos / Rodillos HPGR',
        familia: 'Molienda',
        icono: 'compress',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'reductores',
                nombre: 'Reductor y Engranajes',
                icono: 'settings',
                spots: ['G1', 'C1', 'C2']
            },
            {
                id: 'descanso',
                nombre: 'Descanso de Rodillo',
                icono: 'album',
                spots: ['D1']
            }
        ]
    },
    colector: {
        nombre: 'Colector de Polvo / Ventilador',
        familia: 'Servicios',
        icono: 'mode_fan',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'descansos',
                nombre: 'Descansos de Eje',
                icono: 'album',
                spots: ['D1', 'D2', 'D3']
            }
        ]
    },
    alimentador: {
        nombre: 'Alimentador Vibratorio',
        familia: 'Alimentación',
        icono: 'density_medium',
        nodos: [
            motorElectricoEstandar,
            {
                id: 'descansos',
                nombre: 'Descansos Excéntricos',
                icono: 'album',
                spots: ['D1', 'D2']
            }
        ]
    }
});

// ----------------------------------------------------------------------------
// SERVICIOS DE CONSULTA Y RESOLUCIÓN CINEMÁTICA
// ----------------------------------------------------------------------------

/**
 * Resuelve la plantilla de estructura a partir del nombre o tipo de activo.
 * @param {string} tipoStr - Cadena representativa (ej: 'Belt Feeder', 'Chancador Cono').
 * @returns {object|null} Estructura cinemática inmutable o null si no existe.
 */
export const obtenerEstructuraMLC = (tipoStr = '') => {
    const t = String(tipoStr).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!t) return null;

    if (t.includes('terciario') || t.includes('exitatriz')) return ESTRUCTURAS_MLC.harnero_terciario;
    if (t.includes('harnero') || t.includes('criba')) return ESTRUCTURAS_MLC.harnero_secundario;
    if (t.includes('transportador') || t.includes('correa overland') || t.includes('overland')) return ESTRUCTURAS_MLC.transportador;
    if (t.includes('tripper')) return ESTRUCTURAS_MLC.tripper;
    if (t.includes('beltfeeder') || t.includes('belt feeder')) {
        return (t.includes('pesado') || t.includes('multiple')) 
            ? ESTRUCTURAS_MLC.beltfeeder_pesado 
            : ESTRUCTURAS_MLC.beltfeeder_estandar;
    }
    if (t.includes('prensa') || t.includes('rodillo')) return ESTRUCTURAS_MLC.prensa;
    if (t.includes('colector') || t.includes('polvo') || t.includes('ventilador')) return ESTRUCTURAS_MLC.colector;
    if (t.includes('alimentador') || t.includes('vibratorio')) return ESTRUCTURAS_MLC.alimentador;
    if (t.includes('chancador') || t.includes('trituradora') || t.includes('cono')) return ESTRUCTURAS_MLC.chancador;
    if (t.includes('modulo')) return ESTRUCTURAS_MLC.modulo;
    if (t.includes('grasshopper')) return ESTRUCTURAS_MLC.grasshopper;

    return null;
};

/**
 * Devuelve un arreglo plano con todos los spots normativos de una máquina.
 * @param {string} tipoStr
 * @returns {string[]} Lista de códigos de puntos (ej: ['M1', 'M2', 'G1'...])
 */
export const obtenerSpotsEstructura = (tipoStr = '') => {
    const estructura = obtenerEstructuraMLC(tipoStr);
    if (!estructura) return [];

    const lista = [];
    for (const nodo of estructura.nodos) {
        lista.push(...nodo.spots);
    }
    return lista;
};

/**
 * Identifica a qué nodo físico pertenece un spot dentro de la estructura.
 * @param {string} tipoStr
 * @param {string} spotCodigo
 * @returns {object|null} Nodo contenedor con id, nombre e icono.
 */
export const obtenerNodoDeSpot = (tipoStr = '', spotCodigo = '') => {
    const estructura = obtenerEstructuraMLC(tipoStr);
    if (!estructura || !spotCodigo) return null;

    const spotBuscado = spotCodigo.toUpperCase().trim();
    for (const nodo of estructura.nodos) {
        if (nodo.spots.includes(spotBuscado)) {
            return {
                id: nodo.id,
                nombre: nodo.nombre,
                icono: nodo.icono
            };
        }
    }
    return null;
};