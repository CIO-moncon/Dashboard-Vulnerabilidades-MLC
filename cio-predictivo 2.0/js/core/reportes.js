// ==========================================
// MÓDULO CORE: GENERACIÓN DE REPORTES PDF
// ==========================================

export async function generarPDFExpediente(tagEquipo, elementoId) {
    const elemento = document.getElementById(elementoId);
    if (!elemento) return;

    // Obtener los botones para ocultarlos temporalmente
    const btnExportar = document.getElementById('btn-exportar-pdf');
    const divBotones = btnExportar.parentElement; // El div que contiene ambos botones
    
    // Guardar estado original
    const textoOriginal = btnExportar.innerHTML;
    btnExportar.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Procesando...`;
    
    // OCULTAR BOTONES PARA QUE NO SALGAN EN EL PDF
    divBotones.style.display = 'none';

    try {
        // 1. Tomar "fotografía" limpia del contenedor HTML
        const canvas = await html2canvas(elemento, {
            scale: 2, 
            backgroundColor: '#0d1117', 
            logging: false
        });

        const imgData = canvas.toDataURL('image/png');

        // 2. Inicializar documento PDF (Tamaño Carta, horizontal)
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        // 3. Calcular proporciones 
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        // --- FORMATEAR FECHA --- (DD-MM-YYYY)
        const fecha = new Date();
        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();
        const fechaStr = `${dia}-${mes}-${anio}`;

        // 4. Inyectar branding corporativo en el PDF
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text("CPF Ingeniería - Departamento de Confiabilidad (CBM)", 10, 10);
        pdf.text("Faena: Compañía Minera del Pacífico (CMP) - Mina Los Colorados", 10, 15);
        pdf.text(`Fecha de Emisión: ${fechaStr}`, pdfWidth - 50, 10);

        // 5. Pegar la imagen del dashboard sin botones
        pdf.addImage(imgData, 'PNG', 10, 25, pdfWidth - 20, pdfHeight - 20);

        // 6. Firma digital en el pie de página
        pdf.setFontSize(8);
        pdf.text("Documento generado automáticamente por CIO Predictivo 2.0 - Desarrollado por Francisco Leiva", 10, pdf.internal.pageSize.getHeight() - 10);

        // 7. GUARDAR CON EL NOMBRE SOLICITADO: Equipo_Fecha.pdf
        const nombreArchivo = `${tagEquipo}_${fechaStr}.pdf`;
        pdf.save(nombreArchivo);

    } catch (error) {
        console.error("Error al generar PDF:", error);
        alert("Ocurrió un error al generar el documento PDF.");
    } finally {
        // RESTAURAR LOS BOTONES A LA INTERFAZ
        divBotones.style.display = 'flex';
        btnExportar.innerHTML = textoOriginal;
    }
}