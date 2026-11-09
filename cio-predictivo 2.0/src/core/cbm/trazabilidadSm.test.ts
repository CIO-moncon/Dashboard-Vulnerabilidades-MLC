import { describe, expect, it } from 'vitest';
import {
  describirMotivo,
  etiquetasMagnitudes,
  magnitudesFaltantes,
  normalizarMagnitudes,
  normalizarMotivo,
  validarEstadoMedicion,
} from './trazabilidadSm';

describe('magnitudesFaltantes', () => {
  it('considera nulo como no medido y cero como valor medido', () => {
    expect(magnitudesFaltantes({ rms: null, temp: 0, fc: 2.5 })).toEqual(['rms']);
    expect(magnitudesFaltantes({ rms: 1.2, temp: 45, fc: 2.1 })).toEqual([]);
    expect(magnitudesFaltantes({ rms: null, temp: null, fc: null })).toEqual(['rms', 'temp', 'fc']);
  });

  it('normaliza y etiqueta magnitudes', () => {
    expect(normalizarMagnitudes(['temp', 'fc', 'otro'])).toEqual(['temp', 'fc']);
    expect(etiquetasMagnitudes(['temp', 'fc'])).toBe('Temp, FC+');
  });
});

describe('motivos de no medición', () => {
  it('combina el motivo "otro" con su detalle', () => {
    expect(normalizarMotivo('otro', '  acceso bloqueado  ')).toBe('otro: acceso bloqueado');
    expect(normalizarMotivo('otro', '')).toBe('otro');
    expect(normalizarMotivo('sin_acceso')).toBe('sin_acceso');
  });

  it('entrega una descripción legible', () => {
    expect(describirMotivo('sin_acceso')).toBe('Sin acceso al punto');
    expect(describirMotivo('otro: acceso bloqueado')).toBe('Otro: acceso bloqueado');
    expect(describirMotivo('')).toBe('');
  });
});

describe('validarEstadoMedicion', () => {
  it('exige motivo cuando el punto queda 100% sin medición', () => {
    const resultado = validarEstadoMedicion({ rms: null, temp: null, fc: null, motivo: '' });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('No hay mediciones');
  });

  it('acepta un punto 100% S/M con motivo', () => {
    const resultado = validarEstadoMedicion({
      rms: null,
      temp: null,
      fc: null,
      motivo: 'sin_acceso',
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.faltantes).toEqual(['rms', 'temp', 'fc']);
  });

  it('exige motivo cuando hay una medición parcial', () => {
    const resultado = validarEstadoMedicion({ rms: 5, temp: null, fc: null, motivo: '' });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('Temp, FC+');
  });

  it('acepta una medición parcial con motivo', () => {
    const resultado = validarEstadoMedicion({
      rms: 5,
      temp: null,
      fc: null,
      motivo: 'equipo_fs',
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.faltantes).toEqual(['temp', 'fc']);
  });

  it('acepta una medición completa sin motivo', () => {
    const resultado = validarEstadoMedicion({ rms: 5, temp: 42, fc: 2.1, motivo: '' });
    expect(resultado.ok).toBe(true);
    expect(resultado.faltantes).toEqual([]);
  });

  it('exige detalle cuando el motivo es "otro"', () => {
    const resultado = validarEstadoMedicion({
      rms: null,
      temp: null,
      fc: null,
      motivo: 'otro',
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('detalle');
  });

  it('acepta "otro" cuando trae detalle', () => {
    const resultado = validarEstadoMedicion({
      rms: null,
      temp: null,
      fc: null,
      motivo: 'otro: acceso bloqueado',
    });
    expect(resultado.ok).toBe(true);
  });
});
