// ==========================================
// MÓDULO DE NOTIFICACIONES Y MODALES (UI)
// ==========================================

const UI = {
    /**
     * Muestra una notificación tipo Toast en la esquina inferior derecha.
     * @param {string} mensaje El texto a mostrar.
     * @param {string} tipo 'exito', 'error' o 'alerta' (por defecto 'exito').
     */
    mostrarToast: (mensaje, tipo = 'exito') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        
        // Iconos basados en Material Symbols que ya tienes integrados
        let icono = 'check_circle';
        if (tipo === 'error') icono = 'error';
        if (tipo === 'alerta') icono = 'warning';

        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined">${icono}</span>
                <span>${mensaje}</span>
            </div>
        `;

        container.appendChild(toast);

        // Eliminar el toast después de 3.5 segundos
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300); // Esperar que termine la animación
        }, 3500);
    },

    /**
     * Muestra un modal de confirmación con la estética del sistema.
     * Reemplaza a window.confirm().
     * @param {string} mensaje El texto de la pregunta (soporta HTML).
     * @param {string} titulo (Opcional) Título del modal.
     * @returns {Promise<boolean>} Promesa que se resuelve con true o false.
     */
    confirmar: (mensaje, titulo = 'Confirmar Acción') => {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirmacion');
            const tituloEl = document.getElementById('modal-confirmacion-titulo');
            const mensajeEl = document.getElementById('modal-confirmacion-mensaje');
            const btnAceptar = document.getElementById('btn-aceptar-confirmacion');
            const btnCancelar = document.getElementById('btn-cancelar-confirmacion');
            const btnCerrar = document.getElementById('btn-cerrar-confirmacion');

            if (!modal) {
                console.error("No se encontró el contenedor del modal en el HTML.");
                resolve(false);
                return;
            }

            // Configurar textos
            tituloEl.textContent = titulo;
            // 🐛 SOLUCIÓN AL BUG-005: Usar innerHTML para interpretar etiquetas <br> y <b>
            mensajeEl.innerHTML = mensaje; 

            // Mostrar Modal
            modal.classList.remove('oculto');

            // Función para limpiar eventos y cerrar
            const cerrarModal = (resultado) => {
                modal.classList.add('oculto');
                // Remover los event listeners para evitar ejecuciones múltiples en el futuro
                btnAceptar.removeEventListener('click', onAceptar);
                btnCancelar.removeEventListener('click', onCancelar);
                btnCerrar.removeEventListener('click', onCancelar);
                resolve(resultado);
            };

            // Handlers
            const onAceptar = () => cerrarModal(true);
            const onCancelar = () => cerrarModal(false);

            // Asignar eventos
            btnAceptar.addEventListener('click', onAceptar);
            btnCancelar.addEventListener('click', onCancelar);
            btnCerrar.addEventListener('click', onCancelar);
        });
    }
};
