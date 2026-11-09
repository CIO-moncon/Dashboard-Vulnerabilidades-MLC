/**
 * Orden cinemático lógico de los componentes de un activo:
 *   1. Motor (eléctrico / combustión / principal)
 *   2. Reductor (caja reductora / contraeje / engranajes)
 *   3. Poleas (motriz, cabeza, cola, retorno, transmisión)
 *   4. Otros componentes (bombas, ventiladores, harneros, descansos)
 *
 * Aplica criterios de posición (NDE -> DE, entrada -> salida, Lado Izquierdo -> Derecho)
 * y ordenamiento numérico natural (G1, G2, ..., G9, G10 en vez de G1, G10, G2).
 */

export type CategoriaCinematica = 'motor' | 'reductor' | 'poleas' | 'otros';

export interface InfoCategoriaCinematica {
  categoria: CategoriaCinematica;
  titulo: string;
  icono: string;
  orden: number;
}

const METADATOS_CATEGORIAS: Record<
  CategoriaCinematica,
  Omit<InfoCategoriaCinematica, 'categoria'>
> = {
  motor: {
    titulo: 'Motor Eléctrico',
    icono: 'electric_bolt',
    orden: 0,
  },
  reductor: {
    titulo: 'Reductor de Velocidad',
    icono: 'settings',
    orden: 1,
  },
  poleas: {
    titulo: 'Poleas y Descansos de Transmisión',
    icono: 'album',
    orden: 2,
  },
  otros: {
    titulo: 'Otros Componentes',
    icono: 'widgets',
    orden: 3,
  },
};

export const infoCategoria = (categoria: CategoriaCinematica): InfoCategoriaCinematica => ({
  categoria,
  ...METADATOS_CATEGORIAS[categoria],
});

const normalizar = (texto: string): string =>
  (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/**
 * Clasifica un punto en su categoría cinemática según la descripción del componente
 * o su código/clave de punto.
 */
export const clasificarCategoriaCinematica = (
  componente = '',
  puntoOClave = '',
): CategoriaCinematica => {
  const comp = normalizar(componente);
  const tag = normalizar(puntoOClave);

  // 1. MOTOR
  if (comp.includes('motor')) return 'motor';
  if (/^m(?:ot|\d|_|[a-z]|$)/.test(tag) && !/^mol|^man/.test(tag)) {
    // Excluir 'molino', 'manto'
    return 'motor';
  }
  if (/^(?:mf|mm)[_0-9a-z]*/.test(tag)) return 'motor'; // Motor fijo / motor móvil

  // 2. REDUCTOR / TRANSMISIÓN REDUCTORA / ENGRANAJES
  if (
    comp.includes('reductor') ||
    comp.includes('reductora') ||
    comp.includes('gearbox') ||
    comp.includes('contraeje') ||
    comp.includes('pivote') ||
    comp.includes('excentrica') ||
    comp.includes('excitador') ||
    comp.includes('pinon') ||
    comp.includes('corona')
  ) {
    return 'reductor';
  }
  if (/^g\d+/.test(tag) || /^red[_0-9a-z]*/.test(tag) || /^ce[_0-9a-z]*/.test(tag)) {
    return 'reductor';
  }
  if (/^r\d+/.test(tag) && !comp.includes('retorno') && !comp.includes('rodillo')) {
    return 'reductor';
  }

  // 3. POLEAS / TAMBORES / DESCANSO DE CORREA
  if (
    comp.includes('polea') ||
    comp.includes('tambor') ||
    comp.includes('chumacera polea') ||
    comp.includes('pol_')
  ) {
    return 'poleas';
  }
  if (/^pl\d+/.test(tag) || /^pol[_0-9a-z]*/.test(tag) || /^po\d+/.test(tag)) {
    return 'poleas';
  }

  return 'otros';
};

/**
 * Extrae el primer número significativo de una cadena (ej: "Punto 10" -> 10, "G2" -> 2).
 */
const extraerNumero = (texto: string): number | null => {
  const match = normalizar(texto).match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

/**
 * Ponderador de lado/subposición para ordenar internamente:
 *   - Lado Libre / NDE / Izquierdo -> antes (0)
 *   - Lado Carga / Acople / DE / Derecho -> después (1)
 */
const ponderadorLado = (texto: string): number => {
  const t = normalizar(texto);
  if (
    t.includes('nde') ||
    t.includes('lado libre') ||
    t.includes('libre') ||
    t.includes('izq') ||
    t.includes('izquierdo') ||
    t.endsWith('_li') ||
    t.endsWith('li') ||
    t.includes('entrada')
  ) {
    return 0;
  }
  if (
    t.includes('de carga') ||
    t.includes('lado carga') ||
    t.includes('acople') ||
    t.includes('mando') ||
    t.includes('der') ||
    t.includes('derecho') ||
    t.endsWith('_ld') ||
    t.endsWith('ld') ||
    t.includes('salida')
  ) {
    return 1;
  }
  if (/\bde\b/.test(t) && !t.includes('polea de') && !t.includes('reductor de')) {
    return 1;
  }
  return 0.5;
};

/**
 * Comparador de orden cinemático lógico entre dos spots.
 */
export const compararSpotsCinematica = (
  a: { sKey: string; punto?: string; componente?: string },
  b: { sKey: string; punto?: string; componente?: string },
): number => {
  const compA = a.componente || '';
  const compB = b.componente || '';
  const tagA = a.punto || a.sKey;
  const tagB = b.punto || b.sKey;

  const catA = clasificarCategoriaCinematica(compA, tagA);
  const catB = clasificarCategoriaCinematica(compB, tagB);

  // 1. Prioridad de categoría (Motor: 0, Reductor: 1, Poleas: 2, Otros: 3)
  const ordenCatA = METADATOS_CATEGORIAS[catA].orden;
  const ordenCatB = METADATOS_CATEGORIAS[catB].orden;
  if (ordenCatA !== ordenCatB) {
    return ordenCatA - ordenCatB;
  }

  // 2. Ordenamiento específico dentro de la categoría
  if (catA === 'motor') {
    // Número de motor si aplica (Motor 1 vs Motor 2)
    const numA = extraerNumero(compA) ?? extraerNumero(tagA) ?? 0;
    const numB = extraerNumero(compB) ?? extraerNumero(tagB) ?? 0;
    if (numA !== numB) return numA - numB;

    // Lado: NDE (libre) antes de DE (carga)
    const ladoA = ponderadorLado(`${compA} ${tagA}`);
    const ladoB = ponderadorLado(`${compB} ${tagB}`);
    if (ladoA !== ladoB) return ladoA - ladoB;
  } else if (catA === 'reductor') {
    // Número de etapa / punto / eje (1..10)
    const numA = extraerNumero(compA) ?? extraerNumero(tagA) ?? 0;
    const numB = extraerNumero(compB) ?? extraerNumero(tagB) ?? 0;
    if (numA !== numB) return numA - numB;

    const ladoA = ponderadorLado(`${compA} ${tagA}`);
    const ladoB = ponderadorLado(`${compB} ${tagB}`);
    if (ladoA !== ladoB) return ladoA - ladoB;
  } else if (catA === 'poleas') {
    // Número de polea (1..N)
    const numA = extraerNumero(compA) ?? extraerNumero(tagA) ?? 0;
    const numB = extraerNumero(compB) ?? extraerNumero(tagB) ?? 0;
    if (numA !== numB) return numA - numB;

    // Lado Izquierdo (LI) antes de Lado Derecho (LD)
    const ladoA = ponderadorLado(`${compA} ${tagA}`);
    const ladoB = ponderadorLado(`${compB} ${tagB}`);
    if (ladoA !== ladoB) return ladoA - ladoB;
  }

  // 3. Desempate alfanumérico natural (ej: "G2" antes de "G10", "PL1_LI" antes de "PL1_LD")
  return tagA.localeCompare(tagB, 'es', { numeric: true, sensitivity: 'base' });
};

/**
 * Ordena las claves de un mapa de spots respetando el orden cinemático:
 * Motor -> Reductor -> Poleas -> Otros.
 */
export const ordenarSpotsCinematica = (
  spotsMap: Record<string, { punto?: string; componente?: string } | undefined>,
): string[] => {
  const entradas = Object.entries(spotsMap)
    .filter(([, sp]) => Boolean(sp))
    .map(([sKey, sp]) => ({
      sKey,
      punto: sp?.punto,
      componente: sp?.componente,
    }));

  entradas.sort(compararSpotsCinematica);
  return entradas.map((e) => e.sKey);
};
