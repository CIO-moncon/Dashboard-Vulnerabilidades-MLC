import { AuthService, SesionUsuario } from './core/auth/authService';
import { LosColoradosTenantConfig } from './tenants/los-colorados.config';
import { injectTenantTheme } from './core/theme/tokenInjector';
import { SyncManager } from './core/offline/syncManager';
import { inicializarBarraLateral } from './modules/layout/sidebar';
import { renderizarExpediente } from './modules/activos/expediente';
import { renderizarModuloPMS } from './modules/pms/pmsCore';
import { renderizarControlAvisosEspectrales } from './modules/avisos/controlAvisosEspectrales';
import { iniciarEscuchaBadgeGlobal } from './modules/triage/triage';
import { UI } from './modules/layout/notificaciones';

declare const maplibregl: any;
declare const window: any;

export interface ConfiguracionVisualPin {
  colorHex: string;
  animacion: string;
  claseEstado: string;
  textoEstado: string;
}

let datosGlobalesEquipos: Record<string, any> = {};
let mapaActivo: any = null;
let listaMarcadoresActivos: any[] = [];
let diccionarioMarcadores: Record<string, any> = {};
let nivelFiltroActual = 'TODOS';
let esVista3D = true;

let filtroModoMapa = 'TODOS';
let filtroValorMapa = '';

let appInicializada = false;
let rafDibujoPines: number | null = null;
let cacheAlertasTerreno: Record<string, any> | null = null;

// Exposición en el contexto window para compatibilidad
window.datosGlobalesEquipos = datosGlobalesEquipos;
window.mapaActivo = null;

const escaparHTML = (texto = ''): string =>
  String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const resolverConfiguracionVisual = (severidad = ''): ConfiguracionVisualPin => {
  const sev = String(severidad || '').trim().toLowerCase();

  if (sev === 'rojo' || sev === 'critico' || sev === 'd' || sev.includes('zona d')) {
    return {
      colorHex: '#ef4444',
      animacion: 'animation: pulsePinRojo 1.1s infinite ease-out;',
      claseEstado: 'critica',
      textoEstado: 'Crítico (Zona D)'
    };
  }

  if (sev === 'naranja' || sev === 'salmon' || sev === 'alerta' || sev === 'c' || sev.includes('zona c')) {
    return {
      colorHex: '#f97316',
      animacion: 'animation: pulsePinSalmon 1.9s infinite ease-out;',
      claseEstado: 'alerta',
      textoEstado: 'Alerta (Zona C)'
    };
  }

  if (sev === 'amarillo' || sev === 'seguimiento' || sev === 'b' || sev.includes('zona b')) {
    return {
      colorHex: '#eab308',
      animacion: 'animation: pulsePinAmarillo 2.8s infinite ease-out;',
      claseEstado: 'seguimiento',
      textoEstado: 'Seguimiento (Zona B)'
    };
  }

  return {
    colorHex: '#00e676',
    animacion: 'box-shadow: 0 0 8px rgba(0, 230, 118, 0.65), 0 3px 10px rgba(0, 0, 0, 0.8);',
    claseEstado: 'normal',
    textoEstado: 'Óptimo (Zona A)'
  };
};

export const destruirMapaActivo = (): void => {
  if (rafDibujoPines !== null) {
    cancelAnimationFrame(rafDibujoPines);
    rafDibujoPines = null;
  }

  for (const marcador of listaMarcadoresActivos) {
    marcador?.remove?.();
  }
  listaMarcadoresActivos = [];
  diccionarioMarcadores = {};

  if (mapaActivo) {
    mapaActivo.remove();
    mapaActivo = null;
    window.mapaActivo = null;
  }
};

window.destruirMapaActivo = destruirMapaActivo;

// ============================================================================
// CARGA DE ACTIVOS DESDE EL BACKEND FASTAPI REST
// ============================================================================
export const cargarActivosCentral = async (): Promise<void> => {
  try {
    const response = await fetch('/api/cbm/registros?limit=250', {
      headers: AuthService.getHeadersTenant()
    });

    if (response.ok) {
      const data = await response.json();
      const registros = data.registros || [];
      const mapaEquipos: Record<string, any> = {};

      registros.forEach((r: any) => {
        const payload = r.payload || {};
        const tag = payload.tag || r.id;
        if (!mapaEquipos[tag]) {
          mapaEquipos[tag] = {
            id: r.id,
            tag,
            nombre: payload.nombre || `Activo ${tag}`,
            area: payload.area || 'General',
            nivel: payload.nivel || 'Nivel 1',
            severidad: payload.severidad || 'VERDE',
            latitud: payload.lat ?? payload.latitud,
            longitud: payload.lng ?? payload.longitud,
            components: payload.components || [],
            spots: payload.spots || {}
          };
        }
      });

      // Inicializar catálogo piloto si aún no existen registros remotos
      if (Object.keys(mapaEquipos).length === 0) {
        mapaEquipos['CV-01'] = {
          id: 'CV-01',
          tag: 'CV-01',
          nombre: 'Correa Transportadora CV-01',
          area: 'AR54',
          nivel: 'Nivel 1',
          severidad: 'AMARILLO',
          latitud: -28.2908,
          longitud: -70.8130
        };
        mapaEquipos['CH-01'] = {
          id: 'CH-01',
          tag: 'CH-01',
          nombre: 'Chancador Primario Giratorio',
          area: 'AR61',
          nivel: 'Nivel 1',
          severidad: 'ROJO',
          latitud: -28.2915,
          longitud: -70.8122
        };
      }

      datosGlobalesEquipos = mapaEquipos;
      window.datosGlobalesEquipos = datosGlobalesEquipos;

      const espacioDinamico = document.getElementById('espacio-trabajo-dinamico');
      if (
        espacioDinamico &&
        (!espacioDinamico.innerHTML.includes('mapa-satelital') ||
          espacioDinamico.innerHTML.includes('Cargando Dashboard'))
      ) {
        if (!espacioDinamico.innerHTML.includes('panel-industrial')) {
          renderizarMapaPlanta();
        }
      } else if (mapaActivo) {
        dibujarPinesEnMapa();
      }

      document.dispatchEvent(
        new CustomEvent('datosEquiposActualizados', { detail: datosGlobalesEquipos })
      );
    }
  } catch (err) {
    console.warn('[Core] Error cargando inventario de activos:', err);
  }
};

// ============================================================================
// MODAL DE ALERTAS DE TERRENO
// ============================================================================
export const renderizarAlertasTerrenoManager = (alertasData: Record<string, any> | null): void => {
  const contenedor =
    document.getElementById('lista-alertas-terreno-container') ||
    document.getElementById('lista-alertas-terreno') ||
    document.getElementById('contenedor-alertas-terreno') ||
    document.querySelector('#modal-alertas-terreno .modal-body');

  const badge =
    document.getElementById('badgeAlertasTerreno') ||
    document.getElementById('badgeTriagePendientes') ||
    document.querySelector('.badge-alerta');

  if (!alertasData) {
    if (badge) {
      badge.textContent = '0';
      badge.classList.remove('pulsante');
    }
    if (contenedor) {
      contenedor.innerHTML = `
        <div role="status" style="text-align: center; color: var(--text-muted, #94a3b8); padding: 2.5rem 1rem;">
          <span class="material-symbols-outlined" style="font-size: 2.5rem; color: #00e676; margin-bottom: 8px;" aria-hidden="true">check_circle</span>
          <p style="margin: 0; font-size: 0.95rem;">No hay reportes de terreno pendientes en este momento.</p>
        </div>
      `;
    }
    return;
  }

  const keys = Object.keys(alertasData);
  if (badge) {
    badge.textContent = String(keys.length);
    if (keys.length > 0) badge.classList.add('pulsante');
    else badge.classList.remove('pulsante');
  }

  if (!contenedor) return;

  contenedor.setAttribute('role', 'feed');
  contenedor.style.display = 'flex';
  contenedor.style.flexDirection = 'column';
  contenedor.style.gap = '12px';
  contenedor.style.maxHeight = '65vh';
  contenedor.style.overflowY = 'auto';

  contenedor.innerHTML = keys
    .reverse()
    .map((key) => {
      const al = alertasData[key] ?? {};
      const fechaTexto = al.timestamp ? new Date(al.timestamp).toLocaleString('es-CL') : 'Reciente';
      const tagLimpio = escaparHTML(al.tag ?? 'SIN TAG');
      const detalleLimpio = escaparHTML(al.detalle ?? al.descripcion ?? 'Sin detalle adjunto');
      const areaLimpia = escaparHTML(al.area ?? 'General');
      const componenteLimpio = escaparHTML(al.componente ?? 'General');

      const configVisual = resolverConfiguracionVisual(al.severidad || al.severidadPreliminar);

      return `
        <article class="alerta-card-moderna ${configVisual.claseEstado}" 
                 role="article"
                 tabindex="0"
                 onclick="window.irAExpedienteDesdeAlerta('${tagLimpio}')" 
                 style="cursor: pointer; background: #16282D; border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${configVisual.colorHex}; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
          <header style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${configVisual.colorHex}; box-shadow: 0 0 8px ${configVisual.colorHex};"></span>
              <strong style="color: #ffffff; font-family: monospace; font-size: 1rem;">TAG: ${tagLimpio}</strong>
            </div>
            <time style="font-size: 0.72rem; color: #94A3B8;">${fechaTexto}</time>
          </header>
          <div style="font-size: 0.76rem; color: #38bdf8;">
            Área: <span style="color: #f8fafc;">${areaLimpia}</span> | Componente: <span style="color: #f8fafc;">${componenteLimpio}</span>
          </div>
          <p style="margin: 0; font-size: 0.82rem; color: #CBD5E1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px;">
            ${detalleLimpio}
          </p>
        </article>
      `;
    })
    .join('');
};

// ============================================================================
// MAPA 3D CON MAPLIBRE GL JS
// ============================================================================
export const renderizarMapaPlanta = (): void => {
  const contenedor = document.getElementById('espacio-trabajo-dinamico');
  if (!contenedor || typeof maplibregl === 'undefined') return;

  destruirMapaActivo();

  const nivelesDisponibles = ['TODOS', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel -1'];
  const htmlBotonesNivel = nivelesDisponibles
    .map((niv) => {
      const activo = nivelFiltroActual === niv;
      return `
        <button type="button" 
                class="btn-filtro-nivel" 
                data-nivel="${niv}" 
                onclick="window.filtrarMapaPorNivel('${niv}')"
                aria-pressed="${activo ? 'true' : 'false'}"
                style="background: ${activo ? 'var(--primary-color, #38bdf8)' : 'rgba(255,255,255,0.05)'}; color: ${activo ? '#0E1B1F' : '#e2e8f0'}; border: 1px solid ${activo ? 'var(--primary-color, #38bdf8)' : 'rgba(255,255,255,0.1)'}; padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
          ${niv === 'TODOS' ? 'Global' : niv}
        </button>
      `;
    })
    .join('');

  contenedor.innerHTML = `
    <section class="contenedor-mapa-seccion" role="region" aria-label="Monitoreo geoespacial" style="padding: 0.5rem; height: 100%; display: flex; flex-direction: column; gap: 0.75rem; box-sizing: border-box;">
      <header style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; background: rgba(14, 27, 31, 0.85); padding: 1rem 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
        <div>
          <h2 style="color: #ffffff; font-size: 1.25rem; margin: 0 0 0.25rem 0; display: flex; align-items: center; gap: 0.5rem; font-family: 'Space Grotesk', sans-serif;">
            <span class="material-symbols-outlined" style="color: var(--primary-color, #38bdf8);" aria-hidden="true">domain</span>
            Monitoreo Geoespacial — ${LosColoradosTenantConfig.branding.nombreFaena}
          </h2>
          <p style="color: #94A3B8; margin: 0; font-size: 0.78rem;">
            Visualización 3D interactiva CBM. Rotación con <kbd style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">Clic Derecho</kbd>.
          </p>
        </div>

        <nav aria-label="Controles de cota y perspectiva" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="font-size: 0.75rem; color: #94A3B8;">Cota / Nivel:</span>
          ${htmlBotonesNivel}
          <button type="button" 
                  id="btn-toggle-3d" 
                  onclick="window.alternarPerspectivaMapa()"
                  style="margin-left: 0.5rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
            <span class="material-symbols-outlined" style="font-size: 1rem;" aria-hidden="true">3d_rotation</span>
            <span>${esVista3D ? 'Modo 3D' : 'Plano 2D'}</span>
          </button>
        </nav>
      </header>
      
      <div id="mapa-satelital" style="flex-grow: 1; min-height: 480px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; position: relative;"></div>
    </section>
  `;

  const { center, zoom, pitch, bearing } = LosColoradosTenantConfig.geoViewer;

  mapaActivo = new maplibregl.Map({
    container: 'mapa-satelital',
    style: {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 17
        },
        'terreno-dem': {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'capa-satelital-esri',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 22
        }
      ],
      terrain: {
        source: 'terreno-dem',
        exaggeration: 1.25
      }
    },
    center,
    zoom,
    pitch: esVista3D ? pitch : 0,
    bearing: esVista3D ? bearing : 0,
    maxPitch: 82,
    minZoom: 13,
    maxZoom: 21
  });

  mapaActivo.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true
    }),
    'top-right'
  );

  window.mapaActivo = mapaActivo;

  mapaActivo.on('load', () => {
    dibujarPinesEnMapa();
  });
};

export const dibujarPinesEnMapa = (): void => {
  if (!mapaActivo) return;

  if (rafDibujoPines !== null) {
    cancelAnimationFrame(rafDibujoPines);
  }

  rafDibujoPines = requestAnimationFrame(() => {
    for (const m of listaMarcadoresActivos) {
      m?.remove?.();
    }
    listaMarcadoresActivos = [];
    diccionarioMarcadores = {};

    const entries = Object.entries(datosGlobalesEquipos);

    for (const [idKey, eq] of entries) {
      if (!eq) continue;

      const lat = parseFloat(eq.latitud);
      const lng = parseFloat(eq.longitud);

      if (isNaN(lat) || isNaN(lng)) continue;

      const nivelEquipo = eq.nivel ?? 'Nivel 1';
      const areaEq = (eq.area ?? '').trim();
      const tagEq = (eq.tag ?? '').toLowerCase();
      const nombreEq = (eq.nombre ?? '').toLowerCase();

      if (nivelFiltroActual !== 'TODOS' && nivelEquipo !== nivelFiltroActual) continue;
      if (filtroModoMapa === 'AREA' && areaEq.toLowerCase() !== filtroValorMapa) continue;
      if (filtroModoMapa === 'SEARCH' && !tagEq.includes(filtroValorMapa) && !nombreEq.includes(filtroValorMapa)) continue;

      const configVisual = resolverConfiguracionVisual(eq.severidad ?? eq.estado);
      const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;

      const el = document.createElement('div');
      el.className = 'maplibre-pin-node';
      el.style.cssText = `
        width: 20px; 
        height: 20px; 
        background-color: ${configVisual.colorHex}; 
        border-radius: 50%; 
        border: 3px solid #ffffff; 
        box-sizing: border-box;
        cursor: pointer;
        ${configVisual.animacion}
      `;

      const popupHTML = `
        <article style="background: rgba(14, 27, 31, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; padding: 14px; color: #ffffff; width: 240px; font-family: system-ui, sans-serif;">
          <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 4px;">
              ${escaparHTML(nivelEquipo)}
            </span>
            <span style="font-size: 0.68rem; color: ${configVisual.colorHex}; font-weight: 800;">${escaparHTML(configVisual.textoEstado)}</span>
          </header>
          <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; font-family: monospace;">${escaparHTML(eq.tag ?? '')}</h4>
          <p style="margin: 2px 0 8px 0; font-size: 0.74rem; color: #CBD5E1;">${escaparHTML(eq.nombre || 'Activo Crítico')}</p>
          <button type="button" 
                  onclick="window.abrirExpedienteDirecto('${escaparHTML(idKey)}')"
                  style="width: 100%; background: #0284c7; color: white; border: none; padding: 7px; border-radius: 6px; font-size: 0.78rem; font-weight: 800; cursor: pointer;">
            Abrir Expediente
          </button>
        </article>
      `;

      const popup = new maplibregl.Popup({ offset: [0, -15], closeButton: true, maxWidth: '280px' }).setHTML(popupHTML);

      const coords: [number, number] = [lng, lat];
      const marcador = new maplibregl.Marker({ element: el }).setLngLat(coords).setPopup(popup).addTo(mapaActivo);

      listaMarcadoresActivos.push(marcador);
      diccionarioMarcadores[idKey] = { marker: marcador, popup, coords, eq };
      diccionarioMarcadores[targetId] = { marker: marcador, popup, coords, eq };
    }
  });
};

// ============================================================================
// INICIALIZACIÓN DE LA SHELL PRINCIPAL
// ============================================================================
const inicializarApp = (): void => {
  if (appInicializada) return;
  appInicializada = true;

  // 1. Inyección de variables CSS de marca blanca
  injectTenantTheme(LosColoradosTenantConfig.theme);

  // 2. Inicialización de sincronización Outbox
  SyncManager.inicializar();

  // 3. Inicialización del layout y sidebar
  inicializarBarraLateral();
  iniciarEscuchaBadgeGlobal();

  // 4. Carga inicial del inventario de activos
  cargarActivosCentral();

  // 5. Delegación de eventos del shell
  document.addEventListener('click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const btnSalir = target.closest('#btn-salir');
    if (btnSalir) {
      const confirmado = await UI.confirmar('¿Estás seguro de cerrar tu sesión?', 'Cerrar Sesión');
      if (confirmado) {
        AuthService.cerrarSesion();
        window.location.reload();
      }
      return;
    }

    const btnAvisos = target.closest('#btn-avisos-espectrales');
    if (btnAvisos) {
      destruirMapaActivo();
      renderizarControlAvisosEspectrales('espacio-trabajo-dinamico');
      return;
    }

    const btnPMS = target.closest('#btn-modulo-pms');
    if (btnPMS) {
      destruirMapaActivo();
      renderizarModuloPMS('espacio-trabajo-dinamico');
      return;
    }

    const btnVolver = target.closest('#btn-volver-dashboard') || target.closest('#btn-cerrar-expediente');
    if (btnVolver) {
      renderizarMapaPlanta();
      return;
    }
  });
};

const mostrarPlataforma = (sesion: SesionUsuario): void => {
  document.getElementById('vista-login')?.classList.add('oculta');
  document.getElementById('vista-app')?.classList.remove('oculta');

  const perfilNombre = document.getElementById('perfil-nombre');
  const perfilRol = document.getElementById('perfil-rol');
  const avatarIniciales = document.getElementById('avatar-iniciales');

  if (perfilNombre) perfilNombre.textContent = sesion.nombre;
  if (perfilRol) perfilRol.textContent = sesion.rol;
  if (avatarIniciales) {
    avatarIniciales.textContent = sesion.nombre.substring(0, 2).toUpperCase();
  }

  inicializarApp();
};

document.addEventListener('DOMContentLoaded', () => {
  const sesion = AuthService.getSesion();
  if (sesion) {
    mostrarPlataforma(sesion);
  } else {
    document.getElementById('vista-login')?.classList.remove('oculta');
    document.getElementById('vista-app')?.classList.add('oculta');
  }

  const btnIngresar = document.getElementById('btn-ingresar');
  btnIngresar?.addEventListener('click', async () => {
    const inputEmail = document.getElementById('login-email') as HTMLInputElement | null;
    const inputPass = document.getElementById('login-pass') as HTMLInputElement | null;
    const errorDiv = document.getElementById('login-error');

    const email = inputEmail?.value.trim() ?? '';
    const pass = inputPass?.value.trim() ?? '';

    if (!email || !pass) {
      if (errorDiv) errorDiv.textContent = 'Ingrese usuario y contraseña.';
      return;
    }

    const nuevaSesion = AuthService.guardarSesion({
      uid: `usr_${Date.now()}`,
      email,
      nombre: email.split('@')[0].toUpperCase(),
      rol: 'ADMINISTRADOR',
      tenantId: LosColoradosTenantConfig.branding.tenantId,
      faenaNombre: LosColoradosTenantConfig.branding.nombreFaena,
      token: 'jwt_mock_token_cio_v2',
      ultimoAcceso: Date.now()
    });

    mostrarPlataforma(nuevaSesion);
  });
});

// Exposición global
if (typeof window !== 'undefined') {
  window.renderizarMapaPlanta = renderizarMapaPlanta;
  window.dibujarPinesEnMapa = dibujarPinesEnMapa;
  window.abrirExpedienteDirecto = (idActivo: string) => {
    destruirMapaActivo();
    renderizarExpediente(idActivo, 'espacio-trabajo-dinamico');
  };
  window.filtrarMapaPorNivel = (niv: string) => {
    nivelFiltroActual = niv;
    dibujarPinesEnMapa();
  };
  window.alternarPerspectivaMapa = () => {
    if (!mapaActivo) return;
    esVista3D = !esVista3D;
    mapaActivo.easeTo({ pitch: esVista3D ? 60 : 0, duration: 600 });
  };
}