export type RolUsuario = 'ADMINISTRADOR' | 'SUPERVISOR' | 'ANALISTA CBM' | 'OPERADOR TERRENO';

export type PermisoSistema =
  | 'VER_DASHBOARD'
  | 'CREAR_EQUIPO'
  | 'EDITAR_EQUIPO'
  | 'ELIMINAR_EQUIPO'
  | 'GESTIONAR_ALERTAS'
  | 'MODULO_PMS'
  | 'CONFIGURACION'
  | 'CREAR_REPORTE_TERRENO'
  | 'VER_AUDITORIA'
  | 'EXPORTAR_PDF';

export interface SesionUsuario {
  readonly uid: string;
  readonly email: string;
  readonly nombre: string;
  readonly rol: RolUsuario;
  readonly tenantId: string;
  readonly faenaNombre: string;
  readonly permisos: readonly PermisoSistema[];
  /** Marca de tiempo (ms) en que expira el access token (cookie HttpOnly). */
  readonly expiraEn: number;
  /** Marca de tiempo (ms) en que expira el refresh token. */
  readonly refreshExpiraEn: number;
  readonly ultimoAcceso: number;
}

interface RespuestaLogin {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
  usuario: {
    uid: string;
    email: string;
    nombre: string;
    rol: string;
    tenantId: string;
    faenaNombre?: string;
  };
}

const PERMISOS_POR_ROL: Readonly<Record<RolUsuario, readonly PermisoSistema[]>> = {
  ADMINISTRADOR: [
    'VER_DASHBOARD',
    'CREAR_EQUIPO',
    'EDITAR_EQUIPO',
    'ELIMINAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'CONFIGURACION',
    'CREAR_REPORTE_TERRENO',
    'VER_AUDITORIA',
    'EXPORTAR_PDF',
  ],
  SUPERVISOR: [
    'VER_DASHBOARD',
    'CREAR_EQUIPO',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'CREAR_REPORTE_TERRENO',
    'VER_AUDITORIA',
    'EXPORTAR_PDF',
  ],
  'ANALISTA CBM': [
    'VER_DASHBOARD',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'CREAR_REPORTE_TERRENO',
    'EXPORTAR_PDF',
  ],
  'OPERADOR TERRENO': ['VER_DASHBOARD', 'CREAR_REPORTE_TERRENO'],
};

// La sesión persiste SOLO metadatos no sensibles. El JWT vive en una cookie
// HttpOnly gestionada por el backend; nunca se guarda en localStorage.
const STORAGE_SESSION_KEY = 'cio_session_v2';
const MARGEN_RENOVACION_MS = 60_000;

const normalizarRol = (rolCrudo: string): RolUsuario => {
  const rol = String(rolCrudo || '')
    .trim()
    .toUpperCase();
  return rol in PERMISOS_POR_ROL ? (rol as RolUsuario) : 'OPERADOR TERRENO';
};

const construirSesion = (data: RespuestaLogin): SesionUsuario => {
  const rol = normalizarRol(data.usuario.rol);
  const ahora = Date.now();
  return Object.freeze({
    uid: data.usuario.uid,
    email: data.usuario.email,
    nombre: data.usuario.nombre,
    rol,
    tenantId: data.usuario.tenantId,
    faenaNombre: data.usuario.faenaNombre || 'Mina Los Colorados',
    permisos: PERMISOS_POR_ROL[rol],
    expiraEn: ahora + data.expires_in * 1000,
    refreshExpiraEn: ahora + (data.refresh_expires_in ?? data.expires_in) * 1000,
    ultimoAcceso: ahora,
  });
};

export class AuthService {
  private static sesionActual: SesionUsuario | null = null;

  /**
   * Autentica contra el backend. El backend emite cookies HttpOnly con los
   * tokens; aquí solo se guardan metadatos de usuario y tiempos de expiración.
   */
  public static async login(email: string, password: string): Promise<SesionUsuario> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!response.ok) {
      let mensaje = 'No se pudo iniciar sesión.';
      try {
        const data = await response.json();
        if (typeof data?.detail === 'string') mensaje = data.detail;
      } catch {
        /* respuesta sin JSON */
      }
      throw new Error(mensaje);
    }

    const data = (await response.json()) as RespuestaLogin;
    const sesion = construirSesion(data);
    this.sesionActual = sesion;
    this.persistir(sesion);
    return sesion;
  }

  public static getSesion(): SesionUsuario | null {
    if (this.sesionActual) {
      if (this.sesionActual.refreshExpiraEn <= Date.now()) {
        this.cerrarSesion();
        return null;
      }
      return this.sesionActual;
    }

    if (typeof window === 'undefined' || !window.localStorage) return null;

    const sesionRaw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!sesionRaw) return null;

    try {
      const data = JSON.parse(sesionRaw) as SesionUsuario;
      if (data?.uid && data?.rol && data?.tenantId && typeof data.refreshExpiraEn === 'number') {
        if (data.refreshExpiraEn <= Date.now()) {
          this.cerrarSesion();
          return null;
        }

        const rolValido = normalizarRol(data.rol);
        this.sesionActual = Object.freeze({
          ...data,
          rol: rolValido,
          permisos: PERMISOS_POR_ROL[rolValido],
        });
        return this.sesionActual;
      }
      this.cerrarSesion();
      return null;
    } catch {
      this.cerrarSesion();
      return null;
    }
  }

  /**
   * Indica si el access token está por expirar y conviene renovarlo antes de
   * la siguiente petición autenticada.
   */
  public static sesionPorExpirar(): boolean {
    const sesion = this.getSesion();
    if (!sesion) return false;
    return sesion.expiraEn - Date.now() < MARGEN_RENOVACION_MS;
  }

  /**
   * Renueva el access token usando la cookie HttpOnly de refresh. Devuelve
   * false si el refresh token ya no es válido (sesión irrecuperable).
   */
  public static async renovarSesion(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        this.cerrarSesion();
        return false;
      }

      const data = (await response.json()) as RespuestaLogin;
      const sesion = construirSesion(data);
      this.sesionActual = sesion;
      this.persistir(sesion);
      return true;
    } catch {
      // Error de red transitorio: no invalidar la sesión local.
      return false;
    }
  }

  /** Cierra la sesión remota (revoca el refresh token) y limpia el estado local. */
  public static async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* error de red: se limpia la sesión local igualmente */
    } finally {
      this.cerrarSesion();
    }
  }

  private static persistir(sesion: SesionUsuario): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sesion));
    }
  }

  public static cerrarSesion(): void {
    this.sesionActual = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }

  public static tienePermiso(permiso: PermisoSistema): boolean {
    const sesion = this.getSesion();
    return Boolean(sesion?.permisos.includes(permiso));
  }

  public static tieneRol(rolesPermitidos: RolUsuario | RolUsuario[]): boolean {
    const sesion = this.getSesion();
    if (!sesion?.rol) return false;
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return roles.includes(sesion.rol);
  }

  /**
   * Cabeceras para peticiones autenticadas. El access token viaja en la cookie
   * HttpOnly; aquí solo se envía el tenant (validado contra el token).
   */
  public static getHeadersTenant(): Record<string, string> {
    const sesion = this.getSesion();
    if (!sesion) return {};
    return { 'X-Tenant-ID': sesion.tenantId };
  }
}

// ---------------------------------------------------------------------------
// Interceptor de fetch: renueva el access token antes de que expire y reintenta
// una vez ante 401. Las rutas /api/auth/login|refresh|logout quedan exentas.
// ---------------------------------------------------------------------------
let interceptorInicializado = false;

export const inicializarInterceptorAutenticado = (): void => {
  if (typeof window === 'undefined' || interceptorInicializado) return;
  interceptorInicializado = true;

  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const esApi = url.startsWith('/api/');
    const esAuth = /\/api\/auth\/(login|refresh|logout)/.test(url);

    if (!esApi) return fetchOriginal(input, init);

    if (!esAuth && AuthService.sesionPorExpirar()) {
      await AuthService.renovarSesion().catch(() => undefined);
    }

    const merged: RequestInit = { ...(init ?? {}), credentials: 'include' };
    const respuesta = await fetchOriginal(input, merged);

    if (!esAuth && respuesta.status === 401) {
      const renovada = await AuthService.renovarSesion().catch(() => false);
      if (renovada) return fetchOriginal(input, merged);
      window.dispatchEvent(new CustomEvent('cio:sesion-expirada'));
    }

    return respuesta;
  };
};
