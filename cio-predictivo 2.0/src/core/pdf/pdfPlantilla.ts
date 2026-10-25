import { TenantConfig } from '../types/tenant.types';
import { LosColoradosTenantConfig } from '../../tenants/los-colorados.config';

export interface PaletaSeveridadPDF {
  readonly bg: [number, number, number];
  readonly text: [number, number, number];
  readonly border: [number, number, number];
  readonly hex: string;
  readonly etiqueta: string;
  readonly estadoCorto: string;
}

export interface CabeceraPDFOptions {
  titulo?: string;
  subtitulo?: string;
  referencia?: string;
  severidad?: string | null;
  textoCondicion?: string;
  margenX?: number;
  tenantConfig?: TenantConfig;
}

export interface PiePaginaPDFOptions {
  fechaImpresion?: string;
  textoCentro?: string;
  margenX?: number;
  tenantConfig?: TenantConfig;
}

export interface PortadaGerencialOptions {
  mesAnio?: string;
  superintendencia?: string;
  faena?: string;
  tenantConfig?: TenantConfig;
}

const logoCachePorRuta = new Map<string, string>();

/**
 * Convierte dinámicamente cualquier logo de faena/empresa a Base64 para jsPDF.
 */
export const obtenerLogoBase64 = (rutaLogo = '/assets/img/logo-cpf.png'): Promise<string | null> => {
  if (logoCachePorRuta.has(rutaLogo)) {
    return Promise.resolve(logoCachePorRuta.get(rutaLogo)!);
  }

  if (typeof window === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        logoCachePorRuta.set(rutaLogo, dataUrl);
        resolve(dataUrl);
      } catch (err) {
        console.warn('[PDF-Plantilla] Error convirtiendo logo a Base64:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = rutaLogo;
  });
};

/**
 * Mapeo estricto de colores y estados de criticidad según ISO 20816-3 para informes PDF.
 */
export const resolverPaletaSeveridadISO = (severidadRaw = ''): PaletaSeveridadPDF => {
  const sev = String(severidadRaw || '').trim().toUpperCase();

  if (sev === 'ROJO' || sev === 'CRITICO' || sev === 'D' || sev.includes('ZONA D')) {
    return {
      bg: [254, 226, 226],
      text: [153, 27, 27],
      border: [239, 68, 68],
      hex: '#ef4444',
      etiqueta: 'CRÍTICO (ZONA D)',
      estadoCorto: 'Zona D (Crítico)'
    };
  }
  if (sev === 'NARANJA' || sev === 'SALMON' || sev === 'ALERTA' || sev === 'C' || sev.includes('ZONA C')) {
    return {
      bg: [255, 237, 213],
      text: [154, 52, 18],
      border: [249, 115, 22],
      hex: '#f97316',
      etiqueta: 'ALERTA (ZONA C)',
      estadoCorto: 'Zona C (Alerta)'
    };
  }
  if (sev === 'AMARILLO' || sev === 'SEGUIMIENTO' || sev === 'B' || sev.includes('ZONA B')) {
    return {
      bg: [254, 249, 195],
      text: [133, 77, 14],
      border: [234, 179, 8],
      hex: '#eab308',
      etiqueta: 'SEGUIMIENTO (ZONA B)',
      estadoCorto: 'Zona B (Seguimiento)'
    };
  }
  if (sev === 'SIN_DATOS' || sev === 'VACIO' || sev === 'S/D') {
    return {
      bg: [241, 245, 249],
      text: [100, 116, 139],
      border: [203, 213, 225],
      hex: '#94a3b8',
      etiqueta: 'SIN MEDICIÓN',
      estadoCorto: 'Sin datos'
    };
  }
  return {
    bg: [220, 252, 231],
    text: [22, 101, 52],
    border: [34, 197, 94],
    hex: '#00e676',
    etiqueta: 'ÓPTIMO (ZONA A)',
    estadoCorto: 'Zona A (Óptimo)'
  };
};

/**
 * Cabecera corporativa multi-tenant para jsPDF.
 */
export const dibujarCabeceraCorporativa = async (
  doc: any,
  options: CabeceraPDFOptions = {}
): Promise<void> => {
  const config = options.tenantConfig || LosColoradosTenantConfig;
  const margenX = options.margenX ?? 14;
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoCabecera = 28;

  const titulo = options.titulo || 'REPORTE TÉCNICO DE CONDICIÓN MECÁNICA — CBM';
  const subtitulo =
    options.subtitulo ||
    `${config.branding.nombreFaena} | ${config.branding.empresaMatriz || 'Gestión CBM'}`;
  const referencia =
    options.referencia || 'Documento Oficial de Respaldo para Notificación / Cierre Técnico SAP PM';
  const textoCondicion = options.textoCondicion || 'CONDICIÓN CBM';

  // Fondo blanco puro
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, anchoPagina, altoCabecera, 'F');

  // Logotipo multi-tenant dinámico
  const rutaLogo = config.branding.logoPdfUrl || config.branding.logoUrl;
  const logoBase64 = await obtenerLogoBase64(rutaLogo);

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margenX, 3.5, 33, 20.5);
  } else {
    doc.setTextColor(2, 132, 199);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(config.branding.nombreFaena, margenX + 2, 16);
  }

  const posXTexto = margenX + 36;
  let anchoDisponibleTexto = anchoPagina - margenX - posXTexto;

  // Sello o Badge de Condición ISO si aplica
  if (options.severidad) {
    const paleta = resolverPaletaSeveridadISO(options.severidad);
    const anchoBadge = 46;
    const altoBadge = 18;
    const xBadge = anchoPagina - margenX - anchoBadge;
    const yBadge = 4.5;

    anchoDisponibleTexto = xBadge - posXTexto - 5;

    doc.setFillColor(...paleta.bg);
    doc.setDrawColor(...paleta.border);
    doc.setLineWidth(0.7);
    doc.roundedRect(xBadge, yBadge, anchoBadge, altoBadge, 2.5, 2.5, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...paleta.text);
    doc.text(String(textoCondicion).toUpperCase(), xBadge + anchoBadge / 2, yBadge + 5.5, { align: 'center' });

    doc.setFontSize(8.5);
    doc.text(paleta.etiqueta, xBadge + anchoBadge / 2, yBadge + 12.8, { align: 'center' });
  }

  // Título y jerarquía tipográfica
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');

  let tamanoFuenteTitulo = 11;
  doc.setFontSize(tamanoFuenteTitulo);

  while (doc.getTextWidth(titulo) > anchoDisponibleTexto && tamanoFuenteTitulo > 9) {
    tamanoFuenteTitulo -= 0.5;
    doc.setFontSize(tamanoFuenteTitulo);
  }

  const lineasTitulo = doc.splitTextToSize(titulo, anchoDisponibleTexto);

  if (lineasTitulo.length > 1) {
    doc.text(lineasTitulo, posXTexto, 8, { lineHeightFactor: 1.15 });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const lineasSub = doc.splitTextToSize(subtitulo, anchoDisponibleTexto);
    doc.text(lineasSub[0] || subtitulo, posXTexto, 16.5);

    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    const lineasRef = doc.splitTextToSize(referencia, anchoDisponibleTexto);
    doc.text(lineasRef[0] || referencia, posXTexto, 21.2);
  } else {
    doc.text(titulo, posXTexto, 10.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const lineasSub = doc.splitTextToSize(subtitulo, anchoDisponibleTexto);
    doc.text(lineasSub[0] || subtitulo, posXTexto, 16);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const lineasRef = doc.splitTextToSize(referencia, anchoDisponibleTexto);
    doc.text(lineasRef[0] || referencia, posXTexto, 21);
  }

  // Línea divisoria corporativa (Acento primario)
  doc.setFillColor(2, 132, 199);
  doc.rect(0, altoCabecera - 0.8, anchoPagina, 1.2, 'F');
};

/**
 * Pie de página corporativo con paginación dinámica y membrete multi-tenant.
 */
export const dibujarPiePaginaCorporativo = (
  doc: any,
  options: PiePaginaPDFOptions = {}
): void => {
  const config = options.tenantConfig || LosColoradosTenantConfig;
  const totalPaginas = doc.internal.getNumberOfPages();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const margenX = options.margenX ?? 14;
  const anchoContenido = anchoPagina - margenX * 2;
  const fechaTexto = options.fechaImpresion || new Date().toLocaleDateString('es-CL');

  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    const pieY = altoPagina - 8;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(margenX, pieY - 3, margenX + anchoContenido, pieY - 3);

    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);

    const membreteIzquierdo = `CIO Predictivo 2.0 — ${config.branding.nombreFaena}`;
    doc.text(membreteIzquierdo, margenX, pieY + 1.5);

    const infoCentro = options.textoCentro || `Respaldo SAP PM | Emisión: ${fechaTexto}`;
    doc.text(infoCentro, anchoPagina / 2, pieY + 1.5, { align: 'center' });

    doc.text(`Página ${p} de ${totalPaginas}`, margenX + anchoContenido, pieY + 1.5, { align: 'right' });
  }
};

/**
 * Portada gerencial para dossiers y cierres mensuales multi-tenant.
 */
export const dibujarPortadaGerencialMensual = async (
  doc: any,
  options: PortadaGerencialOptions = {}
): Promise<void> => {
  const config = options.tenantConfig || LosColoradosTenantConfig;
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const mesAnio = options.mesAnio || 'Periodo Actual';
  const superintendencia = options.superintendencia || 'Superintendencia de Mantenimiento Planta';
  const faena = options.faena || config.branding.nombreFaena;

  await dibujarCabeceraCorporativa(doc, {
    titulo: 'DOSSIER GERENCIAL DE CONFIABILIDAD CBM',
    subtitulo: `Consolidado Mensual — ${mesAnio.toUpperCase()} | ${faena}`,
    referencia: 'Documento Ejecutivo de Confiabilidad y Trazabilidad de Activos',
    margenX: 14,
    tenantConfig: config
  });

  let startY = 52;

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME CONSOLIDADO DE GESTIÓN MENSUAL', 14, startY);

  startY += 10;
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.6);
  doc.line(14, startY, anchoPagina - 14, startY);

  startY += 14;
  const itemsMeta = [
    { label: 'Faena Minera:', val: faena },
    { label: 'Ámbito Operacional:', val: 'Monitoreo de Condición (CBM), Termografía y Vibraciones ISO 20816-3' },
    { label: 'Empresa Matriz / Cliente:', val: config.branding.empresaMatriz || faena },
    { label: 'Superintendencia Solicitante:', val: superintendencia },
    { label: 'Periodo Evaluado:', val: mesAnio }
  ];

  itemsMeta.forEach((item, idx) => {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, 14, startY + idx * 10);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(item.val, 65, startY + idx * 10);
  });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento confidencial para gestión estratégica de confiabilidad y respaldo SAP PM.', 14, altoPagina - 20);
  doc.text(`Fecha de Emisión Oficial: ${new Date().toLocaleDateString('es-CL')}`, 14, altoPagina - 15);
};

export const obtenerSemanaISO = (fechaDada = new Date()): number => {
  const fecha = new Date(fechaDada.getTime());
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7));
  const semana1 = new Date(fecha.getFullYear(), 0, 4);
  return 1 + Math.round(((fecha.getTime() - semana1.getTime()) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);
};

export const formatearFechaNomenclatura = (fecha = new Date()): string => {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  return `${dia}-${mes}-${anio}`;
};

/**
 * Visor PDF embebido tipo modal con descarga directa.
 */
export const abrirVisorPDFInterno = (doc: any, nombreArchivo = 'reporte_cbm.pdf'): void => {
  if (typeof document === 'undefined') return;

  const idModal = 'modal-visor-pdf-interno-global';
  document.getElementById(idModal)?.remove();

  const blob = doc.output('blob');
  const urlBlob = URL.createObjectURL(blob);

  const modal = document.createElement('div');
  modal.id = idModal;
  modal.className = 'modal-overlay';
  modal.style.cssText =
    'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 50px rgba(0,0,0,0.75); border-radius: 12px; width: 95%; max-width: 1120px; height: 92vh; display: flex; flex-direction: column; overflow: hidden;">
      <header style="background: rgba(14, 27, 31, 0.98); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.5rem;" aria-hidden="true">visibility</span>
          <div>
            <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">Vista Previa — Reporte CBM</h3>
            <span style="font-size: 0.74rem; color: #38bdf8; font-family: monospace; font-weight: 600;">${nombreArchivo}</span>
          </div>
        </div>
        <button type="button" id="btn-cerrar-visor-x" style="background: transparent; border: none; color: #94A3B8; font-size: 1.6rem; cursor: pointer; padding: 2px 8px; line-height: 1;">&times;</button>
      </header>

      <div style="flex: 1; width: 100%; background: #16282D; position: relative;">
        <iframe src="${urlBlob}" title="Visor PDF ${nombreArchivo}" style="width: 100%; height: 100%; border: none;"></iframe>
      </div>

      <footer style="padding: 12px 20px; background: rgba(14, 27, 31, 0.98); border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <span style="font-size: 0.75rem; color: #94A3B8;">Plataforma CIO Predictivo 2.0 | Confiabilidad Operacional</span>
        <div style="display: flex; gap: 10px;">
          <button type="button" id="btn-cerrar-visor" style="background: rgba(255,255,255,0.06); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
            Cerrar Vista Previa
          </button>
          <button type="button" id="btn-descargar-visor" style="background: #F5A623; color: #0E1B1F; border: none; padding: 8px 18px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 1.1rem;" aria-hidden="true">download</span>
            <span>Descargar PDF Oficial</span>
          </button>
        </div>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);

  const cerrarModal = () => {
    URL.revokeObjectURL(urlBlob);
    modal.remove();
  };

  modal.querySelector('#btn-cerrar-visor-x')!.addEventListener('click', cerrarModal);
  modal.querySelector('#btn-cerrar-visor')!.addEventListener('click', cerrarModal);
  modal.querySelector('#btn-descargar-visor')!.addEventListener('click', () => {
    doc.save(nombreArchivo);
  });
};

// Exposición global al objeto window para mantener compatibilidad con reportes legados
if (typeof window !== 'undefined') {
  const w = window as any;
  w.abrirVisorPDFInterno = abrirVisorPDFInterno;
  w.obtenerSemanaISO = obtenerSemanaISO;
  w.formatearFechaNomenclatura = formatearFechaNomenclatura;
}