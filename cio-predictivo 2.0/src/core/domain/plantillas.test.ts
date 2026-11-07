import { describe, expect, it } from 'vitest';
import {
  CATALOGO_PLANTILLAS_BASE,
  MasterTemplateRegistry,
  generarPoleasDinamicas,
  generarReductoresDinamicos,
  masterTemplateRegistry,
} from './plantillas';

describe('MasterTemplateRegistry', () => {
  it('resuelve un transportador por nombre con acentos y mayúsculas', () => {
    const estructura = masterTemplateRegistry.resolverEstructura('CORREA TRANSPORTADORA');
    expect(estructura?.key).toBe('transportador');
  });

  it('prioriza chancador primario sobre la coincidencia genérica', () => {
    const estructura = masterTemplateRegistry.resolverEstructura('Chancador Giratorio Primario');
    expect(estructura?.key).toBe('chancador_primario');
  });

  it('resuelve harnero por sinónimo criba', () => {
    const estructura = masterTemplateRegistry.resolverEstructura('Criba terciaria');
    expect(estructura?.key).toBe('harnero_secundario');
  });

  it('usa el default cuando no hay coincidencia', () => {
    const estructura = masterTemplateRegistry.resolverEstructura('Equipo desconocido XYZ');
    expect(estructura?.key).toBe('transportador');
  });

  it('devuelve todos los spots de la plantilla', () => {
    const spots = masterTemplateRegistry.obtenerSpots('chancador secundario');
    expect(spots).toContain('M1_LL');
    expect(spots).toContain('CE_LA');
    expect(spots.length).toBeGreaterThanOrEqual(4);
  });

  it('permite registrar plantillas personalizadas sin mutar el catálogo base', () => {
    const registro = new MasterTemplateRegistry(false);
    registro.registrarPlantillas({
      personalizada: {
        nombre: 'Equipo Personalizado',
        familia: 'Pruebas',
        icono: 'science',
        nodos: [{ id: 'n1', nombre: 'Nodo 1', icono: 'circle', spots: ['P1'] }],
      },
    });

    expect(registro.listarPlantillas()).toHaveLength(1);
    expect(registro.obtenerSpots('personalizada')).toEqual(['P1']);
    expect(Object.keys(CATALOGO_PLANTILLAS_BASE)).toContain('transportador');
  });
});

describe('generadores dinámicos', () => {
  it('genera pares de poleas LI/LD', () => {
    expect(generarPoleasDinamicas(2)).toEqual(['PL1_LI', 'PL1_LD', 'PL2_LI', 'PL2_LD']);
  });

  it('genera ejes de reductor', () => {
    expect(generarReductoresDinamicos(2)).toEqual(['G1_EJE1', 'G2_EJE2']);
  });
});
