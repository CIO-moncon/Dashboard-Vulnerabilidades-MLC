/**
 * Estado compartido del dashboard.
 *
 * Sustituye a los antiguos globales `window.datosGlobalesEquipos` y
 * `window.mapaActivo`: los módulos importan estas funciones en lugar de
 * acoplarse a `window`.
 */

type ListenerDatos = () => void;

let _datosEquipos: Record<string, any> = {};
let _mapaActivo: any = null;
const _listenersDatos: Set<ListenerDatos> = new Set();

/** Catastro de equipos vigente (clave por TAG normalizado). */
export const obtenerDatosEquipos = (): Record<string, any> => _datosEquipos;

/** Reemplaza el catastro y notifica a los suscriptores. */
export const establecerDatosEquipos = (datos: Record<string, any>): void => {
  _datosEquipos = datos;
  _listenersDatos.forEach((fn) => fn());
};

/** Suscribe una función que se ejecuta cada vez que cambia el catastro. */
export const suscribirCambiosEquipos = (fn: ListenerDatos): (() => void) => {
  _listenersDatos.add(fn);
  return () => {
    _listenersDatos.delete(fn);
  };
};

/** Instancia activa del mapa (MapLibre) o `null` si no hay geovisor. */
export const obtenerMapaActivo = (): any => _mapaActivo;

export const establecerMapaActivo = (mapa: any): void => {
  _mapaActivo = mapa;
};
