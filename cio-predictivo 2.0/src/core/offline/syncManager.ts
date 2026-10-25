import { OutboxDatabase, OutboxItem } from './outboxDatabase';
import { AuthService } from '../auth/authService';

export interface DespachoResultado<T = unknown> {
  sincronizadoDirecto: boolean;
  item: T | OutboxItem<T>;
  error?: string;
}

export interface SyncStats {
  total: number;
  exitosos: number;
  fallidos: number;
}

export type SyncEventListener = (estado: { sincronizando: boolean; pendientes: number }) => void;

export class SyncManager {
  private static sincronizando = false;
  private static apiUrlBatch = '/api/cbm/sincronizar-outbox';
  private static apiUrlDirecto = '/api/cbm/registro-directo';
  private static readonly TAMANO_LOTE = 25;
  private static readonly MAX_INTENTOS = 5;
  private static listeners: Set<SyncEventListener> = new Set();

  public static inicializar(endpoints?: { batch?: string; directo?: string }): void {
    if (endpoints?.batch) this.apiUrlBatch = endpoints.batch;
    if (endpoints?.directo) this.apiUrlDirecto = endpoints.directo;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.info('[SyncManager] Conexión restablecida. Iniciando sincronización...');
        this.sincronizarPendientes();
      });
    }
  }

  public static suscribirEstado(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notificarEstado(pendientes: number): void {
    this.listeners.forEach((fn) => fn({ sincronizando: this.sincronizando, pendientes }));
  }

  public static async despacharOEncolar<T>(
    resource: string,
    actionType: OutboxItem['actionType'],
    payload: T
  ): Promise<DespachoResultado<T>> {
    const sesion = AuthService.getSesion();
    const tenantId = sesion?.tenantId ?? 'default_tenant';
    const userId = sesion?.uid ?? 'anon_user';

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const response = await fetch(this.apiUrlDirecto, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...AuthService.getHeadersTenant()
          },
          body: JSON.stringify({ resource, actionType, payload })
        });

        if (response.ok) {
          const resultadoServidor = (await response.json()) as T;
          return { sincronizadoDirecto: true, item: resultadoServidor };
        }

        console.warn(
          `[SyncManager] Servidor devolvió HTTP ${response.status}. Encolando en Outbox IndexedDB.`
        );
      } catch (err) {
        console.warn('[SyncManager] Error de red. Fallback a cola Outbox IndexedDB:', err);
      }
    }

    // Persistir en cola offline local si falló la red o no hay conexión
    const itemEncolado = await OutboxDatabase.encolarOperacion(
      tenantId,
      userId,
      actionType,
      resource,
      payload
    );

    this.notificarEstado(1);
    return { sincronizadoDirecto: false, item: itemEncolado };
  }

  public static async sincronizarPendientes(): Promise<SyncStats> {
    const stats: SyncStats = { total: 0, exitosos: 0, fallidos: 0 };

    if (this.sincronizando || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return stats;
    }

    const sesion = AuthService.getSesion();
    if (!sesion) return stats;

    try {
      this.sincronizando = true;
      const pendientes = await OutboxDatabase.obtenerPendientesPorTenant(sesion.tenantId);
      
      // Filtrar registros que ya hayan superado el umbral máximo de reintentos
      const candidatos = pendientes.filter((item) => item.intentos < this.MAX_INTENTOS);
      stats.total = candidatos.length;

      if (candidatos.length === 0) {
        this.notificarEstado(0);
        return stats;
      }

      this.notificarEstado(candidatos.length);

      // Procesamiento por lotes (chunks) para evitar timeouts en red industrial
      for (let i = 0; i < candidatos.length; i += this.TAMANO_LOTE) {
        const lote = candidatos.slice(i, i + this.TAMANO_LOTE);
        await this.procesarLote(lote, sesion.tenantId, stats);
      }
    } catch (error) {
      console.error('[SyncManager] Error crítico en ciclo de sincronización:', error);
    } finally {
      this.sincronizando = false;
      const restantes = (await OutboxDatabase.obtenerPendientesPorTenant(sesion.tenantId)).length;
      this.notificarEstado(restantes);
    }

    return stats;
  }

  private static async procesarLote(
    lote: OutboxItem[],
    tenantId: string,
    stats: SyncStats
  ): Promise<void> {
    // 1. Marcar items en proceso para evitar duplicidad si entra otra sincronización
    await Promise.all(
      lote.map((item) => OutboxDatabase.actualizarEstado(item.id, 'EN_PROCESO'))
    );

    try {
      const response = await fetch(this.apiUrlBatch, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getHeadersTenant()
        },
        body: JSON.stringify({ tenantId, items: lote })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const exitososIds: string[] = data.sincronizados ?? [];
      const fallidosIds: string[] = lote
        .filter((item) => !exitososIds.includes(item.id))
        .map((item) => item.id);

      // 2. Eliminar del Outbox local los que el backend procesó con éxito
      if (exitososIds.length > 0) {
        await OutboxDatabase.eliminarItems(exitososIds);
        stats.exitosos += exitososIds.length;
      }

      // 3. Marcar fallidos los restantes del lote
      if (fallidosIds.length > 0) {
        await Promise.all(
          fallidosIds.map((id) =>
            OutboxDatabase.actualizarEstado(id, 'FALLIDO', 'Rechazado por backend en lote')
          )
        );
        stats.fallidos += fallidosIds.length;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido de red';
      console.warn(`[SyncManager] Falló lote de ${lote.length} registros:`, errorMsg);

      // Si falló el lote completo, revertir estado a FALLIDO e incrementar intentos
      await Promise.all(
        lote.map((item) => OutboxDatabase.actualizarEstado(item.id, 'FALLIDO', errorMsg))
      );
      stats.fallidos += lote.length;
    }
  }
}