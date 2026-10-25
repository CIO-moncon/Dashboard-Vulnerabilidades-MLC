export interface NodoCinematico {
  readonly id: string;
  readonly nombre: string;
  readonly icono: string;
  readonly spots: readonly string[];
}

export interface EstructuraEquipo {
  readonly key: string;
  readonly nombre: string;
  readonly familia: string;
  readonly icono: string;
  readonly nodos: readonly NodoCinematico[];
  readonly defaultsIso?: {
    grupo: 'grupo1' | 'grupo2';
    soporte: 'rigido' | 'flexible';
  };
}

export const motorElectricoEstandar: NodoCinematico = Object.freeze({
  id: 'motor',
  nombre: 'Motor Eléctrico Principal',
  icono: 'electric_bolt',
  spots: Object.freeze(['M1_LL', 'M2_LA'])
});

export const generarPoleasDinamicas = (cantidadPares: number): string[] => {
  const spots: string[] = [];
  for (let i = 1; i <= cantidadPares; i++) {
    spots.push(`PL${i}_LI`, `PL${i}_LD`);
  }
  return spots;
};

export const generarReductoresDinamicos = (cantidadEjes: number): string[] => {
  const spots: string[] = [];
  for (let i = 1; i <= cantidadEjes; i++) {
    spots.push(`G${i}_EJE${i}`);
  }
  return spots;
};

export const CATALOGO_PLANTILLAS_BASE: Readonly<Record<string, Omit<EstructuraEquipo, 'key'>>> = Object.freeze({
  transportador: {
    nombre: 'Correa Transportadora Estándar',
    familia: 'Transporte de Mineral',
    icono: 'conveyor_belt',
    defaultsIso: { grupo: 'grupo1', soporte: 'rigido' },
    nodos: Object.freeze([
      motorElectricoEstandar,
      {
        id: 'reductor',
        nombre: 'Caja Reductora',
        icono: 'settings',
        spots: Object.freeze(['RED_EJE1', 'RED_EJE2', 'RED_EJE3'])
      },
      {
        id: 'poleas',
        nombre: 'Poleas de Cabeza y Cola',
        icono: 'album',
        spots: Object.freeze(['POL_CAB_LI', 'POL_CAB_LD', 'POL_COL_LI', 'POL_COL_LD'])
      }
    ])
  },
  chancador_primario: {
    nombre: 'Chancador Giratorio Primario',
    familia: 'Conminución Primaria',
    icono: 'precision_manufacturing',
    defaultsIso: { grupo: 'grupo1', soporte: 'rigido' },
    nodos: Object.freeze([
      motorElectricoEstandar,
      {
        id: 'contraejecbm',
        nombre: 'Caja Contraeje',
        icono: 'sync_alt',
        spots: Object.freeze(['CE_EXT', 'CE_INT'])
      },
      {
        id: 'conjunto_pivote',
        nombre: 'Pivote y Excétrica',
        icono: 'circle',
        spots: Object.freeze(['EXC_RAD', 'EXC_AX'])
      }
    ])
  },
  chancador_secundario: {
    nombre: 'Chancador de Cono Secundario',
    familia: 'Conminución Secundaria',
    icono: 'construction',
    defaultsIso: { grupo: 'grupo1', soporte: 'flexible' },
    nodos: Object.freeze([
      motorElectricoEstandar,
      {
        id: 'contraeje',
        nombre: 'Contraeje Cónico',
        icono: 'settings_input_component',
        spots: Object.freeze(['CE_LA', 'CE_LL'])
      }
    ])
  },
  harnero_secundario: {
    nombre: 'Harnero Vibratorio / Criba',
    familia: 'Clasificación',
    icono: 'grid_view',
    defaultsIso: { grupo: 'grupo1', soporte: 'flexible' },
    nodos: Object.freeze([
      motorElectricoEstandar,
      {
        id: 'excitador',
        nombre: 'Mecanismo Excitador',
        icono: 'vibration',
        spots: Object.freeze(['EXC_LI_RAD', 'EXC_LD_RAD', 'EXC_LI_AX', 'EXC_LD_AX'])
      }
    ])
  },
  prensa: {
    nombre: 'Prensa de Rodillos HPGR',
    familia: 'Molienda / HPGR',
    icono: 'compress',
    defaultsIso: { grupo: 'grupo1', soporte: 'rigido' },
    nodos: Object.freeze([
      {
        id: 'motor_fijo',
        nombre: 'Motor Rodillo Fijo',
        icono: 'electric_bolt',
        spots: Object.freeze(['MF_LL', 'MF_LA'])
      },
      {
        id: 'motor_movil',
        nombre: 'Motor Rodillo Móvil',
        icono: 'electric_bolt',
        spots: Object.freeze(['MM_LL', 'MM_LA'])
      },
      {
        id: 'rodillos',
        nombre: 'Chumaceras de Rodillos',
        icono: 'drag_indicator',
        spots: Object.freeze(['RF_LI', 'RF_LD', 'RM_LI', 'RM_LD'])
      }
    ])
  },
  colector: {
    nombre: 'Ventilador / Colector de Polvo',
    familia: 'Servicios Planta',
    icono: 'mode_fan',
    defaultsIso: { grupo: 'grupo2', soporte: 'rigido' },
    nodos: Object.freeze([
      motorElectricoEstandar,
      {
        id: 'ventilador',
        nombre: 'Chumacera Ventilador',
        icono: 'air',
        spots: Object.freeze(['FAN_LA', 'FAN_LL'])
      }
    ])
  }
});

export class MasterTemplateRegistry {
  private templates: Map<string, EstructuraEquipo> = new Map();

  constructor(cargarCatalogoBase = true) {
    if (cargarCatalogoBase) {
      this.registrarPlantillas(CATALOGO_PLANTILLAS_BASE);
    }
  }

  public registrarPlantillas(catalogo: Record<string, Omit<EstructuraEquipo, 'key'>>): void {
    Object.entries(catalogo).forEach(([key, val]) => {
      this.templates.set(key, Object.freeze({ key, ...val }));
    });
  }

  public resolverEstructura(tipoStr = '', defaultKey = 'transportador'): EstructuraEquipo | null {
    const t = String(tipoStr)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (!t) return this.templates.get(defaultKey) ?? null;

    // 1. Coincidencias específicas compuestas
    if (t.includes('chancador') && (t.includes('primario') || t.includes('giratorio'))) {
      return this.templates.get('chancador_primario') ?? null;
    }
    if (t.includes('chancador') && (t.includes('secundario') || t.includes('cono'))) {
      return this.templates.get('chancador_secundario') ?? null;
    }
    if (t.includes('harnero') || t.includes('criba') || t.includes('terciario')) {
      return this.templates.get('harnero_secundario') ?? null;
    }
    if (t.includes('prensa') || t.includes('hpgr') || t.includes('rodillo')) {
      return this.templates.get('prensa') ?? null;
    }
    if (t.includes('ventilador') || t.includes('colector') || t.includes('soplador')) {
      return this.templates.get('colector') ?? null;
    }
    if (t.includes('transportador') || t.includes('correa') || t.includes('feeder')) {
      return this.templates.get('transportador') ?? null;
    }

    // 2. Búsqueda por coincidencia directa de clave o nombre de plantilla
    for (const [key, template] of this.templates.entries()) {
      const nombreNorm = template.nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      if (t === key || t.includes(key) || t.includes(nombreNorm)) {
        return template;
      }
    }

    return this.templates.get(defaultKey) ?? null;
  }

  public obtenerSpots(tipoStr = '', defaultKey = 'transportador'): string[] {
    const estructura = this.resolverEstructura(tipoStr, defaultKey);
    if (!estructura) return [];
    return estructura.nodos.flatMap((nodo) => nodo.spots);
  }

  public listarPlantillas(): EstructuraEquipo[] {
    return Array.from(this.templates.values());
  }
}

export const masterTemplateRegistry = new MasterTemplateRegistry();