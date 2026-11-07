import { describe, expect, it } from 'vitest';
import { MATRIZ_LIMITES_ISO, calcularSaludComponente, evaluarISO20816 } from './evaluadorIso';

describe('evaluarISO20816', () => {
  it('clasifica los límites exactos de la matriz grupo 1 / rígido', () => {
    const limites = MATRIZ_LIMITES_ISO.grupo1_rigido;

    expect(evaluarISO20816(limites.b).zona).toBe('A');
    expect(evaluarISO20816(limites.b + 0.01).zona).toBe('B');
    expect(evaluarISO20816(limites.c).zona).toBe('B');
    expect(evaluarISO20816(limites.c + 0.01).zona).toBe('C');
    expect(evaluarISO20816(limites.d).zona).toBe('C');
    expect(evaluarISO20816(limites.d + 0.01).zona).toBe('D');
  });

  it('aplica los límites del grupo 2 / rígido', () => {
    expect(evaluarISO20816(1.4, 'grupo2', 'rigido').zona).toBe('A');
    expect(evaluarISO20816(2.0, 'grupo2', 'rigido').zona).toBe('B');
    expect(evaluarISO20816(3.0, 'grupo2', 'rigido').zona).toBe('C');
    expect(evaluarISO20816(5.0, 'grupo2', 'rigido').zona).toBe('D');
  });

  it('devuelve SIN_DATOS para valores inválidos', () => {
    expect(evaluarISO20816(undefined).zona).toBe('S/D');
    expect(evaluarISO20816('no-numero').zona).toBe('S/D');
    expect(evaluarISO20816(-1).zona).toBe('S/D');
    expect(evaluarISO20816(Number.NaN).zona).toBe('S/D');
  });

  it('acepta valores numéricos como texto', () => {
    const resultado = evaluarISO20816('1.2');
    expect(resultado.zona).toBe('A');
    expect(resultado.rmsEvaluado).toBe(1.2);
  });
});

describe('calcularSaludComponente', () => {
  it('evalúa el peor RMS del componente', () => {
    const resultado = calcularSaludComponente([0.8, { rms: 2.1 }, '3.0']);
    expect(resultado.rmsMax).toBe(3.0);
    expect(resultado.zona).toBe('B');
  });

  it('ignora nulos y vacíos', () => {
    const resultado = calcularSaludComponente([null, undefined, '', { valor: 1.1 }]);
    expect(resultado.rmsMax).toBe(1.1);
    expect(resultado.zona).toBe('A');
  });

  it('devuelve SIN_DATOS sin valores válidos', () => {
    const resultado = calcularSaludComponente([]);
    expect(resultado.zona).toBe('S/D');
    expect(resultado.rmsMax).toBe(0);
  });
});
