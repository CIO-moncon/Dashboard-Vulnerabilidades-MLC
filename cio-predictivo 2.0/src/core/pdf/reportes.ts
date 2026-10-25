import { TenantConfig } from '../types/tenant.types';
import { LosColoradosTenantConfig } from '../../tenants/los-colorados.config';
import { abrirVisorPDFInterno } from './pdfPlantilla';

declare const window: any;

export interface GenerarPDFExpedienteOptions {
  tagEquipo?: string;
  elementoId?: string;
  tenantConfig?: TenantConfig;
  abrirEnVisor?: boolean;
}

/**
 * Genera un informe ejecutivo capturando el expediente técnico CBM y adaptándolo
 * dinámicamente al tenant activo con escalado proporcional y liberación de memoria.
 */
export const generarPDFExpediente = async ({
  tagEquipo = 'ACTIVO_CBM',
  elementoId = 'espacio-trabajo-dinamico',
  tenantConfig = LosColoradosTenantConfig,
  abrirEnVisor = true
}: GenerarPDFExpedienteOptions = {}): Promise<boolean> => {
  if (typeof document === 'undefined') return false;

  const elemento = document.getElementById(elementoId);
  if (!elemento) {
    console.warn(`[Reportes] No se encontró el contenedor con ID: ${elementoId}`);
    return false;
  }

  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    const errorMsg = 'Librerías html2canvas o jsPDF no disponibles en el entorno.';
    console.error(`[Reportes] ${errorMsg}`);
    if (typeof window.UI !== 'undefined' && window.UI.mostrarToast) {
      window.UI.mostrarToast('Error: Librería de generación PDF no disponible.', 'error');
    } else {
      alert(errorMsg);
    }
    return false;
  }

  // Ocultar controles de acción durante la captura
  const btnExportar = document.getElementById('btn-exportar-pdf') as HTMLButtonElement | null;
  const divBotones = btnExportar?.parentElement ?? null;

  const textoOriginal = btnExportar ? btnExportar.innerHTML : '';
  const displayOriginal = divBotones ? divBotones.style.display : '';

  if (btnExportar) {
    btnExportar.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;" aria-hidden="true">autorenew</span> Procesando...`;
    btnExportar.disabled = true;
  }

  if (divBotones) {
    divBotones.style.display = 'none';
  }

  try {
    // 1. Renderizado a Canvas (Escala 2x para nitidez industrial)
    const canvas = await window.html2canvas(elemento, {
      scale: 2,
      backgroundColor: '#0E1B1F',
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: 0
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    // 2. Inicialización del documento jsPDF (Letter horizontal)
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'letter'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // 3. Formateo de fecha (DD-MM-YYYY)
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    const fechaStr = `${dia}-${mes}-${anio}`;

    // 4. Encabezado corporativo dinámico por Faena
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(248, 250, 252);
    const matrizTexto = tenantConfig.branding.empresaMatriz
      ? `${tenantConfig.branding.empresaMatriz} — `
      : '';
    pdf.text(`${matrizTexto}Departamento de Confiabilidad y Predictivo (CBM)`, 12, 10);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Faena: ${tenantConfig.branding.nombreFaena}`, 12, 15);

    pdf.text(`Fecha de Emisión: ${fechaStr}`, pageWidth - 12, 10, { align: 'right' });

    // 5. Ajuste proporcional en página (Fit to Page)
    const marginX = 12;
    const marginTop = 20;
    const marginBottom = 14;

    const maxWidth = pageWidth - marginX * 2;
    const maxHeight = pageHeight - marginTop - marginBottom;

    let renderWidth = maxWidth;
    let renderHeight = (canvas.height * maxWidth) / canvas.width;

    if (renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = (canvas.width * maxHeight) / canvas.height;
    }

    const posX = marginX + (maxWidth - renderWidth) / 2;
    const posY = marginTop;

    // 6. Inserción de la captura
    pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');

    // Liberación de recursos en memoria
    canvas.width = 0;
    canvas.height = 0;

    // 7. Pie de página institucional
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `Documento oficial generado por CIO Predictivo 2.0 — ${tenantConfig.branding.nombreFaena}`,
      12,
      pageHeight - 6
    );

    // 8. Sanitización del nombre de archivo y salida
    const tagSeguro = String(tagEquipo).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const nombreArchivo = `Expediente_${tagSeguro}_${fechaStr}.pdf`;

    if (abrirEnVisor) {
      abrirVisorPDFInterno(pdf, nombreArchivo);
    } else {
      pdf.save(nombreArchivo);
    }

    if (typeof window.UI !== 'undefined' && window.UI.mostrarToast) {
      window.UI.mostrarToast(`Expediente ${tagSeguro} procesado exitosamente.`, 'exito');
    }

    return true;
  } catch (error) {
    console.error('[Reportes] Error al generar documento PDF:', error);
    if (typeof window.UI !== 'undefined' && window.UI.mostrarToast) {
      window.UI.mostrarToast('Error al exportar el documento PDF.', 'error');
    } else {
      alert('Ocurrió un error al generar el documento PDF.');
    }
    return false;
  } finally {
    // Restauración de controles en el DOM
    if (divBotones) {
      divBotones.style.display = displayOriginal;
    }
    if (btnExportar) {
      btnExportar.innerHTML = textoOriginal;
      btnExportar.disabled = false;
    }
  }
};

if (typeof window !== 'undefined') {
  window.generarPDFExpediente = (tag: string, idEl: string) =>
    generarPDFExpediente({ tagEquipo: tag, elementoId: idEl });
}