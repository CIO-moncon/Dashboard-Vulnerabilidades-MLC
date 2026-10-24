import { OutboxDatabase, OutboxItem } from './outboxDatabase';
import { AuthService } from '../auth/authService';

export class SyncManager {
  private static sincronizando = false;
  private static apiUrl = '/api/cbm/sincronizar-outbox';

  public static inicializar(apiUrl?: string): void {
    if (apiUrl) this.apiUrl = apiUrl;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.sincronizarPendientes();
      });
    }
  }

  public static async despacharOEncolar<T>(
    resource: string,
    actionType: OutboxItem['actionType'],
    payload: T
  ): Promise<{ sincronizadoDirecto: boolean; item: any }> {
    const sesion = AuthService.getSesion();
    const tenantId = sesion?.tenantId ?? 'default_tenant';
    const userId = sesion?.uid ?? 'anon_user';

    if (navigator.onLine) {
      try {
        const response = await fetch('/api/cbm/registro-directo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...AuthService.getHeadersTenant()
          },
          body: JSON.stringify({ resource, actionType, payload })
        });

        if (response.ok) {
          return { sincronizadoDirecto: true, item: await response.json() };
        }
      } catch (err) {
        console.warn('[SyncManager] Error de red. Fallback a cola Outbox IndexedDB:', err);
      }
    }

    // Si falló la red o estamos offline: persistir en IndexedDB
    const itemEncolado = await OutboxDatabase.encolarOperacion(tenantId, userId, actionType, resource, payload);
    return { sincronizadoDirecto: false, item: itemEncolado };
  }

  public static async sincronizarPendientes(): Promise<void> {
    if (this.sincronizando || !navigator.onLine) return;

    const sesion = AuthService.getSesion();
    if (!sesion) return;

    try {
      this.sincronizando = true;
      const pendientes = await OutboxDatabase.obtenerPendientesPorTenant(sesion.tenantId);
      if (pendientes.length === 0) return;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getHeadersTenant()
        },
        body: JSON.stringify({ items: pendientes })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const exitosos: string[] = data.sincronizados ?? [];

      if (exitosos.length > 0) {
        await OutboxDatabase.eliminarItems(exitosos);
        console.info(`[SyncManager] Sincronizados ${exitosos.length} registros offline exitosamente.`);
      }
    } catch (error) {
      console.error('[SyncManager] Falló la sincronización con el servidor:', error);
    } finally {
      this.sincronizando = false;
    }
  }
}