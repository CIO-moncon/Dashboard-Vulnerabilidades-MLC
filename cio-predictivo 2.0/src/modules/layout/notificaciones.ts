export type TipoToast = 'exito' | 'error' | 'alerta' | 'info';

export interface UIController {
  mostrarToast: (mensaje: string, tipo?: TipoToast) => void;
  confirmar: (mensaje: string, titulo?: string) => Promise<boolean>;
}

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const UI: UIController = {
  /**
   * Muestra una notificación flotante tipo Toast accesible y con autocierre.
   */
  mostrarToast: (mensaje = '', tipo: TipoToast = 'exito'): void => {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 8px; max-width: 90vw; pointer-events: none;';
      document.body.appendChild(container);
    }

    const tipoNorm: TipoToast = ['exito', 'error', 'alerta', 'info'].includes(tipo) ? tipo : 'exito';
    const toast = document.createElement('div');
    toast.className = `toast ${tipoNorm}`;
    toast.setAttribute('role', tipoNorm === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', tipoNorm === 'error' ? 'assertive' : 'polite');
    toast.title = 'Haz clic para descartar';
    toast.style.pointerEvents = 'auto';

    let icono = 'check_circle';
    let colorIcono = '#00e676';
    let bordeColor = 'rgba(0, 230, 118, 0.4)';
    let fondoColor = 'rgba(22, 40, 45, 0.95)';

    if (tipoNorm === 'error') {
      icono = 'error';
      colorIcono = '#ef4444';
      bordeColor = 'rgba(239, 68, 68, 0.4)';
    } else if (tipoNorm === 'alerta') {
      icono = 'warning';
      colorIcono = '#F5A623';
      bordeColor = 'rgba(245, 166, 35, 0.4)';
    } else if (tipoNorm === 'info') {
      icono = 'info';
      colorIcono = '#38bdf8';
      bordeColor = 'rgba(56, 189, 248, 0.4)';
    }

    toast.style.cssText = `
      background: ${fondoColor};
      border: 1px solid ${bordeColor};
      border-left: 4px solid ${colorIcono};
      color: #f4f6f5;
      padding: 10px 16px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6);
      font-size: 0.82rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.25s ease;
      backdrop-filter: blur(8px);
    `;

    toast.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 1.25rem; color: ${colorIcono}; flex-shrink: 0;" aria-hidden="true">${icono}</span>
      <span style="flex: 1; line-height: 1.35; white-space: pre-line;">${escaparHTML(mensaje)}</span>
    `;

    const descartar = (): void => {
      if (toast.dataset.descartando) return;
      toast.dataset.descartando = 'true';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 250);
    };

    toast.addEventListener('click', descartar);
    container.appendChild(toast);

    let timerAutoCierre = window.setTimeout(descartar, 3800);
    toast.addEventListener('mouseenter', () => clearTimeout(timerAutoCierre));
    toast.addEventListener('mouseleave', () => {
      timerAutoCierre = window.setTimeout(descartar, 1800);
    });
  },

  /**
   * Modal industrial accesible que reemplaza a window.confirm().
   */
  confirmar: (mensaje = '', titulo = 'Confirmar Acción'): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(true);
        return;
      }

      let modal = document.getElementById('modal-confirmacion');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-confirmacion';
        modal.className = 'modal-overlay oculto';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 100000;';
        modal.innerHTML = `
          <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; width: 95%; max-width: 440px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.8);">
            <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
              <h3 id="modal-confirmacion-titulo" style="margin: 0; color: #ffffff; font-size: 1rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif;"></h3>
              <button type="button" id="btn-cerrar-confirmacion" style="background: transparent; border: none; color: #94A3B8; font-size: 1.4rem; cursor: pointer;">&times;</button>
            </header>
            <div id="modal-confirmacion-mensaje" style="padding: 16px 18px; font-size: 0.85rem; color: #E2E8F0; line-height: 1.45;"></div>
            <footer style="padding: 12px 18px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" id="btn-cancelar-confirmacion" style="background: transparent; color: #94A3B8; border: 1px solid rgba(255,255,255,0.2); padding: 7px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem;">Cancelar</button>
              <button type="button" id="btn-aceptar-confirmacion" style="background: #F5A623; color: #0E1B1F; border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-weight: 800; font-size: 0.8rem;">Aceptar</button>
            </footer>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const tituloEl = document.getElementById('modal-confirmacion-titulo');
      const mensajeEl = document.getElementById('modal-confirmacion-mensaje');
      const btnAceptar = document.getElementById('btn-aceptar-confirmacion');
      const btnCancelar = document.getElementById('btn-cancelar-confirmacion');
      const btnCerrar = document.getElementById('btn-cerrar-confirmacion');

      const elementoPrevio = document.activeElement as HTMLElement | null;

      if (tituloEl) tituloEl.textContent = titulo;
      if (mensajeEl) mensajeEl.textContent = mensaje;

      modal.classList.remove('oculto');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');

      const limpiarYResolver = (resultado: boolean): void => {
        if (!modal) return;
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

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          limpiarYResolver(false);
        } else if (e.key === 'Enter' && document.activeElement === btnAceptar) {
          e.preventDefault();
          limpiarYResolver(true);
        }
      };

      const onBackdropClick = (e: MouseEvent) => {
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

// Registro en el objeto window para retrocompatibilidad con scripts existentes
if (typeof window !== 'undefined') {
  (window as any).UI = UI;
}

export default UI;