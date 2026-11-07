import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { OutboxDatabase } from './outboxDatabase';

const TENANT = 'tenant_test';
const OTRO_TENANT = 'tenant_otro';

const borrarBaseDeDatos = (): Promise<void> =>
  new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('CIOPredictivoDB');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

describe('OutboxDatabase', () => {
  beforeEach(async () => {
    await OutboxDatabase.cerrarConexion();
    await borrarBaseDeDatos();
  });

  it('encola operaciones y las cuenta por tenant', async () => {
    await OutboxDatabase.encolarOperacion(TENANT, 'u1', 'CREATE', 'alerta_terreno:T1', {
      tag: 'T1',
    });
    await OutboxDatabase.encolarOperacion(OTRO_TENANT, 'u2', 'CREATE', 'alerta_terreno:T2', {
      tag: 'T2',
    });

    expect(await OutboxDatabase.contarPendientesPorTenant(TENANT)).toBe(1);
    expect(await OutboxDatabase.contarPendientesPorTenant(OTRO_TENANT)).toBe(1);
  });

  it('devuelve los PENDIENTE como reintentables', async () => {
    const item = await OutboxDatabase.encolarOperacion(
      TENANT,
      'u1',
      'CREATE',
      'alerta_terreno:T1',
      { tag: 'T1' },
    );

    const candidatos = await OutboxDatabase.obtenerReintentablesPorTenant(TENANT, 5);
    expect(candidatos.map((c) => c.id)).toEqual([item.id]);
  });

  it('reintenta FALLIDO solo mientras queden intentos', async () => {
    const item = await OutboxDatabase.encolarOperacion(
      TENANT,
      'u1',
      'CREATE',
      'alerta_terreno:T1',
      { tag: 'T1' },
    );

    await OutboxDatabase.actualizarEstado(item.id, 'FALLIDO', 'HTTP 500');

    // Con 1 intento agotado y máximo 1, ya no se reintenta.
    expect(await OutboxDatabase.obtenerReintentablesPorTenant(TENANT, 1)).toHaveLength(0);

    // Con margen de 2 intentos, vuelve a la cola.
    const candidatos = await OutboxDatabase.obtenerReintentablesPorTenant(TENANT, 2);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].intentos).toBe(1);
  });

  it('recupera operaciones EN_PROCESO huérfanas', async () => {
    const item = await OutboxDatabase.encolarOperacion(
      TENANT,
      'u1',
      'CREATE',
      'alerta_terreno:T1',
      { tag: 'T1' },
    );

    await OutboxDatabase.actualizarEstado(item.id, 'EN_PROCESO');

    // staleMs negativo fuerza a considerar la operación como abandonada.
    const candidatos = await OutboxDatabase.obtenerReintentablesPorTenant(TENANT, 5, -1);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].estado).toBe('PENDIENTE');
  });

  it('no cuenta como pendiente un FALLIDO que agotó sus intentos', async () => {
    const item = await OutboxDatabase.encolarOperacion(
      TENANT,
      'u1',
      'CREATE',
      'alerta_terreno:T1',
      { tag: 'T1' },
    );

    await OutboxDatabase.actualizarEstado(item.id, 'FALLIDO', 'HTTP 500');

    expect(await OutboxDatabase.contarPendientesPorTenant(TENANT, 2)).toBe(1);
    expect(await OutboxDatabase.contarPendientesPorTenant(TENANT, 1)).toBe(0);
  });

  it('elimina operaciones sincronizadas', async () => {
    const item = await OutboxDatabase.encolarOperacion(
      TENANT,
      'u1',
      'CREATE',
      'alerta_terreno:T1',
      { tag: 'T1' },
    );

    await OutboxDatabase.eliminarItems([item.id]);
    expect(await OutboxDatabase.contarPendientesPorTenant(TENANT)).toBe(0);
  });
});
