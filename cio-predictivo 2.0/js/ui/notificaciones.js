// ============================================================================
// MÓDULO UI: NOTIFICACIONES TOAST Y MODAL INDUSTRIAL ACCESIBLE
// CIO PREDICTIVO 2.0 — Estándar ES6+, Glassmorphism, WAI-ARIA y Soporte Dual
// ============================================================================

const UI = {
    /**
     * Muestra una notificación flotante tipo Toast en la esquina inferior derecha.
     */
    mostrarToast: (mensaje = '', tipo = 'exito') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const tipoNorm = ['exito', 'error', 'alerta', 'info'].includes(tipo) ? tipo : 'exito';
        const toast = document.createElement('div');
        toast.className = `toast ${tipoNorm}`;
        toast.setAttribute('role', tipoNorm === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', tipoNorm === 'error' ? 'assertive' : 'polite');
        toast.title = 'Haz clic para descartar';

        let icono = 'check_circle';
        if (tipoNorm === 'error') icono = 'error';
        else if (tipoNorm === 'alerta') icono = 'warning';
        else if (tipoNorm === 'info') icono = 'info';

        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined" style="font-size: 1.25rem; flex-shrink: 0;" aria-hidden="true">${icono}</span>
                <span style="flex: 1; line-height: 1.35;">${mensaje}</span>
            </div>
        `;

        const descartar = () => {
            if (toast.dataset.descartando) return;
            toast.dataset.descartando = 'true';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 250);
        };

        toast.addEventListener('click', descartar);
        container.appendChild(toast);

        const timerAutoCierre = setTimeout(descartar, 3800);
        toast.addEventListener('mouseenter', () => clearTimeout(timerAutoCierre));
        toast.addEventListener('mouseleave', () => setTimeout(descartar, 1800));
    },

    /**
     * Modal industrial de confirmación que reemplaza por completo a window.confirm().
     */
    confirmar: (mensaje = '', titulo = 'Confirmar Acción') => {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirmacion');
            const tituloEl = document.getElementById('modal-confirmacion-titulo');
            const mensajeEl = document.getElementById('modal-confirmacion-mensaje');
            const btnAceptar = document.getElementById('btn-aceptar-confirmacion');
            const btnCancelar = document.getElementById('btn-cancelar-confirmacion');
            const btnCerrar = document.getElementById('btn-cerrar-confirmacion');

            if (!modal) {
                console.warn('[UI] No se encontró #modal-confirmacion en el DOM.');
                resolve(true);
                return;
            }

            const elementoPrevio = document.activeElement;

            if (tituloEl) tituloEl.textContent = titulo;
            if (mensajeEl) mensajeEl.innerHTML = mensaje;

            // Mostrar el modal eliminando la clase que lo oculta
            modal.classList.remove('oculto');
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');

            const limpiarYResolver = (resultado) => {
                modal.classList.add('oculto');
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');

                btnAceptar?.removeEventListener('click', onAceptar);
                btnCancelar?.removeEventListener('click', onCancelar);
                btnCerrar?.removeEventListener('click', onCancelar);
                document.removeEventListener('keydown', onKeyDown);
                modal.removeEventListener('click', onBackdropClick);

                if (elementoPrevio && typeof elementoPrevio.focus === 'function') {
                    elementoPrevio.focus();
                }

                resolve(resultado);
            };

            const onAceptar = () => limpiarYResolver(true);
            const onCancelar = () => limpiarYResolver(false);

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    limpiarYResolver(false);
                } else if (e.key === 'Enter' && document.activeElement === btnAceptar) {
                    e.preventDefault();
                    limpiarYResolver(true);
                }
            };

            const onBackdropClick = (e) => {
                if (e.target === modal) limpiarYResolver(false);
            };

            btnAceptar?.addEventListener('click', onAceptar);
            btnCancelar?.addEventListener('click', onCancelar);
            btnCerrar?.addEventListener('click', onCancelar);
            document.addEventListener('keydown', onKeyDown);
            modal.addEventListener('click', onBackdropClick);

            setTimeout(() => {
                (btnCancelar || btnAceptar)?.focus();
            }, 50);
        });
    }
};

// Registro explícito en el objeto window para disponibilidad inmediata en todo el sistema
if (typeof window !== 'undefined') {
    window.UI = UI;
}

export default UI;
export { UI };