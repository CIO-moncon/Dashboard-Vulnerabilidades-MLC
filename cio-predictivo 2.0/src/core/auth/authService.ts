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
  readonly token: string;
  readonly ultimoAcceso: number;
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
    'EXPORTAR_PDF'
  ],
  SUPERVISOR: [
    'VER_DASHBOARD',
    'CREAR_EQUIPO',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'CREAR_REPORTE_TERRENO',
    'VER_AUDITORIA',
    'EXPORTAR_PDF'
  ],
  'ANALISTA CBM': [
    'VER_DASHBOARD',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'CREAR_REPORTE_TERRENO',
    'EXPORTAR_PDF'
  ],
  'OPERADOR TERRENO': [
    'VER_DASHBOARD',
    'CREAR_REPORTE_TERRENO'
  ]
};

const STORAGE_SESSION_KEY = 'cio_session_v2';

export class AuthService {
  private static sesionActual: SesionUsuario | null = null;

  private static tokenExpirado(token: string): boolean {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return false;
      const jsonPayload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof jsonPayload.exp === 'number') {
        const ahora = Math.floor(Date.now() / 1000);
        return jsonPayload.exp < ahora;
      }
      return false;
    } catch {
      return false;
    }
  }

  public static getSesion(): SesionUsuario | null {
    if (this.sesionActual) {
      if (this.tokenExpirado(this.sesionActual.token)) {
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
      if (data?.uid && data?.rol && data?.tenantId && data?.token) {
        if (this.tokenExpirado(data.token)) {
          this.cerrarSesion();
          return null;
        }

        const rolValido = (data.rol in PERMISOS_POR_ROL) ? (data.rol as RolUsuario) : 'OPERADOR TERRENO';
        this.sesionActual = Object.freeze({
          ...data,
          rol: rolValido,
          permisos: PERMISOS_POR_ROL[rolValido]
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

  public static guardarSesion(sesion: Omit<SesionUsuario, 'permisos'>): SesionUsuario {
    const rolNormalizado = sesion.rol?.toUpperCase() as RolUsuario;
    const rol = (rolNormalizado in PERMISOS_POR_ROL) ? rolNormalizado : 'OPERADOR TERRENO';
    const permisos = PERMISOS_POR_ROL[rol];

    const sesionCompleta: SesionUsuario = Object.freeze({
      ...sesion,
      rol,
      permisos,
      ultimoAcceso: Date.now()
    });

    this.sesionActual = sesionCompleta;

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sesionCompleta));
    }

    return sesionCompleta;
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

  public static getHeadersTenant(): Record<string, string> {
    const sesion = this.getSesion();
    if (!sesion) return {};
    return {
      'X-Tenant-ID': sesion.tenantId,
      'X-User-ID': sesion.uid,
      'X-User-Role': sesion.rol,
      'Authorization': `Bearer ${sesion.token}`
    };
  }
}