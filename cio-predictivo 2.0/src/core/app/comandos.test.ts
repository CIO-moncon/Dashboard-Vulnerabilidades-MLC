import { describe, expect, it, vi } from 'vitest';

import {
  argsJson,
  ejecutarComando,
  inicializarDelegacionComandos,
  registrarComando,
} from './comandos';

describe('comandos (registro y delegación)', () => {
  it('registra y ejecuta comandos programáticamente', () => {
    const fn = vi.fn();
    registrarComando('test:saludo', fn);

    expect(ejecutarComando('test:saludo', 'hola')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBeNull(); // evento nulo en llamadas programáticas
    expect(fn.mock.calls[0][1]).toBe('hola');
  });

  it('devuelve false para comandos no registrados', () => {
    expect(ejecutarComando('test:inexistente')).toBe(false);
  });

  it('despacha data-accion y data-args al hacer clic (delegación)', () => {
    inicializarDelegacionComandos();
    const fn = vi.fn();
    registrarComando('test:click', fn);

    // Replica el uso real: el template se inyecta con innerHTML y el parser
    // HTML decodifica las entidades de data-args.
    const contenedor = document.createElement('div');
    contenedor.innerHTML = `<button data-accion="test:click" data-args='${argsJson(['X', 42])}'></button>`;
    const boton = contenedor.querySelector('button')!;
    document.body.appendChild(boton);

    boton.click();

    expect(fn).toHaveBeenCalledTimes(1);
    const [evento, ...args] = fn.mock.calls[0];
    expect(evento).toBeInstanceOf(Event);
    expect(args).toEqual(['X', 42]);

    boton.remove();
  });

  it('argsJson escapa entidades HTML y preserva el valor original', () => {
    const serializado = argsJson(['a"b<c', 'área 52']);
    const div = document.createElement('div');
    div.innerHTML = `<button data-args='${serializado}'></button>`;
    const leido = div.querySelector('button')!.getAttribute('data-args');
    expect(JSON.parse(leido!)).toEqual(['a"b<c', 'área 52']);
  });
});
