/**
 * Reglas puras de trazabilidad para puntos sin medición (S/M).
 *
 * Un valor `null` representa "no medido"; `0` es un valor medido válido.
 * Estas funciones se comparten entre la matriz del expediente, el historial
 * y el reporte PDF para que todos usen el mismo criterio.
 */

export type MagnitudCBM = 'rms' | 'temp' | 'fc';

export const MAGNITUDES_CBM: readonly MagnitudCBM[] = ['rms', 'temp', 'fc'] as const;

export const ETIQUETAS_MAGNITUD: Record<MagnitudCBM, string> = {
  rms: 'RMS',
  temp: 'Temp',
  fc: 'FC+',
};

export interface MotivoNoMedicionOption {
  value: string;
  label: string;
}

/** Catálogo genérico de motivos de no medición. */
export const MOTIVOS_NO_MEDICION: ReadonlyArray<MotivoNoMedicionOption> = [
  { value: '', label: '— Seleccionar motivo —' },
  { value: 'sin_acceso', label: 'Sin acceso al punto' },
  { value: 'equipo_fs', label: 'Equipo de medición F/S' },
  { value: 'trabajos_cruzados', label: 'Trabajos cruzados' },
  { value: 'area_restringida', label: 'Área restringida' },
  { value: 'condicion_climatica', label: 'Condición climática' },
  { value: 'punto_no_accesible', label: 'Punto no accesible' },
  { value: 'no_programado', label: 'No programado' },
  { value: 'otro', label: 'Otro (especificar)' },
];

export interface ValoresMedicionCBM {
  rms: number | null;
  temp: number | null;
  fc: number | null;
}

export interface EstadoMedicionCBM extends ValoresMedicionCBM {
  motivo: string;
}

export interface ResultadoValidacionMedicion {
  ok: boolean;
  faltantes: MagnitudCBM[];
  mensaje?: string;
}

export const esMagnitudCBM = (valor: unknown): valor is MagnitudCBM =>
  valor === 'rms' || valor === 'temp' || valor === 'fc';

export const normalizarMagnitudes = (valores: unknown): MagnitudCBM[] => {
  if (!Array.isArray(valores)) return [];
  return valores.filter(esMagnitudCBM);
};

/** Devuelve las magnitudes que no fueron medidas (valor nulo o no numérico). */
export const magnitudesFaltantes = (valores: ValoresMedicionCBM): MagnitudCBM[] =>
  MAGNITUDES_CBM.filter((magnitud) => {
    const valor = valores[magnitud];
    return valor === null || valor === undefined || !Number.isFinite(valor);
  });

export const etiquetasMagnitudes = (magnitudes: readonly MagnitudCBM[]): string =>
  magnitudes.map((magnitud) => ETIQUETAS_MAGNITUD[magnitud]).join(', ');

/**
 * Normaliza el motivo seleccionado. El motivo "otro" se guarda como
 * `otro: <detalle>` para conservar la justificación completa.
 */
export const normalizarMotivo = (valor: string, detalle?: string): string => {
  const base = String(valor ?? '').trim();
  if (base !== 'otro') return base;
  const texto = String(detalle ?? '').trim();
  return texto ? `otro: ${texto}` : 'otro';
};

/** Texto legible para mostrar un motivo en historial, PDF o interfaz. */
export const describirMotivo = (motivo?: string): string => {
  const valor = String(motivo ?? '').trim();
  if (!valor) return '';
  if (valor.startsWith('otro:')) {
    const detalle = valor.slice('otro:'.length).trim();
    return detalle ? `Otro: ${detalle}` : 'Otro (sin detalle)';
  }
  return MOTIVOS_NO_MEDICION.find((opcion) => opcion.value === valor)?.label ?? valor;
};

/**
 * Valida una fila antes de guardar:
 * - Si no hay ninguna medición, debe existir un motivo (punto 100% S/M).
 * - Si hay mediciones parciales, debe existir un motivo para las faltantes.
 * - "Otro" exige detalle.
 */
export const validarEstadoMedicion = (estado: EstadoMedicionCBM): ResultadoValidacionMedicion => {
  const faltantes = magnitudesFaltantes(estado);
  const motivo = String(estado.motivo ?? '').trim();
  const esOtroSinDetalle = motivo === 'otro';
  const hayMotivo = Boolean(motivo) && !esOtroSinDetalle;
  const hayMedicion = faltantes.length < MAGNITUDES_CBM.length;

  if (!hayMedicion && !motivo) {
    return {
      ok: false,
      faltantes,
      mensaje:
        'No hay mediciones ni motivo de no medición. Selecciona un motivo para registrar el punto como S/M.',
    };
  }

  if (faltantes.length > 0 && esOtroSinDetalle) {
    return {
      ok: false,
      faltantes,
      mensaje: 'El motivo "Otro" requiere un detalle.',
    };
  }

  if (faltantes.length > 0 && !hayMotivo) {
    return {
      ok: false,
      faltantes,
      mensaje: `Faltan ${etiquetasMagnitudes(faltantes)} (S/M): selecciona un motivo de no medición.`,
    };
  }

  return { ok: true, faltantes };
};
