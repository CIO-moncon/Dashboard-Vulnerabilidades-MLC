// ============================================================================
// MÓDULO CORE: GESTOR DE SINCRONIZACIÓN OFFLINE Y COLA DE ALERTAS
// ============================================================================

import { dbAlertas } from './firebase-config.js';

const STORAGE_KEY_COLA = 'cio_cola_alertas_offline';

export const registrarAlertaConRespaldoOffline = async (datosAlerta) => {
    if (navigator.onLine) {
        try {
            await dbAlertas.push({
                ...datosAlerta,
                timestamp: Date.now(),
                sincronizado: true
            });
            return { exito: true, origen: 'red' };
        } catch (err) {
            console.warn('Fallo de red al enviar alerta, guardando en cola local:', err);
            guardarEnColaLocal(datosAlerta);
            return { exito: true, origen: 'offline_fallback' };
        }
    } else {
        guardarEnColaLocal(datosAlerta);
        observarReconexion();
        return { exito: true, origen: 'offline_local' };
    }
};

const guardarEnColaLocal = (alerta) => {
    try {
        const colaActual = JSON.parse(localStorage.getItem(STORAGE_KEY_COLA) || '[]');
        colaActual.push({
            ...alerta,
            timestamp: Date.now(),
            sincronizado: false
        });
        localStorage.setItem(STORAGE_KEY_COLA, JSON.stringify(colaActual));
        
        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Sin conexión: Alerta guardada localmente. Se sincronizará al recuperar señal.', 'alerta');
        }
    } catch (e) {
        console.error('Error al guardar en almacenamiento local offline:', e);
    }
};

const observarReconexion = () => {
    window.addEventListener('online', async () => {
        const colaActual = JSON.parse(localStorage.getItem(STORAGE_KEY_COLA) || '[]');
        if (colaActual.length === 0) return;

        if (typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('Conexión restablecida. Sincronizando reportes pendientes...', 'exito');
        }

        const pendientes = [];
        for (const alerta of colaActual) {
            try {
                delete alerta.sincronizado;
                await dbAlertas.push(alerta);
            } catch (err) {
                console.error('Error sincronizando ítem pendiente:', err);
                pendientes.push(alerta);
            }
        }

        localStorage.setItem(STORAGE_KEY_COLA, JSON.stringify(pendientes));
        if (pendientes.length === 0 && typeof UI !== 'undefined' && UI.mostrarToast) {
            UI.mostrarToast('¡Sincronización offline completada con éxito!', 'exito');
        }
    });
};

// Inicializar observador al cargar módulo
if (typeof window !== 'undefined') {
    observarReconexion();
}