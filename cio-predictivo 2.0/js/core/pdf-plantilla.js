// ============================================================================
// MÓDULO CORE: JS/CORE/PDF-PLANTILLA.JS
// CIO PREDICTIVO 2.0 — Plantilla Maestra Corporativa y Dossier Gerencial
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
 * Cabecera corporativa estándar (Fondo blanco puro, logo y sello opcional).
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

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, anchoPagina, altoCabecera, 'F');

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

    if (severidad) {
        const paleta = resolverPaletaSeveridadISO(severidad);
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
        doc.text(String(textoCondicion).toUpperCase(), xBadge + (anchoBadge / 2), yBadge + 5.5, { align: 'center' });

        doc.setFontSize(8.5);
        doc.text(paleta.etiqueta, xBadge + (anchoBadge / 2), yBadge + 12.8, { align: 'center' });
    }

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

    doc.setFillColor(2, 132, 199);
    doc.rect(0, altoCabecera - 0.8, anchoPagina, 1.2, 'F');
};

/**
 * Pie de página corporativo con paginación dinámica.
 */
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

/**
 * Portada Gerencial con Cabecera Blanca Estándar (Página 1).
 */
export const dibujarPortadaGerencialMensual = async (doc, {
    mesAnio = 'Octubre 2026',
    superintendencia = 'Superintendencia de Mantenimiento Planta',
    faena = 'Planta Mina Los Colorados (CMP)'
} = {}) => {
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();

    // 1. Dibujar la cabecera estándar de fondo blanco con el logotipo de CPF
    await dibujarCabeceraCorporativa(doc, {
        titulo: 'DOSSIER GERENCIAL DE CONFIABILIDAD',
        subtitulo: `Consolidado Mensual CBM — ${mesAnio.toUpperCase()} | Planta Mina Los Colorados (CMP)`,
        referencia: 'Documento Ejecutivo de Gestión de Activos y Respaldo Confiabilidad CBM',
        margenX: 14
    });

    // 2. Contenido de la portada adaptado a fondo blanco limpio
    let startY = 50;
    
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
        { label: 'Ámbito de Análisis:', val: 'Monitoreo Condición Mecánica (CBM) & Vibraciones ISO 20816-3' },
        { label: 'Organización Emisora:', val: 'CPF Ingeniería Ltda. — Especialistas en Confiabilidad' },
        { label: 'Gerencia Solicitante:', val: superintendencia },
        { label: 'Periodo Evaluado:', val: mesAnio }
    ];

    itemsMeta.forEach((item, idx) => {
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(item.label, 14, startY + (idx * 10));

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(item.val, 65, startY + (idx * 10));
    });

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Documento confidencial de gestión de activos críticos y respaldo SAP PM.', 14, altoPagina - 20);
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-CL')}`, 14, altoPagina - 15);
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

export const abrirVisorPDFInterno = (doc, nombreArchivo = 'reporte_cbm.pdf') => {
    const idModal = 'modal-visor-pdf-interno-global';
    document.getElementById(idModal)?.remove();

    const blob = doc.output('blob');
    const urlBlob = URL.createObjectURL(blob);

    const modal = document.createElement('div');
    modal.id = idModal;
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease;';

    modal.innerHTML = `
        <div class="modal-box glass-panel" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 24px 50px rgba(0,0,0,0.75); border-radius: 12px; width: 95%; max-width: 1120px; height: 92vh; display: flex; flex-direction: column; overflow: hidden;">
            <header style="background: rgba(15, 23, 42, 0.98); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.5rem;" aria-hidden="true">visibility</span>
                    <div>
                        <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800;">Vista Previa Oficial — Documento CBM</h3>
                        <span style="font-size: 0.74rem; color: #38bdf8; font-family: monospace; font-weight: 600;">${nombreArchivo}</span>
                    </div>
                </div>
                <button type="button" id="btn-cerrar-visor-x" style="background: transparent; border: none; color: #94a3b8; font-size: 1.6rem; cursor: pointer; padding: 2px 8px; line-height: 1;">&times;</button>
            </header>

            <div style="flex: 1; width: 100%; background: #1e293b; position: relative;">
                <iframe src="${urlBlob}" title="Visor PDF ${nombreArchivo}" style="width: 100%; height: 100%; border: none;"></iframe>
            </div>

            <footer style="padding: 12px 20px; background: rgba(15, 23, 42, 0.98); border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <span style="font-size: 0.75rem; color: #94a3b8;">Planta Mina Los Colorados (CMP) — CPF Ingeniería Ltda.</span>
                <div style="display: flex; gap: 10px;">
                    <button type="button" id="btn-cerrar-visor" style="background: rgba(255,255,255,0.06); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                        Cerrar Vista Previa
                    </button>
                    <button type="button" id="btn-descargar-visor" style="background: #0284c7; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);">
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

    modal.querySelector('#btn-cerrar-visor-x').onclick = cerrarModal;
    modal.querySelector('#btn-cerrar-visor').onclick = cerrarModal;
    modal.querySelector('#btn-descargar-visor').onclick = () => {
        doc.save(nombreArchivo);
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast(`✅ PDF descargado: ${nombreArchivo}`, 'exito');
        }
    };
};

window.abrirVisorPDFInterno = abrirVisorPDFInterno;

export default {
    obtenerLogoBase64,
    dibujarCabeceraCorporativa,
    dibujarPiePaginaCorporativo,
    dibujarPortadaGerencialMensual,
    resolverPaletaSeveridadISO,
    obtenerSemanaISO,
    formatearFechaNomenclatura,
    abrirVisorPDFInterno
};