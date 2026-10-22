// ============================================================================
// MÓDULO DOMAIN: PLANTILLAS Y ESTRUCTURAS CINEMÁTICAS CBM (MINA LOS COLORADOS)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Inmutabilidad Deep-Freeze y Resolución O(1)
// ============================================================================

const deepFreeze = (obj) => {
    Object.keys(obj).forEach((prop) => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

const motorElectricoEstandar = Object.freeze({
    id: 'motor',
    nombre: 'Motor Eléctrico Principal',
    icono: 'electric_bolt',
    spots: Object.freeze(['M1', 'M2'])
});

export const generarPoleasDinamicas = (cantidadPares) => {
    const spots = [];
    for (let i = 1; i <= cantidadPares; i++) {
        spots.push(`PL${i}_LI`, `PL${i}_LD`);
    }
    return spots;
};

export const generarReductoresDinamicos = (cantidadEjes) => {
    const spots = [];
    for (let i = 1; i <= cantidadEjes; i++) {
        spots.push(`G${i}`);
    }
    return spots;
};

export const ESTRUCTURAS_MLC = deepFreeze({
    beltfeeder_pesado: {
        nombre: 'Beltfeeder Pesado (Ejes Múltiples)',
        familia: 'Alimentación',
        icono: 'conveyor_belt',
        nodos: [motorElectricoEstandar, { id: 'reductor_multieje', nombre: 'Reductor Multieje', icono: 'settings', spots: generarReductoresDinamicos(10) }, { id: 'poleas', nombre: 'Conjunto de Poleas', icono: 'radio_button_checked', spots: generarPoleasDinamicas(2) }]
    },
    beltfeeder_estandar: {
        nombre: 'Beltfeeder Hidráulico Estándar',
        familia: 'Alimentación',
        icono: 'conveyor_belt',
        nodos: [motorElectricoEstandar, { id: 'bombas', nombre: 'Bombas Hidráulicas', icono: 'water_pump', spots: ['P1', 'P2'] }, { id: 'motores', nombre: 'Motores Hidráulicos', icono: 'speed', spots: ['MH1', 'MH2'] }, { id: 'poleas', nombre: 'Poleas Motrices y Retorno', icono: 'radio_button_checked', spots: generarPoleasDinamicas(2) }]
    },
    chancador_primario: {
        nombre: 'Chancador Primario',
        familia: 'Chancado',
        icono: 'precision_manufacturing',
        nodos: [motorElectricoEstandar, { id: 'contraeje', nombre: 'Conjunto Contraeje', icono: 'sync_alt', spots: ['C1', 'C2'] }]
    },
    chancador_secundario: {
        nombre: 'Chancador Secundario',
        familia: 'Chancado',
        icono: 'precision_manufacturing',
        nodos: [motorElectricoEstandar, { id: 'contraeje', nombre: 'Conjunto Contraeje', icono: 'sync_alt', spots: ['C1', 'C2'] }]
    },
    chancador_terciario: {
        nombre: 'Chancador Terciario',
        familia: 'Chancado',
        icono: 'precision_manufacturing',
        nodos: [motorElectricoEstandar, { id: 'contraeje', nombre: 'Conjunto Contraeje', icono: 'sync_alt', spots: ['C1', 'C2'] }]
    },
    transportador: {
        nombre: 'Correa Transportadora / Overland',
        familia: 'Transporte',
        icono: 'conveyor_belt',
        nodos: [
            motorElectricoEstandar,
            { id: 'reductor', nombre: 'Reductor Principal', icono: 'settings', spots: generarReductoresDinamicos(6) },
            { id: 'poleas', nombre: 'Poleas de Cabeza y Cola', icono: 'radio_button_checked', spots: generarPoleasDinamicas(2) }
        ]
    },
    harnero_secundario: {
        nombre: 'Harnero Secundario / Criba Vibratoria',
        familia: 'Harneros',
        icono: 'grid_view',
        nodos: [motorElectricoEstandar, { id: 'descansos', nombre: 'Descansos Mecánicos', icono: 'album', spots: ['D1', 'D2', 'D3', 'D4'] }]
    },
    harnero_terciario: {
        nombre: 'Harnero Terciario Exitatriz',
        familia: 'Harneros',
        icono: 'grid_view',
        nodos: [motorElectricoEstandar, { id: 'descansos', nombre: 'Descansos Base', icono: 'album', spots: ['D1', 'D2'] }, { id: 'exitatrices', nombre: 'Exitatriz Motriz y Flotante', icono: 'vibration', spots: ['EX_LM_SUP', 'EX_LM_INF', 'EX_LF_SUP', 'EX_LF_INF'] }]
    },
    tripper: {
        nombre: 'Carro Tripper Distribuidor',
        familia: 'Transporte',
        icono: 'swap_horiz',
        nodos: [motorElectricoEstandar, { id: 'reductor', nombre: 'Reductores de Traslación', icono: 'settings', spots: generarReductoresDinamicos(4) }, { id: 'poleas', nombre: 'Poleas de Descarga', icono: 'radio_button_checked', spots: generarPoleasDinamicas(2) }]
    },
    prensa: {
        nombre: 'Prensa de Rodillos / Rodillos HPGR',
        familia: 'Molienda',
        icono: 'compress',
        nodos: [motorElectricoEstandar, { id: 'reductores', nombre: 'Reductor y Engranajes', icono: 'settings', spots: ['G1', 'C1', 'C2'] }, { id: 'descanso', nombre: 'Descanso de Rodillo', icono: 'album', spots: ['D1'] }]
    },
    colector: {
        nombre: 'Colector de Polvo / Ventilador',
        familia: 'Servicios',
        icono: 'mode_fan',
        nodos: [motorElectricoEstandar, { id: 'descansos', nombre: 'Descansos de Eje', icono: 'album', spots: ['D1', 'D2', 'D3'] }]
    }
});

export const obtenerEstructuraMLC = (tipoStr = '') => {
    const t = String(tipoStr).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!t) return null;

    if (t.includes('chancador primario')) return ESTRUCTURAS_MLC.chancador_primario;
    if (t.includes('chancador secundario')) return ESTRUCTURAS_MLC.chancador_secundario;
    if (t.includes('chancador terciario')) return ESTRUCTURAS_MLC.chancador_terciario;
    if (t.includes('terciario') || t.includes('exitatriz')) return ESTRUCTURAS_MLC.harnero_terciario;
    if (t.includes('harnero') || t.includes('criba')) return ESTRUCTURAS_MLC.harnero_secundario;
    if (t.includes('transportador') || t.includes('correa')) return ESTRUCTURAS_MLC.transportador;
    if (t.includes('tripper')) return ESTRUCTURAS_MLC.tripper;
    if (t.includes('beltfeeder pesado')) return ESTRUCTURAS_MLC.beltfeeder_pesado;
    if (t.includes('beltfeeder')) return ESTRUCTURAS_MLC.beltfeeder_estandar;
    if (t.includes('prensa') || t.includes('hpgr')) return ESTRUCTURAS_MLC.prensa;
    if (t.includes('colector') || t.includes('ventilador')) return ESTRUCTURAS_MLC.colector;

    return ESTRUCTURAS_MLC.transportador;
};

export const obtenerSpotsEstructura = (tipoStr = '') => {
    const estructura = obtenerEstructuraMLC(tipoStr);
    if (!estructura) return [];
    const lista = [];
    for (const nodo of estructura.nodos) {
        lista.push(...nodo.spots);
    }
    return lista;
};