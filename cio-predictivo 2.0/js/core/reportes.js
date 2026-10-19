// ============================================================================
// MÓDULO CORE: GENERACIÓN DE REPORTES PDF (EXPEDIENTE CBM)
// CIO PREDICTIVO 2.0 — Estándar ES6+, Escalado Proporcional y Gestión de Memoria
// ============================================================================

/**
 * Genera y descarga un informe ejecutivo en PDF capturando el expediente técnico.
 * 
 * @param {string} tagEquipo - Identificador TAG del activo.
 * @param {string} elementoId - ID del contenedor DOM que se exportará.
 * @returns {Promise<boolean>} Indica si la exportación concluyó con éxito.
 */
export const generarPDFExpediente = async (tagEquipo = 'ACTIVO_CBM', elementoId = 'espacio-trabajo-dinamico') => {
    const elemento = document.getElementById(elementoId);
    if (!elemento) {
        console.warn(`[Reportes] No se encontró el contenedor con ID: ${elementoId}`);
        return false;
    }

    if (!window.html2canvas || !window.jspdf?.jsPDF) {
        const errorMsg = 'Librerías html2canvas o jsPDF no disponibles en el entorno.';
        console.error(`[Reportes] ${errorMsg}`);
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Error: Librería de generación PDF no disponible.', 'error');
        } else {
            alert(errorMsg);
        }
        return false;
    }

    // Localización de elementos de interfaz para ocultar durante la captura
    const btnExportar = document.getElementById('btn-exportar-pdf');
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
        // 1. Captura gráfica limpia con soporte CORS y alta fidelidad
        const canvas = await window.html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#0f172a',
            useCORS: true,
            allowTaint: false,
            logging: false,
            scrollX: 0,
            scrollY: 0
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        // 2. Inicialización de documento PDF (Tamaño Carta, horizontal)
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // 3. Formateo normativo de fecha de emisión (DD-MM-YYYY)
        const fecha = new Date();
        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();
        const fechaStr = `${dia}-${mes}-${anio}`;

        // 4. Encabezado corporativo institucional
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(248, 250, 252);
        pdf.text("CPF Ingeniería — Departamento de Confiabilidad y Monitoreo Predictivo (CBM)", 12, 10);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text("Faena: Compañía Minera del Pacífico (CMP) — Mina Los Colorados", 12, 15);
        
        // Fecha alineada a la derecha
        pdf.text(`Fecha de Emisión: ${fechaStr}`, pageWidth - 12, 10, { align: 'right' });

        // 5. Cálculo proporcional sin desbordamiento (Fit to Page)
        const marginX = 12;
        const marginTop = 20;
        const marginBottom = 14;
        
        const maxWidth = pageWidth - (marginX * 2);
        const maxHeight = pageHeight - marginTop - marginBottom;

        let renderWidth = maxWidth;
        let renderHeight = (canvas.height * maxWidth) / canvas.width;

        if (renderHeight > maxHeight) {
            renderHeight = maxHeight;
            renderWidth = (canvas.width * maxHeight) / canvas.height;
        }

        const posX = marginX + (maxWidth - renderWidth) / 2;
        const posY = marginTop;

        // 6. Inserción de la captura gráfica en el PDF
        pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');

        // Liberación de memoria del canvas
        canvas.width = 0;
        canvas.height = 0;

        // 7. Pie de página y firma técnica de trazabilidad
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(
            "Documento oficial generado por CIO Predictivo 2.0 — Plataforma de Confiabilidad CPF Ingeniería para CMP",
            12,
            pageHeight - 6
        );

        // 8. Sanitización de nombre de archivo y descarga
        const tagSeguro = String(tagEquipo).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const nombreArchivo = `Expediente_${tagSeguro}_${fechaStr}.pdf`;
        pdf.save(nombreArchivo);

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast(`Expediente ${tagSeguro} exportado exitosamente a PDF.`, 'exito');
        }

        return true;

    } catch (error) {
        console.error("[Reportes] Error al generar documento PDF:", error);
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast("Error al exportar el documento PDF.", "error");
        } else {
            alert("Ocurrió un error al generar el documento PDF.");
        }
        return false;

    } finally {
        // Restauración estricta de la interfaz gráfica original
        if (divBotones) {
            divBotones.style.display = displayOriginal;
        }
        if (btnExportar) {
            btnExportar.innerHTML = textoOriginal;
            btnExportar.disabled = false;
        }
    }
};