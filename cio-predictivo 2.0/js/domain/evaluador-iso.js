// ============================================================================
// MÓDULO DOMAIN: EVALUADOR NORMATIVO ISO 20816-3 (VIBRACIÓN MECÁNICA CBM)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Tabla Hash Inmutable O(1) y Sanitización
// ============================================================================

/**
 * Matriz inmutable de límites de severidad según norma ISO 20816-3 (mm/s RMS).
 * - Grupo 1: Máquinas grandes (> 300 kW hasta 50 MW, ej. chancadores, molinos, motores H >= 315mm).
 * - Grupo 2: Máquinas medianas (15 kW a 300 kW, motores 160mm <= H < 315mm).
 * - Soportes: Rígido vs Flexible.
 */
const MATRIZ_LIMITES_ISO = Object.freeze({
    'grupo1_rigido': Object.freeze({ b: 2.3, c: 4.5, d: 7.1 }),
    'grupo1_flexible': Object.freeze({ b: 3.5, c: 7.1, d: 11.0 }),
    'grupo2_rigido': Object.freeze({ b: 1.4, c: 2.8, d: 4.5 }),
    'grupo2_flexible': Object.freeze({ b: 2.3, c: 4.5, d: 7.1 })
});

/**
 * Definición estandarizada de zonas de severidad operativa ISO
 */
const ZONAS_ISO = Object.freeze({
    A: Object.freeze({
        zona: 'A',
        estado: 'Óptimo (Buena)',
        nivelSeveridad: 1,
        colorHex: '#10b981',
        color: 'var(--iso-zona-a, #10b981)',
        cls: 'zona-a'
    }),
    B: Object.freeze({
        zona: 'B',
        estado: 'Aceptable (Operación sin restricción)',
        nivelSeveridad: 2,
        colorHex: '#84cc16',
        color: 'var(--iso-zona-b, #84cc16)',
        cls: 'zona-b'
    }),
    C: Object.freeze({
        zona: 'C',
        estado: 'Alarma (Operación restringida)',
        nivelSeveridad: 3,
        colorHex: '#f59e0b',
        color: 'var(--iso-zona-c, #f59e0b)',
        cls: 'zona-c'
    }),
    D: Object.freeze({
        zona: 'D',
        estado: 'Peligro (Condición crítica / Daño)',
        nivelSeveridad: 4,
        colorHex: '#ef4444',
        color: 'var(--iso-zona-d, #ef4444)',
        cls: 'zona-d'
    }),
    SIN_DATOS: Object.freeze({
        zona: 'S/D',
        estado: 'Sin Datos',
        nivelSeveridad: 0,
        colorHex: '#94a3b8',
        color: 'var(--text-muted, #94a3b8)',
        cls: 'sin-datos'
    })
});

/**
 * Evalúa el nivel de severidad vibratoria según norma ISO 20816-3.
 * 
 * @param {number|string} rms - Valor de vibración global en mm/s RMS.
 * @param {string} [grupo='grupo1'] - 'grupo1' (grandes) o 'grupo2' (medianas).
 * @param {string} [soporte='rigido'] - 'rigido' o 'flexible'.
 * @returns {object} Objeto con zona, estado, colores y clase CSS.
 */
export const evaluarISO20816 = (rms, grupo = 'grupo1', soporte = 'rigido') => {
    const valorNumerico = Number.parseFloat(rms);

    if (!Number.isFinite(valorNumerico) || valorNumerico < 0) {
        return { ...ZONAS_ISO.SIN_DATOS, rmsEvaluado: 0 };
    }

    const claveNormativa = `${String(grupo).toLowerCase()}_${String(soporte).toLowerCase()}`;
    const limites = MATRIZ_LIMITES_ISO[claveNormativa] ?? MATRIZ_LIMITES_ISO['grupo1_rigido'];

    let zonaClave = 'D';
    if (valorNumerico <= limites.b) {
        zonaClave = 'A';
    } else if (valorNumerico <= limites.c) {
        zonaClave = 'B';
    } else if (valorNumerico <= limites.d) {
        zonaClave = 'C';
    }

    return {
        ...ZONAS_ISO[zonaClave],
        rmsEvaluado: Number(valorNumerico.toFixed(2)),
        limitesAplicados: limites
    };
};

/**
 * Calcula el estado de salud crítico del activo a partir de un arreglo de lecturas RMS.
 * Optimizado en O(n) sin utilizar el operador spread (...) para evitar desbordamiento de pila.
 * 
 * @param {Array<number|string|object>} valoresRms - Arreglo de lecturas o puntos.
 * @param {string} [grupo='grupo1']
 * @param {string} [soporte='rigido']
 * @returns {object} Estado del peor punto (máxima severidad) con su RMS asociado.
 */
export const calcularSaludComponente = (valoresRms, grupo = 'grupo1', soporte = 'rigido') => {
    if (!Array.isArray(valoresRms) || valoresRms.length === 0) {
        return { rmsMax: 0, ...ZONAS_ISO.SIN_DATOS };
    }

    let rmsMax = 0;
    let tieneLecturasValidas = false;

    for (let i = 0, len = valoresRms.length; i < len; i++) {
        const item = valoresRms[i];
        const val = typeof item === 'object' && item !== null
            ? Number.parseFloat(item.valor ?? item.rms ?? 0)
            : Number.parseFloat(item);

        if (Number.isFinite(val)) {
            tieneLecturasValidas = true;
            if (val > rmsMax) {
                rmsMax = val;
            }
        }
    }

    if (!tieneLecturasValidas) {
        return { rmsMax: 0, ...ZONAS_ISO.SIN_DATOS };
    }

    const evaluacion = evaluarISO20816(rmsMax, grupo, soporte);

    return {
        rmsMax: Number(rmsMax.toFixed(2)),
        ...evaluacion
    };
};