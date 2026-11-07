import { SyncManager } from '../../core/offline/syncManager';
import { UI } from '../layout/notificaciones';

declare const window: any;
declare const maplibregl: any;

let marcadorTemporalCaptura: any = null;
let pestañaModalActiva: 'ficha' | 'biblioteca' | 'iso' = 'ficha';

// ============================================================================
// 1. BIBLIOTECA DE PLANTILLAS INDUSTRIALES Y PUNTOS CBM ESTÁNDAR
// ============================================================================
export interface PlantillaEquipo {
  nombreTipo: string;
  grupoIsoDefault: 'GRUPO_1' | 'GRUPO_2';
  soporteIsoDefault: 'RIGIDO' | 'FLEXIBLE';
  componentes: string[];
  spots: Array<{ punto: string; componente: string; direccion: string }>;
}

export const BIBLIOTECA_PLANTILLAS_CBM: Record<string, PlantillaEquipo> = {
  CORREA_TRANSPORTADORA: {
    nombreTipo: 'Correa Transportadora',
    grupoIsoDefault: 'GRUPO_1',
    soporteIsoDefault: 'FLEXIBLE',
    componentes: ['Motor Eléctrico', 'Reductor', 'Polea Motriz', 'Polea de Retorno'],
    spots: [
      { punto: 'M1H', componente: 'Motor NDE', direccion: 'Horizontal' },
      { punto: 'M1A', componente: 'Motor NDE', direccion: 'Axial' },
      { punto: 'M2H', componente: 'Motor DE', direccion: 'Horizontal' },
      { punto: 'M2V', componente: 'Motor DE', direccion: 'Vertical' },
      { punto: 'R1H', componente: 'Reductor Entrada', direccion: 'Horizontal' },
      { punto: 'R2H', componente: 'Reductor Salida', direccion: 'Horizontal' },
      { punto: 'PO1H', componente: 'Polea Motriz Chumacera Mando', direccion: 'Horizontal' },
      { punto: 'PO2H', componente: 'Polea Motriz Chumacera Libre', direccion: 'Horizontal' },
    ],
  },
  BOMBA_CENTRIFUGA: {
    nombreTipo: 'Bomba Centrífuga / Pulpa',
    grupoIsoDefault: 'GRUPO_2',
    soporteIsoDefault: 'RIGIDO',
    componentes: ['Motor Eléctrico', 'Acoplamiento', 'Cuerpo Bomba'],
    spots: [
      { punto: 'M1H', componente: 'Motor NDE', direccion: 'Horizontal' },
      { punto: 'M2H', componente: 'Motor DE', direccion: 'Horizontal' },
      { punto: 'M2A', componente: 'Motor DE', direccion: 'Axial' },
      { punto: 'B1H', componente: 'Bomba DE', direccion: 'Horizontal' },
      { punto: 'B1V', componente: 'Bomba DE', direccion: 'Vertical' },
      { punto: 'B1A', componente: 'Bomba DE', direccion: 'Axial' },
    ],
  },
  CHANCADOR: {
    nombreTipo: 'Chancador Giratorio / Cónico',
    grupoIsoDefault: 'GRUPO_1',
    soporteIsoDefault: 'RIGIDO',
    componentes: ['Motor Principal', 'Contraeje', 'Manto / Hidráulico'],
    spots: [
      { punto: 'M1H', componente: 'Motor NDE', direccion: 'Horizontal' },
      { punto: 'M2H', componente: 'Motor DE', direccion: 'Horizontal' },
      { punto: 'CP1H', componente: 'Contraeje Lado Polea', direccion: 'Horizontal' },
      { punto: 'CP1A', componente: 'Contraeje Lado Polea', direccion: 'Axial' },
      { punto: 'CP2H', componente: 'Contraeje Lado Piñón', direccion: 'Horizontal' },
      { punto: 'HD1V', componente: 'Soporte Hidráulico', direccion: 'Vertical' },
    ],
  },
  HARNERO_VIBRATORIO: {
    nombreTipo: 'Harnero Vibratorio',
    grupoIsoDefault: 'GRUPO_1',
    soporteIsoDefault: 'FLEXIBLE',
    componentes: ['Motor Accionamiento', 'Mecanismo Excéntrico', 'Caja Harnero'],
    spots: [
      { punto: 'M1H', componente: 'Motor Accionamiento', direccion: 'Horizontal' },
      { punto: 'EX1H', componente: 'Eje Excéntrico Mando', direccion: 'Horizontal' },
      { punto: 'EX2H', componente: 'Eje Excéntrico Libre', direccion: 'Horizontal' },
      { punto: 'RES1V', componente: 'Resorte / Apoyo Mando', direccion: 'Vertical' },
      { punto: 'RES2V', componente: 'Resorte / Apoyo Libre', direccion: 'Vertical' },
    ],
  },
  MOLINO_MINERO: {
    nombreTipo: 'Molino de Bolas / SAG',
    grupoIsoDefault: 'GRUPO_1',
    soporteIsoDefault: 'RIGIDO',
    componentes: ['Motor Molino', 'Reductor', 'Piñón Corona', 'Descansos Trunnion'],
    spots: [
      { punto: 'M1H', componente: 'Motor NDE', direccion: 'Horizontal' },
      { punto: 'M2H', componente: 'Motor DE', direccion: 'Horizontal' },
      { punto: 'PIN1H', componente: 'Piñón de Ataque Acople', direccion: 'Horizontal' },
      { punto: 'PIN2H', componente: 'Piñón de Ataque Libre', direccion: 'Horizontal' },
      { punto: 'TRU1V', componente: 'Descanso Trunnion Entrada', direccion: 'Vertical' },
      { punto: 'TRU2V', componente: 'Descanso Trunnion Salida', direccion: 'Vertical' },
    ],
  },
  VENTILADOR_INDUSTRIAL: {
    nombreTipo: 'Ventilador / Extractor Mina',
    grupoIsoDefault: 'GRUPO_2',
    soporteIsoDefault: 'FLEXIBLE',
    componentes: ['Motor Eléctrico', 'Chumacera Eje', 'Rotor'],
    spots: [
      { punto: 'M1H', componente: 'Motor NDE', direccion: 'Horizontal' },
      { punto: 'M2H', componente: 'Motor DE', direccion: 'Horizontal' },
      { punto: 'CH1H', componente: 'Chumacera Lado Acople', direccion: 'Horizontal' },
      { punto: 'CH1A', componente: 'Chumacera Lado Acople', direccion: 'Axial' },
      { punto: 'CH2H', componente: 'Chumacera Lado Rotor', direccion: 'Horizontal' },
    ],
  },
};

// ============================================================================
// 2. MOTOR NORMATIVO ISO 10816-3 / 20816-3 (RMS mm/s)
// ============================================================================
export interface UmbralesIso {
  zonaA: number; // Bueno (Verde)
  zonaB: number; // Aceptable (Amarillo)
  zonaC: number; // Alerta (Naranja)
}

export const UMBRALES_ISO_10816: Record<string, UmbralesIso> = {
  GRUPO_1_RIGIDO: { zonaA: 2.8, zonaB: 4.5, zonaC: 7.1 },
  GRUPO_1_FLEXIBLE: { zonaA: 4.5, zonaB: 7.1, zonaC: 11.0 },
  GRUPO_2_RIGIDO: { zonaA: 1.4, zonaB: 2.8, zonaC: 4.5 },
  GRUPO_2_FLEXIBLE: { zonaA: 2.3, zonaB: 4.5, zonaC: 7.1 },
};

export const evaluarSeveridadIso = (
  rms: number,
  grupo: 'GRUPO_1' | 'GRUPO_2' = 'GRUPO_1',
  soporte: 'RIGIDO' | 'FLEXIBLE' = 'RIGIDO',
): { severidad: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO'; zona: string; color: string } => {
  const clave = `${grupo}_${soporte}`;
  const umbrales = UMBRALES_ISO_10816[clave] || UMBRALES_ISO_10816['GRUPO_1_RIGIDO'];

  if (rms <= 0 || isNaN(rms)) {
    return { severidad: 'VERDE', zona: 'Zona A (Sin vibración)', color: '#00e676' };
  }
  if (rms <= umbrales.zonaA) {
    return { severidad: 'VERDE', zona: `Zona A (<= ${umbrales.zonaA} mm/s)`, color: '#00e676' };
  }
  if (rms <= umbrales.zonaB) {
    return { severidad: 'AMARILLO', zona: `Zona B (<= ${umbrales.zonaB} mm/s)`, color: '#eab308' };
  }
  if (rms <= umbrales.zonaC) {
    return { severidad: 'NARANJA', zona: `Zona C (<= ${umbrales.zonaC} mm/s)`, color: '#f97316' };
  }
  return { severidad: 'ROJO', zona: `Zona D (> ${umbrales.zonaC} mm/s)`, color: '#ef4444' };
};

// Estado en memoria de los puntos mientras el modal está abierto
let spotsTemporalesModal: Record<
  string,
  { punto: string; componente: string; direccion?: string; rms: number; temp: number }
> = {};

import { escaparHTML } from '../../core/utils/sanitizar';

// ============================================================================
// 3. APERTURA Y RENDER DEL MODAL CON PESTAÑAS
// ============================================================================
export const abrirModalGestionEquipo = (equipoExistente: any = null): void => {
  const esEdicion = Boolean(equipoExistente && equipoExistente.tag);
  const tagOriginal = esEdicion ? equipoExistente.tag : '';

  document.getElementById('modal-gestion-equipo')?.remove();
  document.getElementById('banner-captura-gps')?.remove();

  // Clonar los puntos existentes
  spotsTemporalesModal = {};
  if (equipoExistente?.spots) {
    Object.entries(equipoExistente.spots).forEach(([k, sp]: [string, any]) => {
      spotsTemporalesModal[k] = {
        punto: sp.punto || k,
        componente: sp.componente || 'Componente',
        direccion: sp.direccion || 'Horizontal',
        rms: parseFloat(sp.rms) || 0,
        temp: parseFloat(sp.temp) || 0,
      };
    });
  }

  pestañaModalActiva = 'ficha';

  const modal = document.createElement('div');
  modal.id = 'modal-gestion-equipo';
  modal.className = 'modal-overlay';
  modal.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div class="modal-box glass-panel" style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 95%; max-width: 680px; height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
      
      <!-- CABECERA -->
      <header style="background: rgba(14, 27, 31, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
        <div>
          <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">
            ${esEdicion ? `Gestión Técnica del Activo: ${tagOriginal}` : 'Registrar Nuevo Equipo en Catastro'}
          </h3>
          <span style="font-size: 0.7rem; color: #38bdf8;">Configuración CBM, Puntos y Evaluación ISO 10816-3</span>
        </div>
        <button type="button" onclick="window.cerrarModalGestionEquipo()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.4rem; cursor: pointer;">&times;</button>
      </header>

      <!-- BARRA DE PESTAÑAS DEL MODAL -->
      <nav style="display: flex; background: rgba(22, 40, 45, 0.95); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 0 16px; gap: 4px; flex-shrink: 0;">
        <button type="button" id="tab-mod-ficha" onclick="window.cambiarPestañaModal('ficha')" style="padding: 10px 14px; background: transparent; border: none; border-bottom: 2px solid #38bdf8; color: #38bdf8; font-weight: 800; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
          <span class="material-symbols-outlined" style="font-size: 1rem;">settings</span>
          <span>1. Ficha y GPS</span>
        </button>
        <button type="button" id="tab-mod-biblioteca" onclick="window.cambiarPestañaModal('biblioteca')" style="padding: 10px 14px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #94A3B8; font-weight: 700; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
          <span class="material-symbols-outlined" style="font-size: 1rem;">dataset</span>
          <span>2. Biblioteca de Puntos (<span id="count-spots-badge">${Object.keys(spotsTemporalesModal).length}</span>)</span>
        </button>
        <button type="button" id="tab-mod-iso" onclick="window.cambiarPestañaModal('iso')" style="padding: 10px 14px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #94A3B8; font-weight: 700; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
          <span class="material-symbols-outlined" style="font-size: 1rem;">speed</span>
          <span>3. Mediciones Norma ISO</span>
        </button>
      </nav>

      <!-- CUERPO PRINCIPAL DEL FORMULARIO -->
      <form id="form-gestion-equipo" onsubmit="event.preventDefault(); window.guardarEquipoCompletoFormulario('${tagOriginal}', ${esEdicion});" style="flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; color: #E2E8F0; font-size: 0.8rem;">
        
        <!-- PESTAÑA 1: FICHA Y GPS -->
        <div id="seccion-tab-ficha" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700;">TAG del Activo *</label>
              <input type="text" id="eq-tag" value="${tagOriginal}" ${esEdicion ? 'readonly style="opacity: 0.7;"' : ''} required placeholder="Ej: CV-05" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; font-family: monospace; font-weight: 700; text-transform: uppercase;">
            </div>
            <div>
              <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700;">Área Operacional *</label>
              <input type="text" id="eq-area" value="${equipoExistente?.area || 'AREA 52'}" required placeholder="Ej: AREA 52" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box; text-transform: uppercase;">
            </div>
          </div>

          <div>
            <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700;">Nombre / Función del Equipo *</label>
            <input type="text" id="eq-nombre" value="${equipoExistente?.nombre || ''}" required placeholder="Ej: Correa Transportadora Alimentación Molienda" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 10px; border-radius: 6px; box-sizing: border-box;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700;">Cota / Nivel Operacional</label>
              <select id="eq-nivel" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px; border-radius: 6px;">
                <option value="Nivel 1" ${equipoExistente?.nivel === 'Nivel 1' ? 'selected' : ''}>Nivel 1</option>
                <option value="Nivel 2" ${equipoExistente?.nivel === 'Nivel 2' ? 'selected' : ''}>Nivel 2</option>
                <option value="Nivel 3" ${equipoExistente?.nivel === 'Nivel 3' ? 'selected' : ''}>Nivel 3</option>
                <option value="Nivel -1" ${equipoExistente?.nivel === 'Nivel -1' ? 'selected' : ''}>Nivel -1 (Subterráneo)</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.72rem; color: #94A3B8; display: block; margin-bottom: 4px; font-weight: 700;">Criticidad Operacional</label>
              <select id="eq-criticidad" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px; border-radius: 6px;">
                <option value="Alta" ${equipoExistente?.criticidad === 'Alta' ? 'selected' : ''}>Alta (Parada de Planta)</option>
                <option value="Media" ${equipoExistente?.criticidad === 'Media' || !equipoExistente ? 'selected' : ''}>Media (Redundancia Operativa)</option>
                <option value="Baja" ${equipoExistente?.criticidad === 'Baja' ? 'selected' : ''}>Baja (Servicios Auxiliares)</option>
              </select>
            </div>
          </div>

          <!-- GEORREFERENCIACIÓN CON CAPTURA EN GEOVISOR -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 0.72rem; font-weight: 800; color: #38bdf8; text-transform: uppercase;">Coordenadas Geoespaciales</span>
              <button type="button" 
                      id="btn-capturar-mapa"
                      onclick="window.iniciarCapturaDesdeMapa()"
                      style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 5px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 0.95rem;">pin_drop</span>
                <span>Fijar con Clic en Mapa</span>
              </button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 0.7rem; color: #94A3B8; display: block; margin-bottom: 2px;">Latitud</label>
                <input type="number" step="any" id="eq-lat" value="${equipoExistente?.latitud || -28.2908}" required style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 8px; border-radius: 4px; font-family: monospace;">
              </div>
              <div>
                <label style="font-size: 0.7rem; color: #94A3B8; display: block; margin-bottom: 2px;">Longitud</label>
                <input type="number" step="any" id="eq-lng" value="${equipoExistente?.longitud || -70.813}" required style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 8px; border-radius: 4px; font-family: monospace;">
              </div>
            </div>
          </div>
        </div>

        <!-- PESTAÑA 2: BIBLIOTECA DE PLANTILLAS Y PUNTOS DE MEDICIÓN -->
        <div id="seccion-tab-biblioteca" style="display: none; flex-direction: column; gap: 12px;">
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 0.72rem; color: #38bdf8; font-weight: 800; text-transform: uppercase;">
              Biblioteca de Plantillas de Equipos
            </label>
            <div style="display: flex; gap: 8px;">
              <select id="select-plantilla-equipo" style="flex: 1; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px; border-radius: 6px; font-weight: 700;">
                <option value="">-- Seleccionar tipo de activo minero --</option>
                ${Object.entries(BIBLIOTECA_PLANTILLAS_CBM)
                  .map(
                    ([k, p]) => `
                  <option value="${k}">${p.nombreTipo}</option>
                `,
                  )
                  .join('')}
              </select>
              <button type="button" onclick="window.aplicarPlantillaSeleccionada()" style="background: #0284c7; border: none; color: white; padding: 8px 14px; border-radius: 6px; font-weight: 800; cursor: pointer; white-space: nowrap;">
                Cargar Puntos
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 0.75rem; color: #94A3B8; font-weight: 800; text-transform: uppercase;">Listado de Puntos Configurados</span>
            <button type="button" onclick="window.agregarPuntoCustomModal()" style="background: transparent; border: 1px solid #38bdf8; color: #38bdf8; padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; cursor: pointer;">
              + Agregar Punto Libre
            </button>
          </div>

          <div id="tabla-spots-container" style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto;">
            <!-- Generado dinámicamente -->
          </div>
        </div>

        <!-- PESTAÑA 3: CLASIFICACIÓN NORMATIVA ISO 10816-3 Y REGISTRO DE VALORES -->
        <div id="seccion-tab-iso" style="display: none; flex-direction: column; gap: 12px;">
          <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <span style="font-size: 0.72rem; color: #38bdf8; font-weight: 800; text-transform: uppercase;">
              Clasificación ISO 10816-3 / 20816-3
            </span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 0.7rem; color: #94A3B8; display: block; margin-bottom: 2px;">Grupo de Potencia</label>
                <select id="iso-grupo-potencia" onchange="window.recalcularSeveridadesIso()" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 7px; border-radius: 6px;">
                  <option value="GRUPO_1">Grupo 1 (Grandes > 300 kW)</option>
                  <option value="GRUPO_2">Grupo 2 (Medianas 15 kW - 300 kW)</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.7rem; color: #94A3B8; display: block; margin-bottom: 2px;">Tipo de Soporte / Fundación</label>
                <select id="iso-soporte-base" onchange="window.recalcularSeveridadesIso()" style="width: 100%; background: #16282D; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 7px; border-radius: 6px;">
                  <option value="RIGIDO">Base Rígida (Macizo de Hormigón)</option>
                  <option value="FLEXIBLE">Base Flexible (Estructura Metálica / Resortes)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- EVALUACIÓN DINÁMICA POR PUNTO -->
          <span style="font-size: 0.72rem; color: #94A3B8; font-weight: 800; text-transform: uppercase;">
            Ingreso de Mediciones de Vibración Global y Temperatura
          </span>

          <div id="tabla-mediciones-iso-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;">
            <!-- Generado dinámicamente -->
          </div>

          <!-- RESUMEN RESULTANTE DE SEVERIDAD GLOBAL -->
          <div style="background: rgba(14, 27, 31, 0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; color: #94A3B8; font-weight: 700;">Severidad Global Calculada:</span>
            <div id="badge-severidad-global-calculada" style="padding: 4px 12px; border-radius: 6px; font-weight: 800; font-size: 0.75rem; background: rgba(0, 230, 118, 0.2); color: #00e676; border: 1px solid #00e676;">
              VERDE (Zona A)
            </div>
          </div>
        </div>

        <!-- PIE DE ACCIONES -->
        <footer style="margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0;">
          <button type="button" onclick="window.cerrarModalGestionEquipo()" style="background: transparent; color: #94A3B8; border: 1px solid rgba(255,255,255,0.2); padding: 7px 14px; border-radius: 6px; cursor: pointer;">
            Cancelar
          </button>
          <button type="submit" style="background: #0284c7; color: white; border: none; padding: 7px 18px; border-radius: 6px; font-weight: 800; cursor: pointer;">
            ${esEdicion ? 'Actualizar Ficha Técnica' : 'Registrar Equipo con Puntos'}
          </button>
        </footer>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  renderizarTablaSpotsBiblioteca();
  renderizarTablaMedicionesIso();
};

// ============================================================================
// 4. RENDERIZADO DINÁMICO DE PUNTOS Y MEDICIONES
// ============================================================================
export const renderizarTablaSpotsBiblioteca = (): void => {
  const cont = document.getElementById('tabla-spots-container');
  const countBadge = document.getElementById('count-spots-badge');
  if (countBadge) countBadge.textContent = String(Object.keys(spotsTemporalesModal).length);
  if (!cont) return;

  const entries = Object.entries(spotsTemporalesModal);
  if (entries.length === 0) {
    cont.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: #94A3B8; font-size: 0.76rem;">
        No hay puntos de medición asignados. Selecciona una plantilla arriba o pulsa "+ Agregar Punto Libre".
      </div>
    `;
    return;
  }

  cont.innerHTML = entries
    .map(
      ([key, sp]) => `
    <div style="background: rgba(22, 40, 45, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-family: monospace; font-size: 0.85rem; font-weight: 800; color: #38bdf8;">[${escaparHTML(sp.punto)}]</span>
        <div>
          <strong style="color: #ffffff; font-size: 0.78rem;">${escaparHTML(sp.componente)}</strong>
          <span style="font-size: 0.68rem; color: #94A3B8; display: block;">Dirección: ${escaparHTML(sp.direccion || 'Horizontal')}</span>
        </div>
      </div>
      <button type="button" onclick="window.eliminarSpotTemporal('${key}')" style="background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 4px;" title="Eliminar punto">
        <span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span>
      </button>
    </div>
  `,
    )
    .join('');
};

export const renderizarTablaMedicionesIso = (): void => {
  const cont = document.getElementById('tabla-mediciones-iso-container');
  if (!cont) return;

  const selectGrupo = document.getElementById('iso-grupo-potencia') as HTMLSelectElement | null;
  const selectSoporte = document.getElementById('iso-soporte-base') as HTMLSelectElement | null;

  const grupo = (selectGrupo?.value as 'GRUPO_1' | 'GRUPO_2') || 'GRUPO_1';
  const soporte = (selectSoporte?.value as 'RIGIDO' | 'FLEXIBLE') || 'RIGIDO';

  const entries = Object.entries(spotsTemporalesModal);
  if (entries.length === 0) {
    cont.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: #94A3B8; font-size: 0.76rem;">
        No hay puntos registrados aún. Carga una plantilla en la pestaña 2 para ingresar mediciones ISO.
      </div>
    `;
    return;
  }

  let peorSeveridad: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' = 'VERDE';

  cont.innerHTML = entries
    .map(([key, sp]) => {
      const evaluacion = evaluarSeveridadIso(sp.rms, grupo, soporte);

      // Escalar la peor severidad para el activo global
      if (evaluacion.severidad === 'ROJO') peorSeveridad = 'ROJO';
      else if (evaluacion.severidad === 'NARANJA' && peorSeveridad !== 'ROJO')
        peorSeveridad = 'NARANJA';
      else if (evaluacion.severidad === 'AMARILLO' && peorSeveridad === 'VERDE')
        peorSeveridad = 'AMARILLO';

      return `
      <div style="background: rgba(22, 40, 45, 0.7); border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${evaluacion.color}; border-radius: 6px; padding: 8px 12px; display: grid; grid-template-columns: 140px 1fr 140px; align-items: center; gap: 10px;">
        <div>
          <span style="font-family: monospace; font-size: 0.82rem; font-weight: 800; color: #ffffff;">[${escaparHTML(sp.punto)}]</span>
          <div style="font-size: 0.68rem; color: #94A3B8;">${escaparHTML(sp.componente)}</div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div>
            <label style="font-size: 0.65rem; color: #94A3B8; display: block;">Vibración RMS (mm/s)</label>
            <input type="number" step="0.01" min="0" value="${sp.rms || ''}" placeholder="0.00" 
                   oninput="window.actualizarValorSpot('${key}', 'rms', this.value)" 
                   style="width: 90px; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 4px 6px; border-radius: 4px; font-family: monospace; font-weight: 700; font-size: 0.8rem;">
          </div>
          <div>
            <label style="font-size: 0.65rem; color: #94A3B8; display: block;">Temp (°C)</label>
            <input type="number" step="0.1" min="0" value="${sp.temp || ''}" placeholder="25" 
                   oninput="window.actualizarValorSpot('${key}', 'temp', this.value)" 
                   style="width: 70px; background: #0E1B1F; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 4px 6px; border-radius: 4px; font-family: monospace; font-size: 0.8rem;">
          </div>
        </div>

        <div style="text-align: right;">
          <span style="display: inline-block; padding: 3px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; background: ${evaluacion.color}22; color: ${evaluacion.color}; border: 1px solid ${evaluacion.color};">
            ${evaluacion.zona}
          </span>
        </div>
      </div>
    `;
    })
    .join('');

  // Actualizar el badge global
  const badgeGlobal = document.getElementById('badge-severidad-global-calculada');
  if (badgeGlobal) {
    const colores = { VERDE: '#00e676', AMARILLO: '#eab308', NARANJA: '#f97316', ROJO: '#ef4444' };
    const col = colores[peorSeveridad];
    badgeGlobal.style.color = col;
    badgeGlobal.style.borderColor = col;
    badgeGlobal.style.background = `${col}22`;
    badgeGlobal.textContent = `${peorSeveridad} (${peorSeveridad === 'VERDE' ? 'Zona A' : peorSeveridad === 'AMARILLO' ? 'Zona B' : peorSeveridad === 'NARANJA' ? 'Zona C' : 'Zona D'})`;
  }
};

// ============================================================================
// 5. NAVEGACIÓN Y EXPOSICIÓN GLOBAL
// ============================================================================
export const cerrarModalGestionEquipo = (): void => {
  document.getElementById('modal-gestion-equipo')?.remove();
  document.getElementById('banner-captura-gps')?.remove();
  if (marcadorTemporalCaptura) {
    marcadorTemporalCaptura.remove();
    marcadorTemporalCaptura = null;
  }
};

if (typeof window !== 'undefined') {
  window.abrirModalGestionEquipo = abrirModalGestionEquipo;
  window.cerrarModalGestionEquipo = cerrarModalGestionEquipo;

  window.cambiarPestañaModal = (pestaña: 'ficha' | 'biblioteca' | 'iso') => {
    pestañaModalActiva = pestaña;
    const tabFicha = document.getElementById('tab-mod-ficha');
    const tabBib = document.getElementById('tab-mod-biblioteca');
    const tabIso = document.getElementById('tab-mod-iso');

    const secFicha = document.getElementById('seccion-tab-ficha');
    const secBib = document.getElementById('seccion-tab-biblioteca');
    const secIso = document.getElementById('seccion-tab-iso');

    if (tabFicha)
      tabFicha.style.borderBottomColor = pestaña === 'ficha' ? '#38bdf8' : 'transparent';
    if (tabBib)
      tabBib.style.borderBottomColor = pestaña === 'biblioteca' ? '#38bdf8' : 'transparent';
    if (tabIso) tabIso.style.borderBottomColor = pestaña === 'iso' ? '#38bdf8' : 'transparent';

    if (secFicha) secFicha.style.display = pestaña === 'ficha' ? 'flex' : 'none';
    if (secBib) secBib.style.display = pestaña === 'biblioteca' ? 'flex' : 'none';
    if (secIso) secIso.style.display = pestaña === 'iso' ? 'flex' : 'none';

    if (pestaña === 'biblioteca') renderizarTablaSpotsBiblioteca();
    if (pestaña === 'iso') renderizarTablaMedicionesIso();
  };

  window.aplicarPlantillaSeleccionada = () => {
    const sel = document.getElementById('select-plantilla-equipo') as HTMLSelectElement | null;
    const tipo = sel?.value;
    if (!tipo || !BIBLIOTECA_PLANTILLAS_CBM[tipo]) {
      UI.mostrarToast('Por favor selecciona una plantilla válida.', 'info');
      return;
    }

    const plantilla = BIBLIOTECA_PLANTILLAS_CBM[tipo];
    plantilla.spots.forEach((sp) => {
      spotsTemporalesModal[sp.punto] = {
        punto: sp.punto,
        componente: sp.componente,
        direccion: sp.direccion,
        rms: 0,
        temp: 25,
      };
    });

    // Configurar automáticamente los selectores ISO
    const selectGrupo = document.getElementById('iso-grupo-potencia') as HTMLSelectElement | null;
    const selectSoporte = document.getElementById('iso-soporte-base') as HTMLSelectElement | null;
    if (selectGrupo) selectGrupo.value = plantilla.grupoIsoDefault;
    if (selectSoporte) selectSoporte.value = plantilla.soporteIsoDefault;

    renderizarTablaSpotsBiblioteca();
    UI.mostrarToast(
      `Plantilla "${plantilla.nombreTipo}" cargada (${plantilla.spots.length} puntos).`,
      'exito',
    );
  };

  window.agregarPuntoCustomModal = () => {
    const punto = prompt('Identificador del punto (ej: M3V, CH3A, BOMBA_IN):');
    if (!punto) return;
    const componente =
      prompt('Nombre del componente asociado (ej: Rodamiento Lado Libre):') || 'Componente';
    const cleanPunto = punto.toUpperCase().trim();

    spotsTemporalesModal[cleanPunto] = {
      punto: cleanPunto,
      componente: componente.trim(),
      direccion: 'Horizontal',
      rms: 0,
      temp: 25,
    };

    renderizarTablaSpotsBiblioteca();
  };

  window.eliminarSpotTemporal = (key: string) => {
    delete spotsTemporalesModal[key];
    renderizarTablaSpotsBiblioteca();
    renderizarTablaMedicionesIso();
  };

  window.actualizarValorSpot = (key: string, campo: 'rms' | 'temp', valor: string) => {
    if (spotsTemporalesModal[key]) {
      spotsTemporalesModal[key][campo] = parseFloat(valor) || 0;
      // Recalcular el badge global inmediatamente sin perder el foco del input
      const selectGrupo = document.getElementById('iso-grupo-potencia') as HTMLSelectElement | null;
      const selectSoporte = document.getElementById('iso-soporte-base') as HTMLSelectElement | null;
      const grupo = (selectGrupo?.value as 'GRUPO_1' | 'GRUPO_2') || 'GRUPO_1';
      const soporte = (selectSoporte?.value as 'RIGIDO' | 'FLEXIBLE') || 'RIGIDO';

      let peorSeveridad: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' = 'VERDE';
      Object.values(spotsTemporalesModal).forEach((sp) => {
        const ev = evaluarSeveridadIso(sp.rms, grupo, soporte);
        if (ev.severidad === 'ROJO') peorSeveridad = 'ROJO';
        else if (ev.severidad === 'NARANJA' && peorSeveridad !== 'ROJO') peorSeveridad = 'NARANJA';
        else if (ev.severidad === 'AMARILLO' && peorSeveridad === 'VERDE')
          peorSeveridad = 'AMARILLO';
      });

      const badgeGlobal = document.getElementById('badge-severidad-global-calculada');
      if (badgeGlobal) {
        const colores = {
          VERDE: '#00e676',
          AMARILLO: '#eab308',
          NARANJA: '#f97316',
          ROJO: '#ef4444',
        };
        const col = colores[peorSeveridad];
        badgeGlobal.style.color = col;
        badgeGlobal.style.borderColor = col;
        badgeGlobal.style.background = `${col}22`;
        badgeGlobal.textContent = `${peorSeveridad} (${peorSeveridad === 'VERDE' ? 'Zona A' : peorSeveridad === 'AMARILLO' ? 'Zona B' : peorSeveridad === 'NARANJA' ? 'Zona C' : 'Zona D'})`;
      }
    }
  };

  window.recalcularSeveridadesIso = () => {
    renderizarTablaMedicionesIso();
  };

  window.iniciarCapturaDesdeMapa = () => {
    const modal = document.getElementById('modal-gestion-equipo');
    const mapa = window.mapaActivo;
    if (!mapa) {
      UI.mostrarToast('El Geovisor 3D aún no está inicializado.', 'error');
      return;
    }

    if (modal) modal.style.display = 'none';
    mapa.getCanvas().style.cursor = 'crosshair';

    const banner = document.createElement('div');
    banner.id = 'banner-captura-gps';
    banner.style.cssText =
      'position: fixed; top: 70px; left: 50%; transform: translateX(-50%); background: rgba(14, 27, 31, 0.95); border: 1px solid #38bdf8; box-shadow: 0 10px 30px rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 30px; display: flex; align-items: center; gap: 14px; z-index: 100000; color: #ffffff; font-size: 0.85rem; font-weight: 700;';
    banner.innerHTML = `
      <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 1.2rem;">my_location</span>
      <span>Haz clic sobre el mapa para fijar la ubicación GPS del activo</span>
      <button type="button" id="btn-cancelar-captura" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #CBD5E1; padding: 4px 10px; border-radius: 14px; font-size: 0.75rem; cursor: pointer;">Cancelar</button>
    `;
    document.body.appendChild(banner);

    const finalizarCaptura = () => {
      mapa.getCanvas().style.cursor = '';
      banner.remove();
      if (modal) modal.style.display = 'flex';
    };

    document.getElementById('btn-cancelar-captura')?.addEventListener('click', () => {
      mapa.off('click', onClicMapa);
      finalizarCaptura();
    });

    const onClicMapa = (e: any) => {
      const lng = e.lngLat.lng.toFixed(6);
      const lat = e.lngLat.lat.toFixed(6);

      const inputLat = document.getElementById('eq-lat') as HTMLInputElement | null;
      const inputLng = document.getElementById('eq-lng') as HTMLInputElement | null;
      if (inputLat) inputLat.value = lat;
      if (inputLng) inputLng.value = lng;

      if (typeof maplibregl !== 'undefined') {
        if (marcadorTemporalCaptura) marcadorTemporalCaptura.remove();
        const el = document.createElement('div');
        el.style.cssText =
          'width: 18px; height: 18px; background: #38bdf8; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #38bdf8;';
        marcadorTemporalCaptura = new maplibregl.Marker({ element: el })
          .setLngLat([parseFloat(lng), parseFloat(lat)])
          .addTo(mapa);
      }

      finalizarCaptura();
      UI.mostrarToast(`Coordenadas fijadas: ${lat}, ${lng}`, 'exito');
    };

    mapa.once('click', onClicMapa);
  };

  window.guardarEquipoCompletoFormulario = async (tagOriginal: string, esEdicion: boolean) => {
    const tag = ((document.getElementById('eq-tag') as HTMLInputElement)?.value || tagOriginal)
      .trim()
      .toUpperCase();
    const nombre = (document.getElementById('eq-nombre') as HTMLInputElement)?.value.trim();
    const area = (document.getElementById('eq-area') as HTMLInputElement)?.value
      .trim()
      .toUpperCase();
    const nivel = (document.getElementById('eq-nivel') as HTMLSelectElement)?.value;
    const criticidad =
      (document.getElementById('eq-criticidad') as HTMLSelectElement)?.value || 'Media';
    const lat = parseFloat((document.getElementById('eq-lat') as HTMLInputElement)?.value);
    const lng = parseFloat((document.getElementById('eq-lng') as HTMLInputElement)?.value);

    const selectGrupo = document.getElementById('iso-grupo-potencia') as HTMLSelectElement | null;
    const selectSoporte = document.getElementById('iso-soporte-base') as HTMLSelectElement | null;
    const grupoIso = (selectGrupo?.value as 'GRUPO_1' | 'GRUPO_2') || 'GRUPO_1';
    const soporteIso = (selectSoporte?.value as 'RIGIDO' | 'FLEXIBLE') || 'RIGIDO';

    if (!tag || !nombre || isNaN(lat) || isNaN(lng)) {
      UI.mostrarToast('Por favor completa todos los campos requeridos.', 'error');
      return;
    }

    // Calcular la severidad global automática del equipo basada en la peor lectura ISO
    let severidadFinal: 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO' = 'VERDE';
    Object.values(spotsTemporalesModal).forEach((sp) => {
      const ev = evaluarSeveridadIso(sp.rms, grupoIso, soporteIso);
      if (ev.severidad === 'ROJO') severidadFinal = 'ROJO';
      else if (ev.severidad === 'NARANJA' && severidadFinal !== 'ROJO') severidadFinal = 'NARANJA';
      else if (ev.severidad === 'AMARILLO' && severidadFinal === 'VERDE')
        severidadFinal = 'AMARILLO';
    });

    const payloadActivo = {
      tag,
      nombre,
      area,
      nivel,
      severidad: severidadFinal,
      criticidad,
      latitud: lat,
      longitud: lng,
      grupoIso,
      soporteIso,
      spots: spotsTemporalesModal,
    };

    const accion = esEdicion ? 'UPDATE' : 'CREATE';
    await SyncManager.despacharOEncolar(`activo_catastro:${tag}`, accion, payloadActivo);

    if (!window.datosGlobalesEquipos) window.datosGlobalesEquipos = {};
    window.datosGlobalesEquipos[tag] = {
      id: tag,
      ...payloadActivo,
    };

    UI.mostrarToast(
      `Equipo ${tag} guardado con condición ${severidadFinal} (ISO 10816-3).`,
      'exito',
    );
    cerrarModalGestionEquipo();

    if (window.dibujarPinesEnMapa) window.dibujarPinesEnMapa();
    document.dispatchEvent(
      new CustomEvent('datosEquiposActualizados', { detail: window.datosGlobalesEquipos }),
    );
  };
}
