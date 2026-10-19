// ============================================================================
// MÓDULO CORE: JS/CORE/PDF-PLANTILLA.JS
// CIO PREDICTIVO 2.0 — Plantilla Maestra Corporativa (Títulos Autoajustables)
// ============================================================================

let logoBase64Cache = null;

export const obtenerLogoBase64 = (rutaLogo = './assets/img/logo-cpf.png') => {
    if (logoBase64Cache) return Promise.resolve(logoBase64Cache);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                logoBase64Cache = canvas.toDataURL('image/png');
                resolve(logoBase64Cache);
            } catch (err) {
                console.warn('[PDF-Plantilla] No se pudo convertir el logo a base64:', err);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = rutaLogo;
    });
};

export const resolverPaletaSeveridadISO = (severidadRaw = '') => {
    const sev = String(severidadRaw || '').trim().toUpperCase();

    if (sev === 'ROJO' || sev === 'CRITICO' || sev === 'D') {
        return {
            bg: [254, 226, 226],
            text: [153, 27, 27],
            border: [239, 68, 68],
            hex: '#ef4444',
            etiqueta: 'CRÍTICO (ZONA D)',
            estadoCorto: 'Zona D (Crítico)'
        };
    }
    if (sev === 'NARANJA' || sev === 'SALMON' || sev === 'ALERTA' || sev === 'C') {
        return {
            bg: [255, 237, 213],
            text: [154, 52, 18],
            border: [249, 115, 22],
            hex: '#f97316',
            etiqueta: 'ALERTA (ZONA C)',
            estadoCorto: 'Zona C (Alerta)'
        };
    }
    if (sev === 'AMARILLO' || sev === 'SEGUIMIENTO' || sev === 'B') {
        return {
            bg: [254, 249, 195],
            text: [133, 77, 14],
            border: [234, 179, 8],
            hex: '#eab308',
            etiqueta: 'SEGUIMIENTO (ZONA B)',
            estadoCorto: 'Zona B (Seguimiento)'
        };
    }
    if (sev === 'SIN_DATOS' || sev === 'VACIO') {
        return {
            bg: [241, 245, 249],
            text: [100, 116, 139],
            border: [203, 213, 225],
            hex: '#94a3b8',
            etiqueta: 'SIN MEDICIÓN HOY',
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
 * Dibuja la cabecera corporativa blindada contra desbordes y cortes de texto.
 */
export const dibujarCabeceraCorporativa = async (doc, {
    titulo = 'REPORTE TÉCNICO DE CONDICIÓN MECÁNICA — CBM',
    subtitulo = 'Planta Mina Los Colorados (CMP) | CPF Ingeniería Ltda.',
    referencia = 'Documento Oficial de Respaldo para Notificación / Cierre Técnico SAP PM',
    severidad = null,
    textoCondicion = 'CONDICIÓN CBM',
    margenX = 14
} = {}) => {
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoCabecera = 28;

    // 1. Fondo blanco puro
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, anchoPagina, altoCabecera, 'F');

    // 2. Logotipo CPF a la izquierda
    const logoBase64 = await obtenerLogoBase64();
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', margenX, 3.5, 33, 20.5);
    } else {
        doc.setTextColor(2, 132, 199);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CPF INGENIERÍA', margenX + 2, 16);
    }

    const posXTexto = margenX + 36;
    let anchoDisponibleTexto = anchoPagina - margenX - posXTexto;

    // 3. Sello de Condición en la esquina superior derecha
    if (severidad) {
        const paleta = resolverPaletaSeveridadISO(severidad);
        const anchoBadge = 46;
        const altoBadge = 18;
        const xBadge = anchoPagina - margenX - anchoBadge;
        const yBadge = 4.5;

        // Margen de seguridad antes del sello
        anchoDisponibleTexto = xBadge - posXTexto - 5;

        doc.setFillColor(...paleta.bg);
        doc.setDrawColor(...paleta.border);
        doc.setLineWidth(0.7);
        doc.roundedRect(xBadge, yBadge, anchoBadge, altoBadge, 2.5, 2.5, 'FD');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...paleta.text);
        doc.text(String(textoCondicion).toUpperCase(), xBadge + (anchoBadge / 2), yBadge + 5.5, { align: 'center' });

        doc.setFontSize(8.5);
        doc.text(paleta.etiqueta, xBadge + (anchoBadge / 2), yBadge + 12.8, { align: 'center' });
    }

    // 4. Auto-ajuste dinámico del título para evitar cortes
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');

    let tamanoFuenteTitulo = 11;
    doc.setFontSize(tamanoFuenteTitulo);

    // Si excede el ancho, reducir gradualmente la fuente hasta 9pt
    while (doc.getTextWidth(titulo) > anchoDisponibleTexto && tamanoFuenteTitulo > 9) {
        tamanoFuenteTitulo -= 0.5;
        doc.setFontSize(tamanoFuenteTitulo);
    }

    // Dividir en multilínea sin perder texto
    const lineasTitulo = doc.splitTextToSize(titulo, anchoDisponibleTexto);

    if (lineasTitulo.length > 1) {
        // Título en dos renglones balanceados
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
        // Título en un solo renglón
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

    // 5. Franja azul corporativa CPF
    doc.setFillColor(2, 132, 199);
    doc.rect(0, altoCabecera - 0.8, anchoPagina, 1.2, 'F');
};

export const dibujarPiePaginaCorporativo = (doc, {
    fechaImpresion = '',
    textoCentro = '',
    margenX = 14
} = {}) => {
    const totalPaginas = doc.internal.getNumberOfPages();
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoContenido = anchoPagina - (margenX * 2);
    const fechaTexto = fechaImpresion || new Date().toLocaleDateString('es-CL');

    for (let p = 1; p <= totalPaginas; p++) {
        doc.setPage(p);
        const pieY = altoPagina - 8;

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margenX, pieY - 3, margenX + anchoContenido, pieY - 3);

        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);

        doc.text('CIO Predictivo 2.0 — CPF Ingeniería Ltda. | Planta Mina Los Colorados (CMP)', margenX, pieY + 1.5);
        const infoCentro = textoCentro || `Documento Oficial SAP PM | Fecha: ${fechaTexto}`;
        doc.text(infoCentro, anchoPagina / 2, pieY + 1.5, { align: 'center' });
        doc.text(`Página ${p} de ${totalPaginas}`, margenX + anchoContenido, pieY + 1.5, { align: 'right' });
    }
};

export const obtenerSemanaISO = (fechaDada = new Date()) => {
    const fecha = new Date(fechaDada.getTime());
    fecha.setHours(0, 0, 0, 0);
    fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7));
    const semana1 = new Date(fecha.getFullYear(), 0, 4);
    return 1 + Math.round(((fecha.getTime() - semana1.getTime()) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);
};

export const formatearFechaNomenclatura = (fecha = new Date()) => {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}-${mes}-${anio}`;
};

export default {
    obtenerLogoBase64,
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    resolverPaletaSeveridadISO,
    obtenerSemanaISO,
    formatearFechaNomenclatura
};