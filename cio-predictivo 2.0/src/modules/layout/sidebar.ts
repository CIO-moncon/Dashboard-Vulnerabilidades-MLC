import { renderizarModuloTriage } from '../triage/triage';
import { renderizarExpediente } from '../activos/expediente';

declare const window: any;
declare const maplibregl: any;

export interface ActivoSidebar {
  idKey: string;
  peso: number;
  tag?: string;
  Tag?: string;
  nombre?: string;
  area?: string;
  Area?: string;
  severidad?: string;
  estado?: string;
  latitud?: number | string;
  longitud?: number | string;
  [key: string]: any;
}

export interface AreaSidebar {
  areaNom: string;
  maxPeso: number;
  equipos: ActivoSidebar[];
}

let filtroTextoActivo = '';
let debounceSidebarTimer: number | null = null;
let areaActivaSeleccionada: string | null = null;

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const obtenerPesoCriticidad = (severidad = ''): number => {
  const s = String(severidad || '').trim().toLowerCase();
  if (s.includes('rojo') || s.includes('crit') || s === 'd' || s.includes('zona d')) return 4;
  if (s.includes('naranja') || s.includes('alert') || s.includes('salmon') || s === 'c' || s.includes('zona c')) return 3;
  if (s.includes('amarillo') || s.includes('seg') || s === 'b' || s.includes('zona b')) return 2;
  return 1;
};

export const obtenerColorDot = (peso: number): string => {
  switch (peso) {
    case 4:
      return '#ef4444';
    case 3:
      return '#f97316';
    case 2:
      return '#eab308';
    default:
      return '#00e676';
  }
};

const actualizarEstiloPestanasNav = (vistaActiva: 'catastro' | 'triage'): void => {
  const btnCatastro = document.getElementById('tab-catastro');
  const btnTriage = document.getElementById('tab-triage');

  if (btnCatastro) {
    const esActivo = vistaActiva === 'catastro';
    btnCatastro.classList.toggle('active', esActivo);
    btnCatastro.style.color = esActivo ? 'var(--primary-color, #38bdf8)' : '#94a3b8';
    btnCatastro.style.borderBottomColor = esActivo ? 'var(--primary-color, #38bdf8)' : 'transparent';
  }

  if (btnTriage) {
    const esActivo = vistaActiva === 'triage';
    btnTriage.classList.toggle('active', esActivo);
    btnTriage.style.color = esActivo ? 'var(--primary-color, #38bdf8)' : '#94a3b8';
    btnTriage.style.borderBottomColor = esActivo ? 'var(--primary-color, #38bdf8)' : 'transparent';
  }
};

export const renderizarSidebarCBM = (datosEquipos: Record<string, any> = {}): void => {
  const contenedor = document.getElementById('contenedor-areas-sidebar');
  if (!contenedor) return;

  const equipos = Object.entries(datosEquipos || {}).filter(
    ([, eq]) => eq && typeof eq === 'object'
  );

  if (equipos.length === 0) {
    contenedor.innerHTML = `
      <div style="padding: 1.5rem 0.5rem; text-align: center; color: var(--text-muted, #94a3b8); font-size: 0.78rem;">
        <span class="material-symbols-outlined" style="font-size: 1.6rem; color: #38bdf8; margin-bottom: 4px;">hourglass_top</span>
        <p style="margin: 0;">Cargando inventario...</p>
      </div>
    `;
    return;
  }

  const mapaAreas: Record<string, AreaSidebar> = {};

  for (const [idKey, eq] of equipos) {
    const area = String(eq.area || eq.Area || 'General').trim();
    const peso = obtenerPesoCriticidad(eq.severidad || eq.estado);

    if (!mapaAreas[area]) {
      mapaAreas[area] = {
        areaNom: area,
        maxPeso: 1,
        equipos: []
      };
    }

    if (peso > mapaAreas[area].maxPeso) {
      mapaAreas[area].maxPeso = peso;
    }

    mapaAreas[area].equipos.push({
      idKey,
      peso,
      ...eq
    });
  }

  const listaAreas = Object.values(mapaAreas);

  listaAreas.forEach((a) => {
    a.equipos.sort((x, y) => {
      if (y.peso !== x.peso) return y.peso - x.peso;
      return String(x.tag || x.idKey || '').localeCompare(String(y.tag || y.idKey || ''));
    });
  });

  listaAreas.sort((a, b) => {
    if (b.maxPeso !== a.maxPeso) return b.maxPeso - a.maxPeso;
    return a.areaNom.localeCompare(b.areaNom);
  });

  // VISTA A: Equipos del área seleccionada
  if (areaActivaSeleccionada) {
    const areaData = listaAreas.find(
      (a) => a.areaNom.toLowerCase() === areaActivaSeleccionada!.toLowerCase()
    );

    if (!areaData) {
      areaActivaSeleccionada = null;
      renderizarSidebarCBM(datosEquipos);
      return;
    }

    const colorDotArea = obtenerColorDot(areaData.maxPeso);

    contenedor.innerHTML = `
      <div style="padding: 10px 14px;">
        <button type="button" 
                onclick="window.deseleccionarAreaSidebar()" 
                style="width: 100%; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: var(--primary-color, #38bdf8); padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; transition: background 0.15s ease;">
          <span class="material-symbols-outlined" style="font-size: 1.15rem;">arrow_back</span>
          <span>Volver a Áreas</span>
        </button>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 6px 12px 6px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorDotArea}; box-shadow: 0 0 8px ${colorDotArea};"></span>
            <strong style="color: #ffffff; font-size: 0.95rem; letter-spacing: 0.3px;">${escaparHTML(areaData.areaNom)}</strong>
          </div>
          <span style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">${areaData.equipos.length} equipos</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${areaData.equipos
            .map((eq) => {
              const cDot = obtenerColorDot(eq.peso);
              const tagLimpio = eq.tag || eq.Tag || eq.idKey || 'SIN-TAG';
              const targetKey = tagLimpio.toUpperCase().replace(/\s+/g, '_');

              return `
                <button type="button" 
                        class="item-navegable" 
                        data-target="${escaparHTML(targetKey)}" 
                        data-firebase-id="${escaparHTML(eq.idKey)}"
                        onclick="window.abrirExpedienteDesdeSidebar('${escaparHTML(eq.idKey)}')"
                        title="${escaparHTML(tagLimpio)} — ${escaparHTML(eq.nombre || 'Activo Crítico')}"
                        style="width: 100%; background: rgba(22, 40, 45, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-left: 4px solid ${cDot}; padding: 11px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; text-align: left; transition: all 0.15s ease; box-sizing: border-box;">
                  <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-right: 6px;">
                    <span style="color: #ffffff; font-family: monospace; font-size: 0.88rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${escaparHTML(tagLimpio)}
                    </span>
                    <span style="color: #94a3b8; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${escaparHTML(eq.nombre || 'Activo Crítico')}
                    </span>
                  </div>
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${cDot}; box-shadow: 0 0 6px ${cDot}; flex-shrink: 0;"></span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
    return;
  }

  // VISTA B: Listado de Áreas
  const busqueda = (filtroTextoActivo || '').toLowerCase();
  const areasParaMostrar = listaAreas.filter((a) => {
    if (!busqueda) return true;
    const coincideArea = a.areaNom.toLowerCase().includes(busqueda);
    const coincideEquipo = a.equipos.some(
      (eq) =>
        String(eq.tag || eq.idKey || '').toLowerCase().includes(busqueda) ||
        String(eq.nombre || '').toLowerCase().includes(busqueda)
    );
    return coincideArea || coincideEquipo;
  });

  contenedor.innerHTML = `
    <div style="padding: 10px 14px;">
      <div style="padding: 4px 6px 10px 6px; font-size: 0.74rem; color: #94a3b8; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
        ÁREAS OPERACIONALES (${listaAreas.length})
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${areasParaMostrar
          .map((a) => {
            const cDot = obtenerColorDot(a.maxPeso);

            return `
              <button type="button" 
                      class="card-area-cbm"
                      onclick="window.seleccionarAreaSidebar('${escaparHTML(a.areaNom)}')"
                      title="Ver equipos de ${escaparHTML(a.areaNom)}"
                      style="width: 100%; background: rgba(22, 40, 45, 0.82); border: 1px solid rgba(255, 255, 255, 0.09); padding: 13px 16px; border-radius: 9px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.15s ease; box-sizing: border-box;">
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px;">
                  <span style="color: #ffffff; font-weight: 800; font-size: 0.92rem; letter-spacing: 0.3px;">
                    ${escaparHTML(a.areaNom)}
                  </span>
                  <span style="color: #94a3b8; font-size: 0.74rem; font-weight: 600;">
                    ${a.equipos.length} equipos
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="width: 9px; height: 9px; border-radius: 50%; background: ${cDot}; box-shadow: 0 0 8px ${cDot};"></span>
                  <span class="material-symbols-outlined" style="font-size: 1.25rem; color: #64748b;">chevron_right</span>
                </div>
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
};

export const inicializarBarraLateral = (): void => {
  document.addEventListener('datosEquiposActualizados', ((e: CustomEvent) => {
    if (e.detail) {
      renderizarSidebarCBM(e.detail);
    }
  }) as EventListener);

  const inputBuscador = document.getElementById('input-busqueda-sidebar') as HTMLInputElement | null;

  if (inputBuscador) {
    inputBuscador.addEventListener('input', (e: Event) => {
      if (debounceSidebarTimer !== null) clearTimeout(debounceSidebarTimer);
      const val = (e.target as HTMLInputElement).value.trim().toLowerCase();

      debounceSidebarTimer = window.setTimeout(() => {
        filtroTextoActivo = val;
        renderizarSidebarCBM(window.datosGlobalesEquipos || {});

        if (window.filtrarMapaPorAreaOSearch) {
          if (val === '') {
            if (areaActivaSeleccionada) {
              window.filtrarMapaPorAreaOSearch('AREA', areaActivaSeleccionada);
            } else {
              window.filtrarMapaPorAreaOSearch('TODOS', '');
            }
          } else {
            window.filtrarMapaPorAreaOSearch('SEARCH', val);
          }
        }
      }, 180);
    });
  }

  document.addEventListener('click', (e: MouseEvent) => {
    const targetBtn = (e.target as HTMLElement).closest('button, .tab-btn') as HTMLElement | null;
    if (!targetBtn || targetBtn.closest('#modal-alertas-terreno') || targetBtn.closest('.modal-overlay')) {
      return;
    }

    if (targetBtn.id === 'tab-triage') {
      actualizarEstiloPestanasNav('triage');
      if (window.destruirMapaActivo) window.destruirMapaActivo();
      renderizarModuloTriage('espacio-trabajo-dinamico');
      return;
    }

    if (targetBtn.id === 'tab-catastro') {
      actualizarEstiloPestanasNav('catastro');
      areaActivaSeleccionada = null;
      if (window.filtrarMapaPorAreaOSearch) {
        window.filtrarMapaPorAreaOSearch('TODOS', '');
      }
      if (window.renderizarMapaPlanta) {
        window.renderizarMapaPlanta();
      } else {
        renderizarSidebarCBM(window.datosGlobalesEquipos || {});
      }
      return;
    }
  });

  if (window.datosGlobalesEquipos && Object.keys(window.datosGlobalesEquipos).length > 0) {
    renderizarSidebarCBM(window.datosGlobalesEquipos);
  }
};

// ============================================================================
// EXPOSICIÓN GLOBAL
// ============================================================================
if (typeof window !== 'undefined') {
  window.seleccionarAreaSidebar = (areaNom: string) => {
    areaActivaSeleccionada = areaNom;

    if (window.filtrarMapaPorAreaOSearch) {
      window.filtrarMapaPorAreaOSearch('AREA', areaNom);
    }

    if (window.mapaActivo && window.datosGlobalesEquipos && typeof maplibregl !== 'undefined') {
      const coordsArea: [number, number][] = [];
      for (const eq of Object.values<any>(window.datosGlobalesEquipos)) {
        if (eq?.area?.toLowerCase() === areaNom.toLowerCase()) {
          const lat = parseFloat(eq.latitud);
          const lng = parseFloat(eq.longitud);
          if (!isNaN(lat) && !isNaN(lng)) {
            coordsArea.push([lng, lat]);
          }
        }
      }

      if (coordsArea.length === 1) {
        window.mapaActivo.flyTo({ center: coordsArea[0], zoom: 17.5, speed: 1.2 });
      } else if (coordsArea.length > 1) {
        const bounds = coordsArea.reduce(
          (b, coord) => b.extend(coord),
          new maplibregl.LngLatBounds(coordsArea[0], coordsArea[0])
        );
        window.mapaActivo.fitBounds(bounds, { padding: 60, maxZoom: 17.5, duration: 900 });
      }
    }

    renderizarSidebarCBM(window.datosGlobalesEquipos || {});
  };

  window.deseleccionarAreaSidebar = () => {
    areaActivaSeleccionada = null;
    if (window.filtrarMapaPorAreaOSearch) {
      window.filtrarMapaPorAreaOSearch('TODOS', '');
    }
    renderizarSidebarCBM(window.datosGlobalesEquipos || {});
  };

  window.abrirExpedienteDesdeSidebar = (idActivo: string) => {
    if (window.destruirMapaActivo) window.destruirMapaActivo();
    renderizarExpediente(idActivo, 'espacio-trabajo-dinamico');
  };
}