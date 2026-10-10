export function evaluarISO20816(rms, grupo = 'grupo1', soporte = 'rigido') {
    let limites;
    if (grupo === 'grupo1') {
        limites = soporte === 'rigido' ? { b: 2.3, c: 4.5, d: 7.1 } : { b: 3.5, c: 7.1, d: 11.0 };
    } else {
        limites = soporte === 'rigido' ? { b: 1.4, c: 2.8, d: 4.5 } : { b: 2.3, c: 4.5, d: 7.1 };
    }

    if (rms <= limites.b) return { zona: 'A', estado: 'Óptimo', color: 'var(--iso-zona-a)', cls: 'zona-a' };
    if (rms <= limites.c) return { zona: 'B', estado: 'Aceptable', color: 'var(--iso-zona-b)', cls: 'zona-b' };
    if (rms <= limites.d) return { zona: 'C', estado: 'Alarma (Restringida)', color: 'var(--iso-zona-c)', cls: 'zona-c' };
    return { zona: 'D', estado: 'Peligro (Crítico)', color: 'var(--iso-zona-d)', cls: 'zona-d' };
}

export function calcularSaludComponente(valoresRms, grupo = 'grupo1', soporte = 'rigido') {
    if (!valoresRms || valoresRms.length === 0) return { rmsMax: 0, zona: 'A', estado: 'Sin Datos', color: 'gray', cls: '' };
    const rmsMax = Math.max(...valoresRms);
    const evaluacion = evaluarISO20816(rmsMax, grupo, soporte);
    return { rmsMax, ...evaluacion };
}