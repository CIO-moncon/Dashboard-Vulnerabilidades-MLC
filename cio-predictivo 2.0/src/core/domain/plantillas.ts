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
}

export const motorElectricoEstandar: NodoCinematico = Object.freeze({
  id: 'motor',
  nombre: 'Motor Eléctrico Principal',
  icono: 'electric_bolt',
  spots: Object.freeze(['M1', 'M2'])
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
    spots.push(`G${i}`);
  }
  return spots;
};

export class MasterTemplateRegistry {
  private templates: Map<string, EstructuraEquipo> = new Map();

  public registrarPlantillas(catalogo: Record<string, Omit<EstructuraEquipo, 'key'>>): void {
    Object.entries(catalogo).forEach(([key, val]) => {
      this.templates.set(key, Object.freeze({ key, ...val }));
    });
  }

  public resolverEstructura(tipoStr = '', defaultKey = 'transportador'): EstructuraEquipo | null {
    const t = String(tipoStr).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!t) return this.templates.get(defaultKey) ?? null;

    for (const [key, template] of this.templates.entries()) {
      const nombreNorm = template.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (t.includes(key) || t.includes(nombreNorm)) {
        return template;
      }
    }

    if (t.includes('chancador') && t.includes('primario')) return this.templates.get('chancador_primario') ?? null;
    if (t.includes('chancador') && t.includes('secundario')) return this.templates.get('chancador_secundario') ?? null;
    if (t.includes('chancador') && t.includes('terciario')) return this.templates.get('chancador_terciario') ?? null;
    if (t.includes('terciario') || t.includes('exitatriz')) return this.templates.get('harnero_terciario') ?? null;
    if (t.includes('harnero') || t.includes('criba')) return this.templates.get('harnero_secundario') ?? null;
    if (t.includes('transportador') || t.includes('correa')) return this.templates.get('transportador') ?? null;
    if (t.includes('tripper')) return this.templates.get('tripper') ?? null;
    if (t.includes('beltfeeder') && t.includes('pesado')) return this.templates.get('beltfeeder_pesado') ?? null;
    if (t.includes('beltfeeder')) return this.templates.get('beltfeeder_estandar') ?? null;
    if (t.includes('prensa') || t.includes('hpgr')) return this.templates.get('prensa') ?? null;
    if (t.includes('colector') || t.includes('ventilador')) return this.templates.get('colector') ?? null;

    return this.templates.get(defaultKey) ?? null;
  }

  public obtenerSpots(tipoStr = '', defaultKey = 'transportador'): string[] {
    const estructura = this.resolverEstructura(tipoStr, defaultKey);
    if (!estructura) return [];
    return estructura.nodos.flatMap((nodo) => nodo.spots);
  }
}