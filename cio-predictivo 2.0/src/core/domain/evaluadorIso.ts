export type GrupoIso = 'grupo1' | 'grupo2';
export type SoporteIso = 'rigido' | 'flexible';
export type ZonaIsoId = 'A' | 'B' | 'C' | 'D' | 'SIN_DATOS';

export interface IsoLimites {
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export interface IsoZonaDef {
  readonly zona: string;
  readonly estado: string;
  readonly nivelSeveridad: number;
  readonly colorHex: string;
  readonly color: string;
  readonly cls: string;
}

export interface EvaluacionIsoResultado extends IsoZonaDef {
  readonly rmsEvaluado: number;
  readonly limitesAplicados?: IsoLimites;
}

export interface EvaluacionSaludComponente extends EvaluacionIsoResultado {
  readonly rmsMax: number;
}

export const MATRIZ_LIMITES_ISO: Readonly<Record<`${GrupoIso}_${SoporteIso}`, IsoLimites>> = {
  grupo1_rigido: { b: 2.3, c: 4.5, d: 7.1 },
  grupo1_flexible: { b: 3.5, c: 7.1, d: 11.0 },
  grupo2_rigido: { b: 1.4, c: 2.8, d: 4.5 },
  grupo2_flexible: { b: 2.3, c: 4.5, d: 7.1 }
} as const;

export const ZONAS_ISO: Readonly<Record<ZonaIsoId, IsoZonaDef>> = {
  A: {
    zona: 'A',
    estado: 'Óptimo (Buena)',
    nivelSeveridad: 1,
    colorHex: '#00e676',
    color: 'var(--iso-zona-a, #00e676)',
    cls: 'zona-a'
  },
  B: {
    zona: 'B',
    estado: 'Aceptable (Operación sin restricción)',
    nivelSeveridad: 2,
    colorHex: '#84cc16',
    color: 'var(--iso-zona-b, #84cc16)',
    cls: 'zona-b'
  },
  C: {
    zona: 'C',
    estado: 'Alarma (Operación restringida)',
    nivelSeveridad: 3,
    colorHex: '#f59e0b',
    color: 'var(--iso-zona-c, #f59e0b)',
    cls: 'zona-c'
  },
  D: {
    zona: 'D',
    estado: 'Peligro (Condición crítica / Daño)',
    nivelSeveridad: 4,
    colorHex: '#ef4444',
    color: 'var(--iso-zona-d, #ef4444)',
    cls: 'zona-d'
  },
  SIN_DATOS: {
    zona: 'S/D',
    estado: 'Sin Datos',
    nivelSeveridad: 0,
    colorHex: '#94a3b8',
    color: 'var(--text-muted, #94a3b8)',
    cls: 'sin-datos'
  }
} as const;

export const evaluarISO20816 = (
  rms: number | string | null | undefined,
  grupo: GrupoIso = 'grupo1',
  soporte: SoporteIso = 'rigido'
): EvaluacionIsoResultado => {
  const valorNumerico = typeof rms === 'number' ? rms : Number.parseFloat(String(rms));

  if (!Number.isFinite(valorNumerico) || valorNumerico < 0) {
    return { ...ZONAS_ISO.SIN_DATOS, rmsEvaluado: 0 };
  }

  const claveNormativa: `${GrupoIso}_${SoporteIso}` = `${grupo}_${soporte}`;
  const limites = MATRIZ_LIMITES_ISO[claveNormativa] ?? MATRIZ_LIMITES_ISO['grupo1_rigido'];

  let zonaClave: ZonaIsoId = 'D';
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

export const calcularSaludComponente = (
  valoresRms: Array<number | string | { valor?: number | string; rms?: number | string } | null | undefined>,
  grupo: GrupoIso = 'grupo1',
  soporte: SoporteIso = 'rigido'
): EvaluacionSaludComponente => {
  if (!Array.isArray(valoresRms) || valoresRms.length === 0) {
    return { rmsMax: 0, ...ZONAS_ISO.SIN_DATOS, rmsEvaluado: 0 };
  }

  let rmsMax = 0;
  let tieneLecturasValidas = false;

  for (let i = 0, len = valoresRms.length; i < len; i++) {
    const item = valoresRms[i];
    let val = 0;

    if (typeof item === 'object' && item !== null) {
      val = Number.parseFloat(String(item.valor ?? item.rms ?? 0));
    } else if (typeof item === 'number' || typeof item === 'string') {
      val = Number.parseFloat(String(item));
    }

    if (Number.isFinite(val)) {
      tieneLecturasValidas = true;
      if (val > rmsMax) {
        rmsMax = val;
      }
    }
  }

  if (!tieneLecturasValidas) {
    return { rmsMax: 0, ...ZONAS_ISO.SIN_DATOS, rmsEvaluado: 0 };
  }

  const evaluacion = evaluarISO20816(rmsMax, grupo, soporte);

  return {
    rmsMax: Number(rmsMax.toFixed(2)),
    ...evaluacion
  };
};