import { TenantConfig } from '../types/tenant.types';
import { LosColoradosTenantConfig } from '../../tenants/los-colorados.config';
import {
  abrirVisorPDFInterno,
  dibujarCabeceraCorporativa,
  dibujarPiePaginaCorporativo,
} from './pdfPlantilla';
import { formatearFechaCorta } from '../utils/fechas';
import { UI } from '../../modules/layout/notificaciones';
import {
  MAGNITUDES_CBM,
  describirMotivo,
  etiquetasMagnitudes,
  normalizarMagnitudes,
  type MagnitudCBM,
} from '../cbm/trazabilidadSm';
import {
  clasificarCategoriaCinematica,
  infoCategoria,
  type CategoriaCinematica,
} from '../domain/ordenCinematica';

// Librería de terceros cargada por CDN (index.html): solo se lee, no se expone.
declare const window: Window & { jspdf?: any };

export interface MedicionReportePDF {
  punto: string;
  componente: string;
  fecha: string;
  actualRms: number;
  actualTemp: number;
  actualFc: number;
  zonaActual: string;
  colorActual: string;
  colorTemp: string;
  colorFc: string;
  zonaGlobal: string;
  colorGlobal: string;
  motivoNoMedicion?: string;
  magnitudesSinMedicion?: MagnitudCBM[];
  usuario?: string;
}

export interface ObservacionReportePDF {
  severidad: string;
  color: string;
  titulo: string;
  detalle: string;
  recomendacion: string;
  punto: string;
  componente: string;
  plazoDias?: number;
  requiereAvisoSap?: boolean;
}

export interface GenerarPDFExpedienteOptions {
  tagEquipo?: string;
  nombre?: string;
  area?: string;
  nivel?: string;
  grupoIso?: string;
  soporteIso?: string;
  criticidad?: string;
  severidad?: string | null;
  mediciones: MedicionReportePDF[];
  observaciones?: ObservacionReportePDF[];
  tenantConfig?: TenantConfig;
  abrirEnVisor?: boolean;
}

const MARGEN_X = 14;
const ALTO_FILA = 8;
const ALTO_ENCABEZADO = 6;
const COLOR_TEXTO: [number, number, number] = [15, 23, 42];
const COLOR_SECUNDARIO: [number, number, number] = [100, 116, 139];

/** Convierte un color hex (#rrggbb) a la tupla RGB que espera jsPDF. */
const hexARgb = (hex: string): [number, number, number] => {
  const limpio = String(hex || '').replace('#', '');
  if (limpio.length !== 6) return COLOR_SECUNDARIO;
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ];
};

/** Mezcla un color con blanco para obtener un fondo claro y legible al imprimir. */
const aclarar = (hex: string, factor = 0.86): [number, number, number] => {
  const [r, g, b] = hexARgb(hex);
  const mezclar = (canal: number): number => Math.round(canal + (255 - canal) * factor);
  return [mezclar(r), mezclar(g), mezclar(b)];
};

// Anchos de columna (mm) de la tabla de mediciones actuales — total 182 mm.
const COL_PUNTO = 18;
const COL_COMPONENTE = 36;
const COL_FECHA = 32;
const COL_RMS = 20;
const COL_TEMP = 24;
const COL_FC = 20;
const COL_ZONA = 32;
const ANCHO_TABLA = COL_PUNTO + COL_COMPONENTE + COL_FECHA + COL_RMS + COL_TEMP + COL_FC + COL_ZONA;

const dibujarEncabezadoTabla = (pdf: any, y: number): void => {
  pdf.setFillColor(2, 132, 199);
  pdf.rect(MARGEN_X, y, ANCHO_TABLA, ALTO_ENCABEZADO, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.6);

  let x = MARGEN_X;
  const yTexto = y + ALTO_ENCABEZADO / 2 + 1.1;

  pdf.text('PUNTO', x + COL_PUNTO / 2, yTexto, { align: 'center' });
  x += COL_PUNTO;
  pdf.text('COMPONENTE', x + COL_COMPONENTE / 2, yTexto, { align: 'center' });
  x += COL_COMPONENTE;
  pdf.text('FECHA', x + COL_FECHA / 2, yTexto, { align: 'center' });
  x += COL_FECHA;
  pdf.text('RMS (mm/s)', x + COL_RMS / 2, yTexto, { align: 'center' });
  x += COL_RMS;
  pdf.text('TEMP (°C)', x + COL_TEMP / 2, yTexto, { align: 'center' });
  x += COL_TEMP;
  pdf.text('FC+', x + COL_FC / 2, yTexto, { align: 'center' });
  x += COL_FC;
  pdf.text('CONDICIÓN CBM', x + COL_ZONA / 2, yTexto, { align: 'center' });
};

const zonaCorta = (zona: string): string => (zona === 'S/D' ? 'S/D' : zona.split('(')[0].trim());

/** Convierte valores legacy (texto/null) a número seguro para el reporte. */
const aNumeroReporte = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/**
 * Dibuja la sección de observaciones automáticas con su color de severidad.
 * Devuelve la coordenada Y final para continuar con el pie de página.
 */
const dibujarObservaciones = (
  pdf: any,
  observaciones: ObservacionReportePDF[],
  yInicial: number,
  altoPagina: number,
): number => {
  if (observaciones.length === 0) return yInicial;

  const anchoTexto = pdf.internal.pageSize.getWidth() - MARGEN_X * 2 - 8;
  let y = yInicial;

  const asegurarEspacio = (alto: number): void => {
    if (y + alto > altoPagina - 16) {
      pdf.addPage();
      y = 18;
    }
  };

  // Si queda muy poco espacio, la sección parte en una página nueva.
  if (y > altoPagina - 55) {
    pdf.addPage();
    y = 18;
  }

  pdf.setFillColor(2, 132, 199);
  pdf.rect(MARGEN_X, y, pdf.internal.pageSize.getWidth() - MARGEN_X * 2, 6.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.setTextColor(255, 255, 255);
  pdf.text('OBSERVACIONES Y RECOMENDACIONES AUTOMÁTICAS', MARGEN_X + 2, y + 4.3);
  y += 10;

  observaciones.forEach((observacion) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    const lineasDetalle = pdf.splitTextToSize(observacion.detalle || '', anchoTexto);
    const lineasRecomendacion = pdf.splitTextToSize(
      `Recomendación: ${observacion.recomendacion || ''}`,
      anchoTexto,
    );
    const alto =
      10.5 +
      lineasDetalle.length * 3.1 +
      lineasRecomendacion.length * 3.1 +
      (observacion.plazoDias ? 4 : 0);

    asegurarEspacio(alto);

    // Barra lateral con el color de la severidad.
    pdf.setFillColor(...hexARgb(observacion.color));
    pdf.rect(MARGEN_X, y, 1.8, alto - 2.5, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.4);
    pdf.setTextColor(...hexARgb(observacion.color));
    pdf.text(
      `${observacion.severidad} · [${observacion.punto}] ${observacion.componente}`,
      MARGEN_X + 4,
      y + 3.4,
    );

    pdf.setTextColor(...COLOR_TEXTO);
    pdf.text(observacion.titulo, MARGEN_X + 4, y + 7.2);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    pdf.setTextColor(...COLOR_SECUNDARIO);
    let yTexto = y + 10.4;
    lineasDetalle.forEach((linea: string) => {
      pdf.text(linea, MARGEN_X + 4, yTexto);
      yTexto += 3.1;
    });

    pdf.setTextColor(...COLOR_TEXTO);
    lineasRecomendacion.forEach((linea: string) => {
      pdf.text(linea, MARGEN_X + 4, yTexto);
      yTexto += 3.1;
    });

    if (observacion.plazoDias) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...hexARgb(observacion.color));
      pdf.text(`Plazo recomendado: ${observacion.plazoDias} días`, MARGEN_X + 4, yTexto + 0.4);
    }

    y += alto;
  });

  return y;
};

/** Magnitudes sin medición de una fila, usando la metadata nueva o los valores legacy. */
const magnitudesFaltantesReporte = (medicion: MedicionReportePDF): MagnitudCBM[] => {
  const normalizadas = normalizarMagnitudes(medicion.magnitudesSinMedicion);
  if (normalizadas.length > 0) return normalizadas;

  const valores: Record<MagnitudCBM, number> = {
    rms: aNumeroReporte(medicion.actualRms),
    temp: aNumeroReporte(medicion.actualTemp),
    fc: aNumeroReporte(medicion.actualFc),
  };
  return MAGNITUDES_CBM.filter((magnitud) => !(valores[magnitud] > 0));
};

/**
 * Sección de trazabilidad: enumera los puntos S/M con su motivo, responsable y
 * fecha. Los datos legacy sin motivo se informan como deuda de trazabilidad.
 */
const dibujarTrazabilidadSM = (
  pdf: any,
  mediciones: MedicionReportePDF[],
  yInicial: number,
  altoPagina: number,
): number => {
  const filas = mediciones
    .map((medicion) => ({ medicion, faltantes: magnitudesFaltantesReporte(medicion) }))
    .filter(({ faltantes }) => faltantes.length > 0);

  if (filas.length === 0) return yInicial;

  const conMotivo = filas.filter(({ medicion }) => Boolean(medicion.motivoNoMedicion));
  const sinMotivo = filas.length - conMotivo.length;
  const anchoTexto = pdf.internal.pageSize.getWidth() - MARGEN_X * 2 - 8;
  let y = yInicial;

  const asegurarEspacio = (alto: number): void => {
    if (y + alto > altoPagina - 16) {
      pdf.addPage();
      y = 18;
    }
  };

  if (y > altoPagina - 55) {
    pdf.addPage();
    y = 18;
  }

  pdf.setFillColor(245, 166, 35);
  pdf.rect(MARGEN_X, y, pdf.internal.pageSize.getWidth() - MARGEN_X * 2, 6.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TRAZABILIDAD DE PUNTOS SIN MEDICIÓN (S/M)', MARGEN_X + 2, y + 4.3);
  y += 10;

  conMotivo.forEach(({ medicion, faltantes }) => {
    const texto = `[${medicion.punto}] ${medicion.componente} — S/M: ${etiquetasMagnitudes(
      faltantes,
    )} — Motivo: ${describirMotivo(medicion.motivoNoMedicion)} — Responsable: ${
      medicion.usuario || 'No registrado'
    } — Fecha: ${formatearFechaCorta(medicion.fecha) || '—'}`;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    const lineas = pdf.splitTextToSize(texto, anchoTexto);
    const alto = lineas.length * 3.1 + 3;
    asegurarEspacio(alto);
    pdf.setFillColor(...hexARgb('#f59e0b'));
    pdf.rect(MARGEN_X, y - 1.5, 1.2, alto - 2, 'F');
    pdf.setTextColor(...COLOR_TEXTO);
    lineas.forEach((linea: string, indice: number) => {
      pdf.text(linea, MARGEN_X + 4, y + indice * 3.1);
    });
    y += alto;
  });

  if (sinMotivo > 0) {
    asegurarEspacio(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.8);
    pdf.setTextColor(180, 83, 9);
    const nota = `${sinMotivo} punto(s) con S/M sin motivo registrado (datos anteriores a la versión 3.5.0).`;
    const lineas = pdf.splitTextToSize(nota, anchoTexto);
    lineas.forEach((linea: string, indice: number) => {
      pdf.text(linea, MARGEN_X + 4, y + indice * 3.1);
    });
    y += lineas.length * 3.1 + 2;
  }

  if (conMotivo.length > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.2);
    pdf.setTextColor(...COLOR_SECUNDARIO);
    pdf.text(
      'Cada motivo fue declarado al momento del registro y quedó asociado al activo.',
      MARGEN_X,
      y + 1,
    );
    y += 4;
  }

  return y;
};

/**
 * Genera el reporte técnico del expediente con la plantilla corporativa única:
 * cabecera con logotipo + badge de condición, ficha del activo, tabla con las
 * mediciones actuales y pie de página con paginación.
 */
export const generarPDFExpediente = async ({
  tagEquipo = 'ACTIVO_CBM',
  nombre = 'Activo Crítico',
  area = 'General',
  nivel = 'Nivel 1',
  grupoIso = 'GRUPO_1',
  soporteIso = 'RIGIDO',
  criticidad = 'Media',
  severidad = null,
  mediciones = [],
  observaciones = [],
  tenantConfig = LosColoradosTenantConfig,
  abrirEnVisor = true,
}: GenerarPDFExpedienteOptions): Promise<boolean> => {
  if (typeof document === 'undefined') return false;

  if (!window.jspdf?.jsPDF) {
    UI.mostrarToast('Error: Librería jsPDF no disponible en el entorno.', 'error');
    return false;
  }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const anchoPagina = pdf.internal.pageSize.getWidth();
    const altoPagina = pdf.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - MARGEN_X * 2;

    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    const fechaStr = `${dia}-${mes}-${anio}`;

    const tagSeguro = String(tagEquipo).trim().toUpperCase();

    // Condición CBM global: la peor zona entre RMS, temperatura y FC+.
    const nivelPorColor = (color: string): number => {
      switch (String(color).toLowerCase()) {
        case '#00e676':
          return 0;
        case '#eab308':
          return 1;
        case '#f97316':
          return 2;
        case '#ef4444':
          return 3;
        default:
          return -1;
      }
    };
    const nivelGlobal = mediciones.reduce(
      (maximo, med) => Math.max(maximo, nivelPorColor(med.colorGlobal)),
      -1,
    );
    const severidadDatos: string =
      nivelGlobal < 0 ? 'SIN_DATOS' : ['A', 'B', 'C', 'D'][nivelGlobal];
    const severidadFinal = mediciones.length > 0 ? severidadDatos : severidad || 'SIN_DATOS';

    // 1. Cabecera corporativa única (logotipo + badge de condición ISO).
    await dibujarCabeceraCorporativa(pdf, {
      titulo: 'REPORTE TÉCNICO DE CONDICIÓN MECÁNICA — CBM',
      subtitulo: `${tenantConfig.branding.nombreFaena} | ${tenantConfig.branding.empresaMatriz || 'Gestión CBM'}`,
      referencia: `Activo ${tagSeguro} · ${nombre} · ISO 20816-3`,
      severidad: severidadFinal,
      textoCondicion: 'CONDICIÓN CBM',
      tenantConfig,
    });

    // 2. Ficha del activo.
    let y = 38;
    const filasFicha: Array<[string, string]> = [
      ['TAG Activo', tagSeguro],
      ['Nombre', nombre],
      ['Área Operacional', area],
      ['Nivel', nivel],
      ['Clasificación ISO', `${grupoIso} · ${soporteIso}`],
      ['Criticidad', criticidad],
      ['Fecha de Emisión', fechaStr],
      ['Puntos en Matriz', String(mediciones.length)],
    ];

    filasFicha.forEach(([etiqueta, valor], idx) => {
      const columna = idx % 2;
      const filaIdx = Math.floor(idx / 2);
      const x = MARGEN_X + columna * (anchoContenido / 2);
      const yy = y + filaIdx * 5.6;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.4);
      pdf.setTextColor(...COLOR_SECUNDARIO);
      pdf.text(`${etiqueta}:`, x, yy);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.2);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(String(valor || '—'), x + 38, yy);
    });

    y += Math.ceil(filasFicha.length / 2) * 5.6 + 5;

    pdf.setFontSize(6.8);
    pdf.setTextColor(...COLOR_SECUNDARIO);
    pdf.text(
      'Mediciones actuales del expediente (o la última registrada si ya se guardaron).',
      MARGEN_X,
      y,
    );
    pdf.text(
      'La condición CBM refleja la peor zona entre RMS, temperatura y FC+ (ISO 20816-3 · ISO 18434-1 · ISO 13373-2).',
      MARGEN_X,
      y + 3.4,
    );
    y += 8;

    // 3. Tabla de mediciones actuales.
    dibujarEncabezadoTabla(pdf, y);
    y += ALTO_ENCABEZADO;

    const xPunto = MARGEN_X;
    const xComponente = xPunto + COL_PUNTO;
    const xFecha = xComponente + COL_COMPONENTE;
    const xRms = xFecha + COL_FECHA;
    const xTemp = xRms + COL_RMS;
    const xFc = xTemp + COL_TEMP;
    const xZona = xFc + COL_FC;

    let categoriaActual: CategoriaCinematica | null = null;
    mediciones.forEach((med, idx) => {
      const cat = clasificarCategoriaCinematica(med.componente, med.punto);
      if (cat !== categoriaActual) {
        categoriaActual = cat;
        if (y > altoPagina - 28) {
          pdf.addPage();
          y = 18;
          dibujarEncabezadoTabla(pdf, y);
          y += ALTO_ENCABEZADO;
        }
        const info = infoCategoria(cat);
        pdf.setFillColor(241, 245, 249);
        pdf.rect(MARGEN_X, y, anchoContenido, 4.4, 'F');
        pdf.setFillColor(2, 132, 199);
        pdf.rect(MARGEN_X, y, 1.8, 4.4, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.4);
        pdf.setTextColor(2, 132, 199);
        pdf.text(info.titulo.toUpperCase(), MARGEN_X + 3.2, y + 3.1);
        y += 4.4;
      }

      if (y > altoPagina - 24) {
        pdf.addPage();
        y = 18;
        dibujarEncabezadoTabla(pdf, y);
        y += ALTO_ENCABEZADO;
      }

      // Fondo alternado.
      if (idx % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(MARGEN_X, y, anchoContenido, ALTO_FILA, 'F');
      }

      const yTexto = y + ALTO_FILA / 2 + 1.1;

      // Fondos claros con el color ISO de cada magnitud (visibles al imprimir).
      pdf.setFillColor(...aclarar(med.colorActual));
      pdf.rect(xRms + 0.8, y + 0.8, COL_RMS - 1.6, ALTO_FILA - 1.6, 'F');
      pdf.setFillColor(...aclarar(med.colorTemp));
      pdf.rect(xTemp + 0.8, y + 0.8, COL_TEMP - 1.6, ALTO_FILA - 1.6, 'F');
      pdf.setFillColor(...aclarar(med.colorFc));
      pdf.rect(xFc + 0.8, y + 0.8, COL_FC - 1.6, ALTO_FILA - 1.6, 'F');
      pdf.setFillColor(...aclarar(med.colorGlobal));
      pdf.rect(xZona + 0.8, y + 0.8, COL_ZONA - 1.6, ALTO_FILA - 1.6, 'F');

      pdf.setFontSize(7.4);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(String(med.punto || '—'), xPunto + 1, yTexto);

      pdf.setFont('helvetica', 'normal');
      pdf.text(String(med.componente || '—'), xComponente + 1, yTexto);

      pdf.setFontSize(6.5);
      pdf.setTextColor(...COLOR_SECUNDARIO);
      pdf.text(formatearFechaCorta(med.fecha) || '—', xFecha + COL_FECHA / 2, yTexto, {
        align: 'center',
      });

      // Valores actuales coloreados según su norma ISO.
      const valorRms = aNumeroReporte(med.actualRms);
      const valorTemp = aNumeroReporte(med.actualTemp);
      const valorFc = aNumeroReporte(med.actualFc);
      const faltantes = magnitudesFaltantesReporte(med);
      const sinRms = faltantes.includes('rms');
      const sinTemp = faltantes.includes('temp');
      const sinFc = faltantes.includes('fc');
      const sinMedicionTotal = faltantes.length === MAGNITUDES_CBM.length;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.4);
      pdf.setTextColor(...hexARgb(med.colorActual));
      pdf.text(sinRms ? 'S/M' : valorRms.toFixed(2), xRms + COL_RMS / 2, yTexto, {
        align: 'center',
      });

      pdf.setTextColor(...hexARgb(med.colorTemp));
      pdf.text(sinTemp ? 'S/M' : valorTemp.toFixed(1), xTemp + COL_TEMP / 2, yTexto, {
        align: 'center',
      });

      pdf.setTextColor(...hexARgb(med.colorFc));
      pdf.text(sinFc ? 'S/M' : valorFc.toFixed(1), xFc + COL_FC / 2, yTexto, {
        align: 'center',
      });

      // Condición CBM de la fila (peor zona entre las magnitudes medidas).
      pdf.setFontSize(6.8);
      pdf.setTextColor(...hexARgb(med.colorGlobal));
      pdf.text(sinMedicionTotal ? 'S/M' : zonaCorta(med.zonaGlobal), xZona + COL_ZONA / 2, yTexto, {
        align: 'center',
      });

      y += ALTO_FILA;
    });

    // Leyenda de colores ISO.
    if (y > altoPagina - 34) {
      pdf.addPage();
      y = 20;
    }
    y += 5;
    const leyenda: Array<[string, string]> = [
      ['#00e676', 'Normal / Zona A'],
      ['#eab308', 'Seguimiento / B'],
      ['#f97316', 'Alerta / C'],
      ['#ef4444', 'Crítico / D'],
    ];
    pdf.setFontSize(6.2);
    pdf.setFont('helvetica', 'normal');
    let xLeyenda = MARGEN_X;
    leyenda.forEach(([color, texto]) => {
      pdf.setFillColor(...hexARgb(color));
      pdf.rect(xLeyenda, y - 2.2, 2.4, 2.4, 'F');
      pdf.setTextColor(...COLOR_SECUNDARIO);
      pdf.text(texto, xLeyenda + 3.4, y);
      xLeyenda += 3.4 + pdf.getTextWidth(texto) + 6;
    });
    y += 3;
    pdf.setFontSize(6.2);
    pdf.setTextColor(...COLOR_SECUNDARIO);
    pdf.text('S/M = Sin medición (punto no medido en esta inspección).', MARGEN_X, y);
    y += 4;

    // 4. Trazabilidad de puntos sin medición (S/M): motivo y responsable.
    y = dibujarTrazabilidadSM(pdf, mediciones, y + 3, altoPagina);

    // 5. Observaciones y recomendaciones automáticas.
    y = dibujarObservaciones(pdf, observaciones, y + 2, altoPagina);

    // 6. Pie de página corporativo con paginación.
    dibujarPiePaginaCorporativo(pdf, {
      fechaImpresion: fechaStr,
      textoCentro: `Respaldo SAP PM · Activo ${tagSeguro} · Emisión: ${fechaStr}`,
      tenantConfig,
    });

    // 7. Salida.
    const nombreArchivo = `Expediente_${tagSeguro}_${fechaStr}.pdf`;
    if (abrirEnVisor) {
      abrirVisorPDFInterno(pdf, nombreArchivo);
    } else {
      pdf.save(nombreArchivo);
    }

    UI.mostrarToast(`Expediente ${tagSeguro} generado exitosamente.`, 'exito');
    return true;
  } catch (error) {
    console.error('[Reportes] Error al generar documento PDF:', error);
    UI.mostrarToast('Error al exportar el documento PDF.', 'error');
    return false;
  }
};
