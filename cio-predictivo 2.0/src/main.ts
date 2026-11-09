import {
  AuthService,
  SesionUsuario,
  inicializarInterceptorAutenticado,
} from './core/auth/authService';
import { LosColoradosTenantConfig } from './tenants/los-colorados.config';
import { injectTenantTheme } from './core/theme/tokenInjector';
import { SyncManager } from './core/offline/syncManager';
import { inicializarBarraLateral } from './modules/layout/sidebar';
import { renderizarExpediente } from './modules/activos/expediente';
import { renderizarModuloPMS } from './modules/pms/pmsCore';
import { renderizarControlAvisosEspectrales } from './modules/avisos/controlAvisosEspectrales';
import './modules/avisos/avisosCbm';
import { renderizarModuloTriage, iniciarEscuchaBadgeGlobal } from './modules/triage/triage';
import { UI } from './modules/layout/notificaciones';
import './modules/activos/modalGestionEquipo';
import './modules/usuarios/gestionUsuarios';
import { escaparHTML } from './core/utils/sanitizar';
import {
  argsJson,
  ejecutarComando,
  inicializarDelegacionComandos,
  registrarComando,
} from './core/app/comandos';
import { establecerDatosEquipos, establecerMapaActivo } from './core/app/estadoApp';

declare const maplibregl: any;

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

const filtroModoMapa: string = 'TODOS';
const filtroValorMapa: string = '';

let appInicializada = false;
let rafDibujoPines: number | null = null;
const equipoSeleccionadoActual: string | null = null;

// Estado compartido con los módulos (antes expuesto en window).
establecerDatosEquipos(datosGlobalesEquipos);
establecerMapaActivo(null);

export const obtenerInicialesNombre = (nombreCompleto: string): string => {
  if (!nombreCompleto) return 'US';
  const partes = nombreCompleto.trim().split(/[\s._@-]+/);
  if (partes.length >= 2 && partes[0] && partes[1]) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
  return nombreCompleto.substring(0, 2).toUpperCase();
};

export const resolverConfiguracionVisual = (severidad = ''): ConfiguracionVisualPin => {
  const sev = String(severidad || '')
    .trim()
    .toLowerCase();

  if (sev === 'rojo' || sev === 'critico' || sev === 'd' || sev.includes('zona d')) {
    return {
      colorHex: '#ef4444',
      animacion: 'animation: pulsePinRojo 1.1s infinite ease-out;',
      claseEstado: 'critica',
      textoEstado: 'Crítico (Zona D)',
    };
  }

  if (
    sev === 'naranja' ||
    sev === 'salmon' ||
    sev === 'alerta' ||
    sev === 'c' ||
    sev.includes('zona c')
  ) {
    return {
      colorHex: '#f97316',
      animacion: 'animation: pulsePinSalmon 1.9s infinite ease-out;',
      claseEstado: 'alerta',
      textoEstado: 'Alerta (Zona C)',
    };
  }

  if (sev === 'amarillo' || sev === 'seguimiento' || sev === 'b' || sev.includes('zona b')) {
    return {
      colorHex: '#eab308',
      animacion: 'animation: pulsePinAmarillo 2.8s infinite ease-out;',
      claseEstado: 'seguimiento',
      textoEstado: 'Seguimiento (Zona B)',
    };
  }

  return {
    colorHex: '#00e676',
    animacion: 'box-shadow: 0 0 8px rgba(0, 230, 118, 0.65), 0 3px 10px rgba(0, 0, 0, 0.8);',
    claseEstado: 'normal',
    textoEstado: 'Óptimo (Zona A)',
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
    establecerMapaActivo(null);
  }
};

// ============================================================================
// CARGA DE ACTIVOS DESDE EL BACKEND
// ============================================================================
export const cargarActivosCentral = async (): Promise<void> => {
  try {
    const response = await fetch('/api/cbm/registros?limit=500', {
      headers: AuthService.getHeadersTenant(),
    });

    if (response.ok) {
      const data = await response.json();
      const registros = data.registros || [];
      const mapaEquipos: Record<string, any> = {};

      registros.forEach((r: any) => {
        if (r.resource?.startsWith('activo_catastro:') || r.tipo === 'activo_catastro') {
          const payload = r.payload || {};
          const tag = (payload.tag || r.id).toUpperCase().trim();
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
            spots: payload.spots || {},
          };
        }
      });

      if (Object.keys(mapaEquipos).length > 0) {
        datosGlobalesEquipos = mapaEquipos;
        establecerDatosEquipos(datosGlobalesEquipos);

        const espacioDinamico = document.getElementById('espacio-trabajo-dinamico');
        if (
          espacioDinamico &&
          (!espacioDinamico.innerHTML.includes('mapa-satelital') ||
            espacioDinamico.innerHTML.includes('Cargando Dashboard'))
        ) {
          if (
            !espacioDinamico.innerHTML.includes('seccion-triage-industrial') &&
            !espacioDinamico.innerHTML.includes('expediente-tecnico') &&
            !espacioDinamico.innerHTML.includes('panel-industrial')
          ) {
            renderizarMapaPlanta();
          }
        } else if (mapaActivo) {
          dibujarPinesEnMapa();
        }
      }
    }
  } catch (err) {
    console.warn('[Core] Error cargando inventario de activos:', err);
  }
};

// ============================================================================
// MAPA 3D (CONFIGURADO CON MAXZOOM RASTER 17 PARA EVITAR TESELAS GRISES)
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
                data-accion="mapa:filtrarNivel" data-args='${argsJson([niv])}'
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
            Visualización interactiva CBM. Rotación con <kbd style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">Clic Derecho</kbd>.
          </p>
        </div>

        <nav aria-label="Controles de cota y perspectiva" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="font-size: 0.75rem; color: #94A3B8;">Cota / Nivel:</span>
          ${htmlBotonesNivel}
          <button type="button" 
                  id="btn-toggle-3d" 
                  data-accion="mapa:alternarPerspectiva"
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
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 17, // Escala digitalmente después del zoom 17 evitando el recuadro gris
        },
      },
      layers: [
        {
          id: 'capa-satelital-esri',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    },
    center,
    zoom,
    pitch: esVista3D ? pitch : 0,
    bearing: esVista3D ? bearing : 0,
    maxPitch: 75,
    minZoom: 12,
    maxZoom: 20,
  });

  mapaActivo.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true,
    }),
    'top-right',
  );

  establecerMapaActivo(mapaActivo);

  mapaActivo.once('load', () => {
    mapaActivo.resize();
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
      if (
        filtroModoMapa === 'SEARCH' &&
        !tagEq.includes(filtroValorMapa) &&
        !nombreEq.includes(filtroValorMapa)
      )
        continue;

      const configVisual = resolverConfiguracionVisual(eq.severidad ?? eq.estado);
      const targetId = eq.tag ? eq.tag.toUpperCase().replace(/\s+/g, '_') : idKey;

      const el = document.createElement('div');
      el.className = 'maplibre-pin-node';
      el.style.cssText = `
        width: 18px; 
        height: 18px; 
        background-color: ${configVisual.colorHex}; 
        border-radius: 50%; 
        border: 2px solid #ffffff; 
        box-sizing: border-box; 
        cursor: pointer; 
        ${configVisual.animacion}
      `;

      const popupHTML = `
        <article style="background: rgba(14, 27, 31, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; padding: 14px; color: #ffffff; width: 250px; font-family: system-ui, sans-serif; box-sizing: border-box;">
          
          <!-- CABECERA CON PADDING DERECHO PARA NO CHOCAR CON LA X -->
          <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-right: 26px; gap: 8px;">
            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.68rem; font-weight: 800; padding: 2px 7px; border-radius: 4px; flex-shrink: 0;">
              ${escaparHTML(nivelEquipo)}
            </span>
            <span style="font-size: 0.68rem; color: ${configVisual.colorHex}; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escaparHTML(configVisual.textoEstado)}
            </span>
          </header>

          <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; font-family: monospace; line-height: 1.2;">
            ${escaparHTML(eq.tag ?? '')}
          </h4>
          <p style="margin: 3px 0 10px 0; font-size: 0.74rem; color: #CBD5E1; line-height: 1.3;">
            ${escaparHTML(eq.nombre || 'Activo Crítico')}
          </p>
          
          <button type="button" 
                  data-accion="expediente:abrir" data-args='${argsJson([idKey])}' 
                  style="width: 100%; background: #0284c7; color: white; border: none; padding: 7px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: background 0.2s ease;">
            Abrir Expediente
          </button>
        </article>
      `;

      const popup = new maplibregl.Popup({
        offset: [0, -15],
        closeButton: true,
        maxWidth: '280px',
      }).setHTML(popupHTML);

      const coords: [number, number] = [lng, lat];
      const marcador = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(mapaActivo);

      listaMarcadoresActivos.push(marcador);
      diccionarioMarcadores[idKey] = { marker: marcador, popup, coords, eq };
      diccionarioMarcadores[targetId] = { marker: marcador, popup, coords, eq };
    }
  });
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
const inicializarApp = (): void => {
  if (appInicializada) return;
  appInicializada = true;

  inicializarInterceptorAutenticado();
  inicializarDelegacionComandos();
  injectTenantTheme(LosColoradosTenantConfig.theme);
  SyncManager.inicializar();
  inicializarBarraLateral();
  iniciarEscuchaBadgeGlobal();
  cargarActivosCentral();

  document.addEventListener('click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const btnSalir = target.closest('#btn-salir');
    if (btnSalir) {
      const confirmado = await UI.confirmar('¿Estás seguro de cerrar tu sesión?', 'Cerrar Sesión');
      if (confirmado) {
        await AuthService.logout();
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

    const btnAvisosCbm = target.closest('#btn-avisos-cbm');
    if (btnAvisosCbm) {
      ejecutarComando('avisosCbm:abrir');
      return;
    }

    const btnPMS = target.closest('#btn-modulo-pms');
    if (btnPMS) {
      destruirMapaActivo();
      renderizarModuloPMS('espacio-trabajo-dinamico');
      return;
    }

    const btnVolver =
      target.closest('#btn-volver-dashboard') || target.closest('#btn-cerrar-expediente');
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
  const btnGestionUsuarios = document.getElementById(
    'btn-gestion-usuarios',
  ) as HTMLButtonElement | null;

  if (perfilNombre) perfilNombre.textContent = sesion.nombre;
  if (perfilRol) perfilRol.textContent = sesion.rol;

  if (btnGestionUsuarios) {
    const esAdmin = sesion.rol === 'ADMINISTRADOR';
    btnGestionUsuarios.style.display = esAdmin ? 'flex' : 'none';
    if (esAdmin) {
      btnGestionUsuarios.onclick = () => {
        ejecutarComando('usuarios:abrirModal');
      };
    } else {
      btnGestionUsuarios.onclick = null;
    }
  }
  if (avatarIniciales) {
    avatarIniciales.textContent = obtenerInicialesNombre(sesion.nombre);
  }

  inicializarApp();
};

// Si la sesión no puede renovarse (refresh token expirado/revocado), recargar
// para volver a la pantalla de login.
window.addEventListener('cio:sesion-expirada', () => {
  window.location.reload();
});

document.addEventListener('DOMContentLoaded', () => {
  const sesion = AuthService.getSesion();
  if (sesion) {
    mostrarPlataforma(sesion);
  } else {
    document.getElementById('vista-login')?.classList.remove('oculta');
    document.getElementById('vista-app')?.classList.add('oculta');
  }

  const btnIngresar = document.getElementById('btn-ingresar') as HTMLButtonElement | null;
  const formLogin = document.querySelector('#vista-login form') as HTMLFormElement | null;

  const ejecutarLogin = async (): Promise<void> => {
    const inputEmail = document.getElementById('login-email') as HTMLInputElement | null;
    const inputPass = document.getElementById('login-pass') as HTMLInputElement | null;
    const errorDiv = document.getElementById('login-error');

    const email = inputEmail?.value.trim() ?? '';
    const pass = inputPass?.value ?? '';

    if (errorDiv) errorDiv.textContent = '';

    if (!email || !pass) {
      if (errorDiv) errorDiv.textContent = 'Ingrese usuario y contraseña.';
      return;
    }

    const textoOriginal = btnIngresar?.innerHTML ?? '';
    if (btnIngresar) {
      btnIngresar.disabled = true;
      btnIngresar.innerHTML = '<span>Autenticando...</span>';
    }

    try {
      const nuevaSesion = await AuthService.login(email, pass);
      mostrarPlataforma(nuevaSesion);
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'No se pudo conectar con el servidor.';
      if (errorDiv) errorDiv.textContent = mensaje;
    } finally {
      if (btnIngresar) {
        btnIngresar.disabled = false;
        btnIngresar.innerHTML = textoOriginal;
      }
    }
  };

  formLogin?.addEventListener('submit', (event) => {
    event.preventDefault();
    void ejecutarLogin();
  });

  // Fallback para navegadores/entornos donde el submit del form no dispare.
  btnIngresar?.addEventListener('click', (event) => {
    if (formLogin) return; // el submit del formulario ya lo maneja
    event.preventDefault();
    void ejecutarLogin();
  });
});

// ============================================================================
// REGISTRO DE COMANDOS GLOBALES DE NAVEGACIÓN (antes: window.*)
// ============================================================================
registrarComando('mapa:renderizar', () => {
  renderizarMapaPlanta();
});

registrarComando('mapa:restaurar', () => {
  renderizarMapaPlanta();
});

registrarComando('mapa:destruir', () => {
  destruirMapaActivo();
});

registrarComando('mapa:dibujarPines', () => {
  dibujarPinesEnMapa();
});

registrarComando('expediente:abrir', (_evento, idActivo) => {
  destruirMapaActivo();
  renderizarExpediente(String(idActivo ?? ''), 'espacio-trabajo-dinamico');
});

registrarComando('triage:abrir', () => {
  destruirMapaActivo();
  renderizarModuloTriage('espacio-trabajo-dinamico');
});

registrarComando('vista:renderizarEnEspacio', (_evento, renderCallback) => {
  destruirMapaActivo();
  (renderCallback as (contenedorId: string) => void)('espacio-trabajo-dinamico');
});

registrarComando('mapa:filtrarNivel', (_evento, niv) => {
  nivelFiltroActual = String(niv ?? 'TODOS');
  dibujarPinesEnMapa();
});

registrarComando('mapa:alternarPerspectiva', () => {
  if (!mapaActivo) return;
  esVista3D = !esVista3D;
  mapaActivo.easeTo({ pitch: esVista3D ? 60 : 0, duration: 600 });
});
