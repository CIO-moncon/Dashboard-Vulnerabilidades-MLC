/**
 * Motor de observaciones y recomendaciones automáticas CBM.
 *
 * Es una función pura: recibe mediciones ya evaluadas (nivel 0..3 por
 * magnitud) y devuelve hallazgos con severidad, plazo y necesidad de aviso
 * SAP. La clasificación del componente se hace por texto y, como respaldo,
 * por el código del punto.
 */

export type TipoComponenteCBM = 'MOTOR' | 'REDUCTOR' | 'POLEA' | 'RODAMIENTO' | 'OTRO';
export type SeveridadObservacionCBM = 'AMARILLO' | 'NARANJA' | 'ROJO';
export type PrioridadAvisoCBM = 'Alta' | 'Media' | 'Baja';
export type ReglaObservacionCBM =
  'RMS_ZONA_D' | 'RMS_ZONA_C' | 'POLEA_15_DIAS' | 'TEMP_FC_PREVENTIVA';

export interface MedicionObservacionCBM {
  punto: string;
  componente: string;
  rms: number;
  temp: number;
  fc: number;
  /** -1 = sin dato, 0 = Zona A, 1 = Zona B, 2 = Zona C, 3 = Zona D. */
  nivelRms: number;
  nivelTemp: number;
  nivelFc: number;
}

export interface ObservacionCBM {
  /** Identificador estable dentro del activo (punto + regla). */
  id: string;
  regla: ReglaObservacionCBM;
  severidad: SeveridadObservacionCBM;
  color: string;
  punto: string;
  componente: string;
  tipoComponente: TipoComponenteCBM;
  titulo: string;
  detalle: string;
  recomendacion: string;
  plazoDias: number;
  requiereAvisoSap: boolean;
  prioridadSap: PrioridadAvisoCBM;
  magnitudes: string[];
}

export const COLORES_SEVERIDAD_CBM: Record<SeveridadObservacionCBM, string> = {
  AMARILLO: '#eab308',
  NARANJA: '#f97316',
  ROJO: '#ef4444',
};

const ETIQUETA_TIPO: Record<TipoComponenteCBM, string> = {
  MOTOR: 'Motor',
  REDUCTOR: 'Reductor',
  POLEA: 'Polea / transmisión',
  RODAMIENTO: 'Rodamiento',
  OTRO: 'Componente',
};

const normalizarTexto = (texto: string): string =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Convierte valores legacy (texto/null) a número seguro para los informes. */
const aNumero = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/**
 * Clasifica el componente a partir de su nombre técnico y, si no hay
 * coincidencias, del prefijo del punto de medición.
 */
export const clasificarComponenteCBM = (componente: string, punto = ''): TipoComponenteCBM => {
  const texto = normalizarTexto(`${componente} ${punto}`);

  if (/(reductor|contraje|contraeje|engranaje|pinon|corona|gmf)/.test(texto)) {
    return 'REDUCTOR';
  }
  if (/(polea|transmision|correa|faja)/.test(texto)) {
    return 'POLEA';
  }
  if (/(motor|estator|rotor|bomba|ventilador)/.test(texto)) {
    return 'MOTOR';
  }
  if (/(rodamiento|bearing|descanso|trunnion|munon|chumacera|soporte)/.test(texto)) {
    return 'RODAMIENTO';
  }

  const puntoNormalizado = normalizarTexto(punto);
  if (/^(po|pl|polea)/.test(puntoNormalizado)) return 'POLEA';
  if (/^(r|g|cp|contraje)/.test(puntoNormalizado)) return 'REDUCTOR';
  if (/^m/.test(puntoNormalizado)) return 'MOTOR';
  return 'OTRO';
};

const zonaDeNivel = (nivel: number): string => {
  if (nivel < 0) return 'S/D';
  return `Zona ${['A', 'B', 'C', 'D'][Math.min(nivel, 3)]}`;
};

const descripcionRodamientos = (tipo: TipoComponenteCBM): string => {
  switch (tipo) {
    case 'POLEA':
      return 'ambos rodamientos/chumaceras de la polea (mando y libre)';
    case 'REDUCTOR':
      return 'ambos rodamientos del reductor (entrada y salida)';
    case 'MOTOR':
      return 'ambos rodamientos del motor (DE y NDE)';
    case 'RODAMIENTO':
      return 'los rodamientos del punto (DE/NDE)';
    default:
      return 'ambos rodamientos del componente (DE y NDE)';
  }
};

const detalleEspectral = (
  tipo: TipoComponenteCBM,
  rms: number,
): { titulo: string; detalle: string } => {
  const valor = `${rms.toFixed(2)} mm/s`;
  switch (tipo) {
    case 'MOTOR':
      return {
        titulo: 'Análisis espectral urgente — Motor',
        detalle: `RMS ${valor} en Zona D (peligro). El informe espectral debe revisar 1X/2X, armónicos, barras de rotor, excentricidad y frecuencias de rodamientos DE/NDE del motor.`,
      };
    case 'REDUCTOR':
      return {
        titulo: 'Análisis espectral urgente — Reductor',
        detalle: `RMS ${valor} en Zona D (peligro). El informe espectral debe revisar la frecuencia de engrane (GMF), bandas laterales, armónicos, backlash y frecuencias de rodamientos de entrada/salida del reductor.`,
      };
    case 'POLEA':
      return {
        titulo: 'Análisis espectral urgente — Polea / transmisión',
        detalle: `RMS ${valor} en Zona D (peligro). Revisar frecuencias de rodamiento (BPFO/BPFI/BSF/FTF), pistas, jaula, holguras y alineación de las chumaceras de mando y libre.`,
      };
    case 'RODAMIENTO':
      return {
        titulo: 'Análisis espectral urgente — Rodamiento',
        detalle: `RMS ${valor} en Zona D (peligro). Revisar BPFO/BPFI/BSF/FTF, pistas, jaula y demodulación; complementar con temperatura y análisis de lubricante.`,
      };
    default:
      return {
        titulo: 'Análisis espectral urgente',
        detalle: `RMS ${valor} en Zona D (peligro). Se requiere análisis espectral para identificar la fuente de la vibración y el componente afectado.`,
      };
  }
};

const ORDEN_SEVERIDAD: Record<SeveridadObservacionCBM, number> = {
  ROJO: 0,
  NARANJA: 1,
  AMARILLO: 2,
};

/**
 * Genera las observaciones automáticas para un conjunto de mediciones.
 * Las reglas se aplican de forma independiente por punto.
 */
export const generarObservacionesCBM = (mediciones: MedicionObservacionCBM[]): ObservacionCBM[] => {
  const observaciones: ObservacionCBM[] = [];

  mediciones.forEach((med) => {
    const tipoComponente = clasificarComponenteCBM(med.componente, med.punto);
    const etiquetaTipo = ETIQUETA_TIPO[tipoComponente];
    const rms = aNumero(med.rms);
    const temp = aNumero(med.temp);
    const fc = aNumero(med.fc);
    const nivelRms = aNumero(med.nivelRms);
    const nivelTemp = aNumero(med.nivelTemp);
    const nivelFc = aNumero(med.nivelFc);

    // 1. RMS en Zona D: informe espectral con enfoque según el componente.
    if (nivelRms >= 3) {
      const { titulo, detalle } = detalleEspectral(tipoComponente, rms);
      observaciones.push({
        id: `${med.punto}::RMS_ZONA_D`,
        regla: 'RMS_ZONA_D',
        severidad: 'ROJO',
        color: COLORES_SEVERIDAD_CBM.ROJO,
        punto: med.punto,
        componente: med.componente,
        tipoComponente,
        titulo,
        detalle,
        recomendacion:
          'Emitir informe espectral con diagnóstico y alcance de intervención; generar aviso SAP para inspección y definición de la intervención.',
        plazoDias: 7,
        requiereAvisoSap: true,
        prioridadSap: 'Alta',
        magnitudes: ['RMS'],
      });
    } else if (nivelRms === 2) {
      observaciones.push({
        id: `${med.punto}::RMS_ZONA_C`,
        regla: 'RMS_ZONA_C',
        severidad: 'NARANJA',
        color: COLORES_SEVERIDAD_CBM.NARANJA,
        punto: med.punto,
        componente: med.componente,
        tipoComponente,
        titulo: `Vibración en Zona C — ${etiquetaTipo}`,
        detalle: `RMS ${rms.toFixed(2)} mm/s en Zona C (alerta). Conviene revisar el espectro y confirmar la tendencia antes de que alcance Zona D.`,
        recomendacion:
          'Programar análisis espectral y acotar la próxima medición a un máximo de 30 días.',
        plazoDias: 30,
        requiereAvisoSap: false,
        prioridadSap: 'Baja',
        magnitudes: ['RMS'],
      });
    }

    // 2. Polea con temperatura o FC+ en Zona B: acotar medición a 15 días.
    if (tipoComponente === 'POLEA' && (nivelTemp === 1 || nivelFc === 1)) {
      const magnitudes: string[] = [];
      if (nivelTemp === 1) {
        magnitudes.push(`Temperatura ${temp.toFixed(1)} °C en Zona B`);
      }
      if (nivelFc === 1) {
        magnitudes.push(`FC+ ${fc.toFixed(1)} en Zona B`);
      }
      observaciones.push({
        id: `${med.punto}::POLEA_15_DIAS`,
        regla: 'POLEA_15_DIAS',
        severidad: 'AMARILLO',
        color: COLORES_SEVERIDAD_CBM.AMARILLO,
        punto: med.punto,
        componente: med.componente,
        tipoComponente,
        titulo: 'Acotar medición a 15 días — Polea',
        detalle: `${magnitudes.join(' y ')}. La polea requiere seguimiento cercano para confirmar si la tendencia se estabiliza o progresa.`,
        recomendacion:
          'Programar la próxima medición en un plazo máximo de 15 días y comparar los resultados con la medición actual.',
        plazoDias: 15,
        requiereAvisoSap: false,
        prioridadSap: 'Baja',
        magnitudes: [
          ...(nivelTemp === 1 ? ['Temperatura'] : []),
          ...(nivelFc === 1 ? ['FC+'] : []),
        ],
      });
    }

    // 3. Temperatura o FC+ en Zona C/D: preventiva en rodamientos o cambio.
    if (nivelTemp >= 2 || nivelFc >= 2) {
      const peorNivel = Math.max(nivelTemp, nivelFc);
      const esCritico = peorNivel >= 3;
      const magnitudes: string[] = [];
      if (nivelTemp >= 2) {
        magnitudes.push(`Temperatura ${temp.toFixed(1)} °C (${zonaDeNivel(nivelTemp)})`);
      }
      if (nivelFc >= 2) {
        magnitudes.push(`FC+ ${fc.toFixed(1)} (${zonaDeNivel(nivelFc)})`);
      }

      observaciones.push({
        id: `${med.punto}::TEMP_FC_PREVENTIVA`,
        regla: 'TEMP_FC_PREVENTIVA',
        severidad: esCritico ? 'ROJO' : 'NARANJA',
        color: esCritico ? COLORES_SEVERIDAD_CBM.ROJO : COLORES_SEVERIDAD_CBM.NARANJA,
        punto: med.punto,
        componente: med.componente,
        tipoComponente,
        titulo: esCritico
          ? `Preventiva urgente en rodamientos — ${etiquetaTipo}`
          : `Preventiva en rodamientos — ${etiquetaTipo}`,
        detalle: `${magnitudes.join(' y ')}. El nivel de severidad indica degradación térmica y/o impulsividad en los rodamientos.`,
        recomendacion: `Generar aviso SAP para realizar una preventiva en ${descripcionRodamientos(tipoComponente)}; si el desgaste es severo, evaluar el cambio de rodamientos.`,
        plazoDias: esCritico ? 7 : 15,
        requiereAvisoSap: true,
        prioridadSap: esCritico ? 'Alta' : 'Media',
        magnitudes: [...(nivelTemp >= 2 ? ['Temperatura'] : []), ...(nivelFc >= 2 ? ['FC+'] : [])],
      });
    }
  });

  return observaciones.sort(
    (a, b) =>
      ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad] || a.punto.localeCompare(b.punto),
  );
};
