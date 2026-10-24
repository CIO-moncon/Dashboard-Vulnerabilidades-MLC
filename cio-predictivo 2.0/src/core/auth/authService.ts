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
  | 'VER_AUDITORIA';

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
    'VER_AUDITORIA'
  ],
  SUPERVISOR: [
    'VER_DASHBOARD',
    'CREAR_EQUIPO',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS',
    'VER_AUDITORIA'
  ],
  'ANALISTA CBM': [
    'VER_DASHBOARD',
    'EDITAR_EQUIPO',
    'GESTIONAR_ALERTAS',
    'MODULO_PMS'
  ],
  'OPERADOR TERRENO': [
    'VER_DASHBOARD',
    'CREAR_REPORTE_TERRENO'
  ]
};

const STORAGE_SESSION_KEY = 'cio_session_v2';

export class AuthService {
  private static sesionActual: SesionUsuario | null = null;

  public static getSesion(): SesionUsuario | null {
    if (this.sesionActual) return this.sesionActual;

    const sesionRaw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!sesionRaw) return null;

    try {
      const data = JSON.parse(sesionRaw) as SesionUsuario;
      if (data?.uid && data?.rol && data?.tenantId) {
        this.sesionActual = Object.freeze({
          ...data,
          permisos: PERMISOS_POR_ROL[data.rol] ?? ['VER_DASHBOARD']
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
    const rol = (sesion.rol ?? 'OPERADOR TERRENO').toUpperCase() as RolUsuario;
    const permisos = PERMISOS_POR_ROL[rol] ?? ['VER_DASHBOARD'];

    const sesionCompleta: SesionUsuario = Object.freeze({
      ...sesion,
      rol,
      permisos,
      ultimoAcceso: Date.now()
    });

    this.sesionActual = sesionCompleta;
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sesionCompleta));
    return sesionCompleta;
  }

  public static cerrarSesion(): void {
    this.sesionActual = null;
    localStorage.removeItem(STORAGE_SESSION_KEY);
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