/**
 * Registro tipado de comandos de UI con delegación de eventos.
 *
 * Sustituye a los globales `window.*` usados en handlers inline:
 *  - Cada módulo registra sus comandos con `registrarComando`.
 *  - Los templates HTML usan `data-accion="modulo:nombre"` (y `data-args`
 *    opcional generado con `argsJson([...])`) en lugar de
 *    `onclick="window.algo(...)"`.
 *  - Un único listener delegado (instalado con `inicializarDelegacionComandos`)
 *    despacha click/input/change/submit.
 *  - Las llamadas programáticas entre módulos usan `ejecutarComando`.
 *
 * Convención de firmas: todo comando recibe `(evento: Event | null, ...args)`.
 * Si proviene de un evento delegado, `evento` es el evento original; en
 * llamadas programáticas es `null`.
 */

import { escaparHTML } from '../utils/sanitizar';

export type ComandoUI = (evento: Event | null, ...args: unknown[]) => void;

const comandos = new Map<string, ComandoUI>();
let delegacionInstalada = false;

const ATTR_ACCION = 'data-accion';
const ATTR_ARGS = 'data-args';

/**
 * Serializa argumentos para el atributo `data-args` de un template HTML.
 * Escapa entidades HTML; el navegador las decodifica al leer el atributo, por
 * lo que `JSON.parse` en el despachador recupera los valores originales.
 */
export const argsJson = (valores: unknown[]): string => escaparHTML(JSON.stringify(valores));

export const registrarComando = (nombre: string, fn: ComandoUI): void => {
  if (comandos.has(nombre)) {
    console.warn(`[Comandos] Sobrescribiendo comando ya registrado: ${nombre}`);
  }
  comandos.set(nombre, fn);
};

const _ejecutar = (nombre: string, evento: Event | null, args: unknown[]): boolean => {
  const fn = comandos.get(nombre);
  if (!fn) {
    console.warn(`[Comandos] Comando no registrado: ${nombre}`);
    return false;
  }
  fn(evento, ...args);
  return true;
};

/** Invoca un comando de forma programática (sin evento). */
export const ejecutarComando = (nombre: string, ...args: unknown[]): boolean =>
  _ejecutar(nombre, null, args);

const parsearArgs = (crudo: string | null): unknown[] => {
  if (!crudo) return [];
  try {
    const valor = JSON.parse(crudo) as unknown;
    return Array.isArray(valor) ? valor : [valor];
  } catch {
    console.warn('[Comandos] data-args inválido:', crudo);
    return [];
  }
};

const despachar = (evento: Event): void => {
  const objetivo = evento.target as HTMLElement | null;
  const elemento = objetivo?.closest?.(`[${ATTR_ACCION}]`);
  if (!elemento) return;

  const nombre = elemento.getAttribute(ATTR_ACCION);
  if (!nombre) return;

  if (evento.type === 'submit') evento.preventDefault();

  const args = parsearArgs(elemento.getAttribute(ATTR_ARGS));
  _ejecutar(nombre, evento, args);
};

/** Instala el listener delegado global (idempotente). */
export const inicializarDelegacionComandos = (): void => {
  if (delegacionInstalada || typeof document === 'undefined') return;
  delegacionInstalada = true;

  document.addEventListener('click', despachar);
  document.addEventListener('input', despachar);
  document.addEventListener('change', despachar);
  document.addEventListener('keyup', despachar);
  document.addEventListener('submit', despachar);
};
