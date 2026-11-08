import { UI } from './notificaciones';
import { argsJson, ejecutarComando, registrarComando } from '../../core/app/comandos';
import {
  obtenerDatosEquipos,
  obtenerMapaActivo,
  suscribirCambiosEquipos,
} from '../../core/app/estadoApp';
import { escaparHTML } from '../../core/utils/sanitizar';

let terminoBusqueda = '';
let areaExpandidaActiva: string | null = null;
let equipoSeleccionadoActual: string | null = null;

const resolverColorSeveridad = (severidad = ''): string => {
  const sev = String(severidad || '')
    .trim()
    .toLowerCase();
  if (sev === 'rojo' || sev === 'critico' || sev === 'd') return '#ef4444';
  if (sev === 'naranja' || sev === 'salmon' || sev === 'alerta' || sev === 'c') return '#f97316';
  if (sev === 'amarillo' || sev === 'seguimiento' || sev === 'b') return '#eab308';
  return '#00e676';
};

export const renderizarCatastroEnSidebar = (): void => {
  const contenedor = document.getElementById('contenedor-areas-sidebar');
  if (!contenedor) return;

  const datosEquipos: Record<string, any> = obtenerDatosEquipos();
  const tags = Object.keys(datosEquipos);

  const gruposPorArea: Record<string, any[]> = {};

  tags.forEach((tagKey) => {
    const eq = datosEquipos[tagKey];
    if (!eq) return;

    const coincideFiltro =
      !terminoBusqueda ||
      (eq.tag && eq.tag.toLowerCase().includes(terminoBusqueda.toLowerCase())) ||
      (eq.nombre && eq.nombre.toLowerCase().includes(terminoBusqueda.toLowerCase())) ||
      (eq.area && eq.area.toLowerCase().includes(terminoBusqueda.toLowerCase()));

    if (!coincideFiltro) return;

    const nombreArea = (eq.area || 'Área General').trim().toUpperCase();
    if (!gruposPorArea[nombreArea]) {
      gruposPorArea[nombreArea] = [];
    }
    gruposPorArea[nombreArea].push(eq);
  });

  const areasOrdenadas = Object.keys(gruposPorArea).sort();

  let htmlContenido = `
    <!-- CABECERA CATASTRO COMPACTA -->
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 8px;">
      <span style="font-size: 0.72rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Áreas (${areasOrdenadas.length})
      </span>
      <button type="button" 
              data-accion="equipo:abrirModalNuevo" 
              title="Registrar nuevo equipo o TAG"
              style="flex-shrink: 0; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
        <span class="material-symbols-outlined" style="font-size: 1rem;">add</span>
        <span>Nuevo TAG</span>
      </button>
    </div>

    <div style="padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
  `;

  if (areasOrdenadas.length === 0) {
    htmlContenido += `
      <div style="padding: 2rem 1rem; text-align: center; color: #94A3B8; font-size: 0.78rem;">
        No se encontraron equipos bajo el criterio de búsqueda.
      </div>
    `;
  } else {
    areasOrdenadas.forEach((area) => {
      const listaEq = gruposPorArea[area];
      const estaAbierta = areaExpandidaActiva === area || terminoBusqueda.length > 0;

      let peorSeveridad = '#00e676';
      if (listaEq.some((e) => (e.severidad || '').toUpperCase() === 'ROJO'))
        peorSeveridad = '#ef4444';
      else if (listaEq.some((e) => (e.severidad || '').toUpperCase() === 'NARANJA'))
        peorSeveridad = '#f97316';
      else if (listaEq.some((e) => (e.severidad || '').toUpperCase() === 'AMARILLO'))
        peorSeveridad = '#eab308';

      htmlContenido += `
        <div class="acordeon-area" style="background: rgba(22, 40, 45, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden;">
          <header data-accion="sidebar:alternarArea" data-args='${argsJson([area])}' style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${peorSeveridad};"></span>
              <strong style="font-size: 0.8rem; color: #ffffff; font-family: 'Space Grotesk', sans-serif;">${escaparHTML(area)}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.7rem; color: #94A3B8; font-weight: 700;">${listaEq.length}</span>
              <span class="material-symbols-outlined" style="font-size: 1rem; color: #94A3B8; transform: ${estaAbierta ? 'rotate(180deg)' : 'rotate(0)'}; transition: transform 0.2s ease;">expand_more</span>
            </div>
          </header>

          ${
            estaAbierta
              ? `
            <div style="border-top: 1px solid rgba(255,255,255,0.04); background: rgba(14, 27, 31, 0.4); padding: 4px 6px; display: flex; flex-direction: column; gap: 3px;">
              ${listaEq
                .map((eq) => {
                  const colorSev = resolverColorSeveridad(eq.severidad);
                  const tagLimpio = escaparHTML(eq.tag || 'S/T');
                  const estaSeleccionado = equipoSeleccionadoActual === tagLimpio;

                  const estiloFila = estaSeleccionado
                    ? 'background: rgba(56, 189, 248, 0.16); border: 1px solid rgba(56, 189, 248, 0.45);'
                    : 'background: transparent; border: 1px solid transparent;';

                  return `
                  <div id="fila-sidebar-${tagLimpio}" 
                       class="fila-equipo-sidebar" 
                       style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 6px; transition: all 0.2s ease; ${estiloFila}">
                    
                    <div data-accion="sidebar:centrarEquipo" data-args='${argsJson([eq.tag || 'S/T'])}' 
                         style="cursor: pointer; display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;" 
                         title="Seleccionar y centrar en mapa">
                      <span style="width: 6px; height: 6px; border-radius: 50%; background: ${colorSev}; flex-shrink: 0; box-shadow: 0 0 6px ${colorSev};"></span>
                      <span style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: ${estaSeleccionado ? '#38bdf8' : '#ffffff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${tagLimpio}
                      </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 4px;">
                      <button type="button" 
                              data-accion="equipo:abrirModalPorTag" data-args='${argsJson([eq.tag || 'S/T'])}' 
                              title="Editar Ficha" 
                              style="background: transparent; border: none; color: #94A3B8; cursor: pointer; padding: 2px; display: flex; align-items: center; border-radius: 3px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">edit</span>
                      </button>
                      <button type="button" 
                              data-accion="expediente:abrir" data-args='${argsJson([eq.tag || 'S/T'])}' 
                              title="Abrir Expediente" 
                              style="background: transparent; border: none; color: #38bdf8; cursor: pointer; padding: 2px; display: flex; align-items: center; border-radius: 3px;">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem;">assignment</span>
                      </button>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      `;
    });
  }

  htmlContenido += `</div>`;
  contenedor.innerHTML = htmlContenido;
};

export const inicializarBarraLateral = (): void => {
  const inputBusqueda = document.getElementById(
    'input-busqueda-sidebar',
  ) as HTMLInputElement | null;
  inputBusqueda?.addEventListener('input', (e) => {
    terminoBusqueda = (e.target as HTMLInputElement).value.trim();
    renderizarCatastroEnSidebar();
  });

  const tabCatastro = document.getElementById('tab-catastro');
  const tabTriage = document.getElementById('tab-triage');

  tabCatastro?.addEventListener('click', () => {
    tabCatastro.classList.add('active');
    tabTriage?.classList.remove('active');

    // Restaurar inmediatamente el Geovisor 3D
    ejecutarComando('mapa:renderizar');
    renderizarCatastroEnSidebar();
  });

  tabTriage?.addEventListener('click', () => {
    tabTriage.classList.add('active');
    tabCatastro?.classList.remove('active');

    // Abrir bandeja de Triage
    ejecutarComando('triage:abrir');
  });

  suscribirCambiosEquipos(() => {
    renderizarCatastroEnSidebar();
  });

  renderizarCatastroEnSidebar();
};

// Registro de comandos del sidebar (antes: window.*).
registrarComando('sidebar:alternarArea', (_evento, area) => {
  const nombreArea = String(area ?? '');
  areaExpandidaActiva = areaExpandidaActiva === nombreArea ? null : nombreArea;
  renderizarCatastroEnSidebar();
});

registrarComando('sidebar:centrarEquipo', (_evento, tag) => {
  const tagEquipo = String(tag ?? '');
  equipoSeleccionadoActual = tagEquipo;
  renderizarCatastroEnSidebar();

  const eq = obtenerDatosEquipos()?.[tagEquipo];
  if (!eq) return;

  if (!obtenerMapaActivo()) {
    ejecutarComando('mapa:renderizar');
  }

  const lat = parseFloat(eq.latitud);
  const lng = parseFloat(eq.longitud);

  const mapa = obtenerMapaActivo();
  if (!isNaN(lat) && !isNaN(lng) && mapa) {
    mapa.flyTo({
      center: [lng, lat],
      zoom: 17.5,
      pitch: 60,
      essential: true,
    });
  }
});

registrarComando('sidebar:seleccionarFila', (_evento, tag) => {
  equipoSeleccionadoActual = String(tag ?? '');
  renderizarCatastroEnSidebar();
});
