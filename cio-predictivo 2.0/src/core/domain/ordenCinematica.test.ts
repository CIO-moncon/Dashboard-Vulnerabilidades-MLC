import { describe, expect, it } from 'vitest';
import { clasificarCategoriaCinematica, ordenarSpotsCinematica } from './ordenCinematica';

describe('ordenCinematica', () => {
  it('clasifica correctamente los componentes en sus categorías', () => {
    expect(clasificarCategoriaCinematica('Motor NDE (Lado Libre)', 'M1')).toBe('motor');
    expect(clasificarCategoriaCinematica('Motor DE (Lado Carga)', 'M2')).toBe('motor');
    expect(clasificarCategoriaCinematica('Reductor Punto 1', 'G1')).toBe('reductor');
    expect(clasificarCategoriaCinematica('Reductor Etapa 10', 'G10')).toBe('reductor');
    expect(clasificarCategoriaCinematica('Caja Contraeje', 'CE_EXT')).toBe('reductor');
    expect(clasificarCategoriaCinematica('Polea 1 Lado Izq', 'PL1_LI')).toBe('poleas');
    expect(clasificarCategoriaCinematica('Polea de Transmisión Lado Derecho', 'PL1_LD')).toBe(
      'poleas',
    );
    expect(clasificarCategoriaCinematica('Chumacera Ventilador', 'FAN_LA')).toBe('otros');
  });

  it('ordena en la secuencia lógica exacta: motor -> reductor -> poleas', () => {
    const spots = {
      PL2_LD: { componente: 'Polea 2 Lado Der' },
      G10: { componente: 'Reductor Etapa 10' },
      G2: { componente: 'Reductor Punto 2' },
      M2: { componente: 'Motor DE (Lado Carga)' },
      PL1_LI: { componente: 'Polea 1 Lado Izq' },
      G1: { componente: 'Reductor Punto 1' },
      M1: { componente: 'Motor NDE (Lado Libre)' },
      PL1_LD: { componente: 'Polea 1 Lado Der' },
      PL2_LI: { componente: 'Polea 2 Lado Izq' },
    };

    const orden = ordenarSpotsCinematica(spots);

    expect(orden).toEqual([
      // 1. Motor (NDE antes de DE)
      'M1',
      'M2',
      // 2. Reductor (orden numérico 1, 2, ..., 10, no alfabético)
      'G1',
      'G2',
      'G10',
      // 3. Poleas (por número de polea y LI antes de LD)
      'PL1_LI',
      'PL1_LD',
      'PL2_LI',
      'PL2_LD',
    ]);
  });

  it('soporta claves automáticas con descripción del componente', () => {
    const spots = {
      spot_auto_polea_2: { componente: 'Polea 2 Lado Izq' },
      spot_auto_reductor_1: { componente: 'Reductor Punto 1' },
      spot_auto_motor_1: { componente: 'Motor NDE (Lado Libre)' },
      spot_auto_polea_1: { componente: 'Polea 1 Lado Izq' },
    };

    const orden = ordenarSpotsCinematica(spots);
    expect(orden).toEqual([
      'spot_auto_motor_1',
      'spot_auto_reductor_1',
      'spot_auto_polea_1',
      'spot_auto_polea_2',
    ]);
  });
});
