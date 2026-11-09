import { describe, expect, it } from 'vitest';
import {
  clasificarComponenteCBM,
  generarObservacionesCBM,
  type MedicionObservacionCBM,
} from './observaciones';

const medicion = (cambios: Partial<MedicionObservacionCBM>): MedicionObservacionCBM => ({
  punto: 'M1',
  componente: 'Motor NDE (Lado Libre)',
  rms: 1.2,
  temp: 45,
  fc: 2,
  nivelRms: 0,
  nivelTemp: 0,
  nivelFc: 0,
  ...cambios,
});

describe('clasificarComponenteCBM', () => {
  it('distingue motor, reductor, polea y rodamiento', () => {
    expect(clasificarComponenteCBM('Motor NDE (Lado Libre)', 'M1')).toBe('MOTOR');
    expect(clasificarComponenteCBM('Reductor Entrada', 'R1')).toBe('REDUCTOR');
    expect(clasificarComponenteCBM('Contraje NDE', 'CP1')).toBe('REDUCTOR');
    expect(clasificarComponenteCBM('Polea Motriz Chumacera Mando', 'PO1')).toBe('POLEA');
    expect(clasificarComponenteCBM('Rodamiento Lado Libre', 'RO1')).toBe('RODAMIENTO');
  });

  it('usa el prefijo del punto cuando el nombre no es concluyente', () => {
    expect(clasificarComponenteCBM('Punto de medición', 'M2')).toBe('MOTOR');
    expect(clasificarComponenteCBM('Punto de medición', 'PO2')).toBe('POLEA');
    expect(clasificarComponenteCBM('Punto de medición', 'R2')).toBe('REDUCTOR');
    expect(clasificarComponenteCBM('Punto de medición', 'X9')).toBe('OTRO');
  });
});

describe('generarObservacionesCBM', () => {
  it('genera informe espectral cuando el RMS está en Zona D del motor', () => {
    const observaciones = generarObservacionesCBM([medicion({ rms: 9.5, nivelRms: 3 })]);

    expect(observaciones).toHaveLength(1);
    expect(observaciones[0]).toMatchObject({
      regla: 'RMS_ZONA_D',
      severidad: 'ROJO',
      tipoComponente: 'MOTOR',
      requiereAvisoSap: true,
      prioridadSap: 'Alta',
      plazoDias: 7,
    });
    expect(observaciones[0].titulo).toContain('Motor');
    expect(observaciones[0].detalle).toContain('barras de rotor');
  });

  it('adapta el informe espectral al reductor', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        componente: 'Reductor Salida',
        punto: 'R2',
        rms: 12,
        nivelRms: 3,
      }),
    ]);

    expect(observaciones[0].titulo).toContain('Reductor');
    expect(observaciones[0].detalle).toContain('GMF');
    expect(observaciones[0].detalle).toContain('backlash');
  });

  it('acota a 15 días una polea con temperatura en Zona B', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        componente: 'Polea Motriz Chumacera Mando',
        punto: 'PO1',
        temp: 68,
        nivelTemp: 1,
      }),
    ]);

    expect(observaciones).toHaveLength(1);
    expect(observaciones[0]).toMatchObject({
      regla: 'POLEA_15_DIAS',
      severidad: 'AMARILLO',
      plazoDias: 15,
      requiereAvisoSap: false,
    });
    expect(observaciones[0].titulo).toContain('15 días');
    expect(observaciones[0].detalle).toContain('Temperatura 68.0 °C');
  });

  it('acota a 15 días una polea con FC+ en Zona B', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        componente: 'Polea de Retorno',
        punto: 'PO2',
        fc: 4.5,
        nivelFc: 1,
      }),
    ]);

    expect(observaciones[0].regla).toBe('POLEA_15_DIAS');
    expect(observaciones[0].detalle).toContain('FC+ 4.5');
  });

  it('genera aviso SAP por temperatura naranja en polea', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        componente: 'Polea Motriz Chumacera Mando',
        punto: 'PO1',
        temp: 82,
        nivelTemp: 2,
      }),
    ]);

    const aviso = observaciones.find((o) => o.regla === 'TEMP_FC_PREVENTIVA');
    expect(aviso).toMatchObject({
      severidad: 'NARANJA',
      requiereAvisoSap: true,
      prioridadSap: 'Media',
      plazoDias: 15,
    });
    expect(aviso?.recomendacion).toContain('ambos rodamientos/chumaceras de la polea');
    expect(aviso?.recomendacion).toContain('evaluar el cambio');
  });

  it('genera aviso SAP urgente por FC+ rojo en rodamiento', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        componente: 'Rodamiento Lado Libre',
        punto: 'RO1',
        fc: 12,
        nivelFc: 3,
      }),
    ]);

    const aviso = observaciones.find((o) => o.regla === 'TEMP_FC_PREVENTIVA');
    expect(aviso).toMatchObject({
      severidad: 'ROJO',
      requiereAvisoSap: true,
      prioridadSap: 'Alta',
      plazoDias: 7,
    });
    expect(aviso?.titulo).toContain('urgente');
  });

  it('no falla con mediciones legacy guardadas como texto', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        rms: '9.5' as unknown as number,
        temp: '82.4' as unknown as number,
        fc: '12' as unknown as number,
        nivelRms: '3' as unknown as number,
        nivelTemp: '2' as unknown as number,
        nivelFc: '3' as unknown as number,
      }),
    ]);

    expect(observaciones.length).toBeGreaterThanOrEqual(2);
    expect(observaciones[0].detalle).toContain('9.50 mm/s');
    expect(observaciones.some((o) => o.detalle.includes('82.4 °C'))).toBe(true);
  });

  it('no genera observaciones cuando todo está en Zona A', () => {
    expect(generarObservacionesCBM([medicion({})])).toHaveLength(0);
  });

  it('ordena las observaciones de mayor a menor severidad', () => {
    const observaciones = generarObservacionesCBM([
      medicion({
        punto: 'PO1',
        componente: 'Polea Motriz',
        temp: 68,
        nivelTemp: 1,
      }),
      medicion({
        punto: 'M1',
        componente: 'Motor NDE',
        rms: 9,
        nivelRms: 3,
      }),
    ]);

    expect(observaciones.map((o) => o.severidad)).toEqual(['ROJO', 'AMARILLO']);
  });
});
