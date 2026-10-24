import { 
  ActivoTerreno, 
  AlertaTerrenoPayload, 
  transmitirAlertaTerreno, 
  guardarCatastroLocal, 
  cargarCatastroLocal,
  actualizarBadgeConexionUI 
} from './terrenoCore';
import { evaluarISO20816 } from '../../core/domain/evaluadorIso';
import { AuthService } from '../../core/auth/authService';
import { TenantConfig } from '../../core/types/tenant.types';

declare const L: any;
declare const Fuse: any;

interface EvidenciaMedia {
  tipo: 'imagen' | 'audio';
  data: string;
}

interface FallaConfig {
  frase: string;
  label: string;
}

const HALLAZGOS_POR_TIPO: Readonly<Record<string, readonly FallaConfig[]>> = Object.freeze({
  motor: [
    { frase: '📢 Ruido anómalo en rodamientos', label: '📢 Ruido rodamiento' },
    { frase: '🔥 Gradiente térmico elevado en carcasa', label: '🔥 Sobrecalentamiento' },
    { frase: '🛢️ Expulsión o degradación de grasa', label: '🛢️ Fuga de grasa' },
    { frase: '⚠️ Alta vibración predominante', label: '⚠️ Alta Vibración' }
  ],
  reductor: [
    { frase: '🛢️ Fuga activa de lubricante por retenes', label: '🛢️ Fuga de aceite' },
    { frase: '⚙️ Golpeteo o ruido cíclico en engranajes', label: '⚙️ Ruido engranajes' },
    { frase: '🔥 Temperatura crítica en descansos', label: '🔥 Temperatura alta' },
    { frase: '📊 Nivel de aceite bajo en visor', label: '📊 Nivel bajo / Sin aceite' }
  ],
  polea: [
    { frase: '⛓️ Desgaste severo o corte de correa', label: '⛓️ Correa dañada' },
    { frase: '📐 Desalineamiento angular o paralelo', label: '📐 Desalineamiento' }
  ],
  general: [
    { frase: '🛢️ Fuga visible de fluido/lubricante', label: '🛢️ Fuga de fluido' },
    { frase: '📢 Ruido mecánico anómalo general', label: '📢 Ruido anómalo' },
    { frase: '⚠️ Vibración mecánica severa', label: '⚠️ Alta Vibración' },
    { frase: '🔥 Temperatura elevada fuera de rango', label: '🔥 Alta Temperatura' }
  ]
});

export class TerrenoUIController {
  private catalogoGlobal: ActivoTerreno[] = [];
  private equipoSeleccionado: ActivoTerreno | null = null;
  private arregloEvidencias: EvidenciaMedia[] = [];
  private chipsSeleccionados: string[] = [];
  private mapaPWA: any = null;
  private capaMarcadores: any = null;
  private marcadorGPS: any = null;
  private fuseInstance: any = null;
  private debounceTimer: number | null = null;
  private timerNotificacion: number | null = null;
  private tenantConfig: TenantConfig;

  constructor(tenantConfig: TenantConfig) {
    this.tenantConfig = tenantConfig;
    this.exponerMetodosGlobales();
  }

  public async inicializar(): Promise<void> {
    this.configurarEventosRed();
    await this.cargarCatastroInicial();
    this.inicializarMapa();
  }

  private exponerMetodosGlobales(): void {
    const w = window as any;
    w.terrenoCtrl = this;
    w.avanzarPaso = (paso: number) => this.avanzarPaso(paso);
    w.filtrarEquiposFuse = (query: string) => this.filtrarEquiposFuse(query);
    w.toggleChip = (el: HTMLElement, frase: string) => this.toggleChip(el, frase);
    w.procesarYComprimirMedia = (e: Event) => this.procesarYComprimirMedia(e);
    w.eliminarEvidenciaPWA = (idx: number) => this.eliminarEvidencia(idx);
    w.iniciarDictado = () => this.iniciarDictado();
    w.selectSevFat = (sev: string) => this.seleccionarSeveridadVisual(sev);
    w.enviarAlertaSegura = () => this.procesarEnvioAlerta();
    w.cambiarVistaPWA = (vista: 'reporte' | 'mapa') => this.cambiarVista(vista);
    w.centrarEnMiUbicacion = () => this.centrarEnMiUbicacion();
    w.buscarEnMapaPWA = (e: KeyboardEvent) => this.buscarEnMapa(e);
    w.reportarDesdeMapa = (tag: string, area: string) => this.reportarDesdeMapa(tag, area);
    w.mostrarNotificacion = (msg: string) => this.mostrarNotificacion(msg);
    w.cargarEquiposPorArea = () => {
      const selectArea = document.getElementById('fieldArea') as HTMLSelectElement | null;
      if (selectArea) this.onAreaCambiada(selectArea.value);
    };
    w.seleccionarEquipoTag = (tag: string) => this.onEquipoCambiado(tag);
    w.actualizarHallazgosPorSpot = (spot: string) => this.actualizarHallazgosPorSpot(spot);
  }

  private configurarEventosRed(): void {
    window.addEventListener('online', () => actualizarBadgeConexionUI(true));
    window.addEventListener('offline', () => actualizarBadgeConexionUI(false));
    actualizarBadgeConexionUI(navigator.onLine);
  }

  private async cargarCatastroInicial(): Promise<void> {
    this.catalogoGlobal = await cargarCatastroLocal();
    if (this.catalogoGlobal.length > 0) {
      this.inicializarBuscadorFuse();
      this.poblarSelectorAreas();
    }
  }

  public actualizarCatastro(nuevosEquipos: ActivoTerreno[]): void {
    this.catalogoGlobal = nuevosEquipos;
    guardarCatastroLocal(nuevosEquipos);
    this.inicializarBuscadorFuse();
    this.poblarSelectorAreas();
    if (this.mapaPWA) {
      this.renderizarMarcadoresMapa();
    }
  }

  private inicializarBuscadorFuse(): void {
    if (typeof Fuse !== 'undefined' && this.catalogoGlobal.length > 0) {
      this.fuseInstance = new Fuse(this.catalogoGlobal, {
        keys: ['tag', 'area', 'id'],
        threshold: 0.35,
        distance: 100
      });
    }
  }

  public poblarSelectorAreas(): void {
    const selectArea = document.getElementById('fieldArea') as HTMLSelectElement | null;
    if (!selectArea) return;

    const areasUnicas = [...new Set(this.catalogoGlobal.map((e) => e.area))].filter(Boolean).sort();
    selectArea.innerHTML = '<option value="">-- Selecciona el Área --</option>' +
      areasUnicas.map((a) => `<option value="${this.escaparHTML(a)}">${this.escaparHTML(a)}</option>`).join('');
  }

  public onAreaCambiada(areaSeleccionada: string): void {
    const selectEquipo = document.getElementById('fieldTagSelect') as HTMLSelectElement | null;
    if (!selectEquipo) return;

    const filtrados = this.catalogoGlobal.filter((e) => e.area === areaSeleccionada);
    selectEquipo.innerHTML = '<option value="">-- Selecciona el equipo --</option>' +
      filtrados
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map((e) => `<option value="${this.escaparHTML(e.tag)}">${this.escaparHTML(e.tag)}</option>`)
        .join('');
  }

  public onEquipoCambiado(tag: string): void {
    this.equipoSeleccionado = this.catalogoGlobal.find((e) => e.tag === tag) ?? null;
    this.poblarPuntosCinematicos(this.equipoSeleccionado?.components ?? []);
  }

  private poblarPuntosCinematicos(componentsList: any[]): void {
    const selSpot = document.getElementById('fieldSpot') as HTMLSelectElement | null;
    if (!selSpot) return;

    let optionsHTML = '<option value="Condición Global del Equipo">🌐 Condición Global (Todo el equipo)</option>';

    if (componentsList.length > 0) {
      optionsHTML += componentsList.map((comp, idx) => {
        const puntoId = typeof comp === 'string' ? comp : (comp.punto || comp.tag || `P${idx + 1}`);
        const nombre = typeof comp === 'string' ? comp : (comp.nombre || comp.componente || puntoId);
        return `<option value="${this.escaparHTML(nombre)}">⚙️ [${this.escaparHTML(puntoId)}] ${this.escaparHTML(nombre)}</option>`;
      }).join('');
    }

    selSpot.innerHTML = optionsHTML;
    this.actualizarHallazgosPorSpot(selSpot.value);
  }

  public actualizarHallazgosPorSpot(spotName: string): void {
    const lower = spotName.toLowerCase();
    let tipo = 'general';
    if (lower.includes('motor')) tipo = 'motor';
    else if (lower.includes('reductor') || lower.includes('transmisi')) tipo = 'reductor';
    else if (lower.includes('polea') || lower.includes('correa')) tipo = 'polea';

    const fallas = HALLAZGOS_POR_TIPO[tipo] ?? HALLAZGOS_POR_TIPO.general;
    const contenedor = document.getElementById('contenedor-chips-dinamicos');

    if (contenedor) {
      this.chipsSeleccionados = [];
      const fieldDetalle = document.getElementById('fieldDetalle') as HTMLTextAreaElement | null;
      if (fieldDetalle) fieldDetalle.value = '';

      contenedor.innerHTML = fallas.map((falla) => `
        <button type="button" 
                class="chip-hallazgo"
                role="button"
                aria-pressed="false"
                data-seleccionado="false"
                data-frase="${this.escaparHTML(falla.frase)}"
                onclick="window.toggleChip(this, '${this.escaparHTML(falla.frase)}')" 
                style="background: rgba(56, 189, 248, 0.1); color: var(--primary-blue, #38bdf8); border: 1px solid rgba(56, 189, 248, 0.3); padding: 8px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
            ${this.escaparHTML(falla.label)}
        </button>
      `).join('');
    }
  }

  public toggleChip(chipEl: HTMLElement, fraseCompleta: string): void {
    const estaActivo = chipEl.getAttribute('data-seleccionado') === 'true';

    if (estaActivo) {
      chipEl.setAttribute('data-seleccionado', 'false');
      chipEl.setAttribute('aria-pressed', 'false');
      chipEl.style.background = 'rgba(56, 189, 248, 0.1)';
      chipEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
      chipEl.style.color = 'var(--primary-blue, #38bdf8)';
      this.chipsSeleccionados = this.chipsSeleccionados.filter((c) => c !== fraseCompleta);
    } else {
      chipEl.setAttribute('data-seleccionado', 'true');
      chipEl.setAttribute('aria-pressed', 'true');
      chipEl.style.background = 'var(--primary-hover, #0284c7)';
      chipEl.style.borderColor = 'var(--primary-blue, #38bdf8)';
      chipEl.style.color = '#ffffff';
      this.chipsSeleccionados.push(fraseCompleta);
    }
  }

  public filtrarEquiposFuse(query: string): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    const busquedaLimpia = query?.trim() ?? '';
    if (busquedaLimpia.length < 2 || !this.fuseInstance) return;

    this.debounceTimer = window.setTimeout(() => {
      const resultados = this.fuseInstance.search(busquedaLimpia).map((res: any) => res.item);
      if (resultados.length > 0) {
        const match: ActivoTerreno = resultados[0];
        const selectArea = document.getElementById('fieldArea') as HTMLSelectElement | null;

        if (selectArea) {
          selectArea.value = match.area;
          this.onAreaCambiada(match.area);

          const selectEquipo = document.getElementById('fieldTagSelect') as HTMLSelectElement | null;
          if (selectEquipo) {
            selectEquipo.value = match.tag;
            this.onEquipoCambiado(match.tag);
            this.mostrarNotificacion(`🎯 Coincidencia: ${match.tag}`);
          }
        }
      }
    }, 200);
  }

  public avanzarPaso(numPaso: number): void {
    document.querySelectorAll<HTMLElement>('.wizard-step').forEach((step) => {
      step.style.display = 'none';
      step.setAttribute('aria-hidden', 'true');
    });

    const siguientePaso = document.getElementById(`step-${numPaso}`);
    if (siguientePaso) {
      siguientePaso.style.display = 'flex';
      siguientePaso.setAttribute('aria-hidden', 'false');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  public iniciarDictado(): void {
    const cajaTexto = document.getElementById('fieldDetalle') as HTMLTextAreaElement | null;
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Este navegador no posee soporte para dictado por voz.');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.lang = 'es-CL';
      rec.onstart = () => this.mostrarNotificacion('🎙️ Escuchando dictado...');
      rec.onresult = (e: any) => {
        if (cajaTexto) {
          cajaTexto.value = `${cajaTexto.value} ${e.results[0][0].transcript}`.trim();
        }
      };
      rec.start();
    } catch {
      alert('Error al acceder al micrófono.');
    }
  }

  public async procesarYComprimirMedia(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (files.length === 0) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const dataUrl = await this.comprimirFoto(file);
          this.arregloEvidencias.push({ tipo: 'imagen', data: dataUrl });
        } catch (err) {
          console.error('[TerrenoUI] Fallo compresión:', err);
        }
      }
    }
    this.renderizarGaleria();
    target.value = '';
  }

  private comprimirFoto(file: File, maxWidth = 800, quality = 0.72): Promise<string> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Canvas Context no disponible'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);

          canvas.width = 0;
          canvas.height = 0;
          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };

      img.src = objectUrl;
    });
  }

  public eliminarEvidencia(index: number): void {
    this.arregloEvidencias.splice(index, 1);
    this.renderizarGaleria();
  }

  private renderizarGaleria(): void {
    const gallery = document.getElementById('mediaGallery');
    if (!gallery) return;

    gallery.innerHTML = this.arregloEvidencias.map((ev, index) => `
      <figure style="position: relative; display: inline-block; margin: 0;">
          <img src="${ev.data}" 
               style="border-radius: 6px; height: 70px; width: 70px; object-fit: cover; border: 1px solid var(--border-glass, rgba(255,255,255,0.15));" 
               alt="Foto ${index + 1}">
          <button type="button" 
                  onclick="window.eliminarEvidenciaPWA(${index})" 
                  style="position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center;">
              ✕
          </button>
      </figure>
    `).join('');
  }

  public seleccionarSeveridadVisual(sev: string): void {
    const inputSev = document.getElementById('fieldSev') as HTMLInputElement | null;
    if (inputSev) inputSev.value = sev;

    ['Verde', 'Amarillo', 'Naranja', 'Rojo'].forEach((s) => {
      const btn = document.getElementById(`sev_${s}`);
      if (btn) {
        const seleccionado = s === sev;
        btn.style.border = seleccionado ? '2px solid #ffffff' : '1px solid var(--border-glass, rgba(255,255,255,0.15))';
        btn.setAttribute('aria-checked', seleccionado ? 'true' : 'false');
      }
    });
  }

  public async procesarEnvioAlerta(rmsInput?: number): Promise<void> {
    const tagSelect = (document.getElementById('fieldTagSelect') as HTMLSelectElement)?.value;
    if (!tagSelect) {
      alert('⚠️ Debe seleccionar un equipo antes de transmitir.');
      this.avanzarPaso(1);
      return;
    }

    const spotFinal = (document.getElementById('fieldSpot') as HTMLSelectElement)?.value ?? 'Condición Global';
    const sevColor = (document.getElementById('fieldSev') as HTMLInputElement)?.value ?? 'Rojo';
    const notasManuales = (document.getElementById('fieldDetalle') as HTMLTextAreaElement)?.value.trim() ?? '';
    const btnTransmitir = document.getElementById('btn-transmitir-final') as HTMLButtonElement | null;

    let textoFinal = `[COMPONENTE: ${spotFinal}]\n`;
    if (this.chipsSeleccionados.length > 0) {
      textoFinal += `📌 Hallazgos: ${this.chipsSeleccionados.join(' | ')}\n`;
    }
    if (notasManuales !== '') {
      textoFinal += `📝 Notas: ${notasManuales}`;
    }

    const evaluacionIso = rmsInput !== undefined ? evaluarISO20816(rmsInput, 'grupo1', 'rigido') : null;
    const zonaIsoFinal = evaluacionIso ? evaluacionIso.zona : (sevColor === 'Rojo' ? 'D' : sevColor === 'Naranja' ? 'C' : 'B');

    const sesion = AuthService.getSesion();
    const inspectorNombre = sesion?.nombre ?? 'Inspector de Terreno';

    const payload: AlertaTerrenoPayload = {
      tenantId: this.tenantConfig.branding.tenantId,
      area: (document.getElementById('fieldArea') as HTMLSelectElement)?.value ?? 'General',
      tag: tagSelect,
      componente: spotFinal,
      severidad: sevColor,
      severidadIso: `Zona ${zonaIsoFinal}`,
      rmsLectura: rmsInput,
      detalle: textoFinal,
      descripcion: textoFinal,
      evidencias: this.arregloEvidencias,
      timestamp: new Date().toISOString(),
      inspector: inspectorNombre,
      estado: 'Pendiente'
    };

    if (btnTransmitir) {
      btnTransmitir.disabled = true;
      btnTransmitir.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> TRANSMITIENDO...`;
    }

    try {
      const res = await transmitirAlertaTerreno(payload);
      const msg = res.modo === 'online' 
        ? '✅ Hallazgo transmitido al servidor central.' 
        : '📴 Guardado en la cola local (Offline). Se sincronizará al recuperar señal.';
      this.mostrarNotificacion(msg);
      this.limpiarFormulario();
      this.avanzarPaso(1);
    } catch (err) {
      console.error('[TerrenoUI] Error en transmisión:', err);
      alert('⚠️ Error al registrar reporte en terreno.');
    } finally {
      if (btnTransmitir) {
        btnTransmitir.disabled = false;
        btnTransmitir.innerHTML = `<span class="material-symbols-outlined">send</span> TRANSMITIR AL CIO`;
      }
    }
  }

  private limpiarFormulario(): void {
    this.arregloEvidencias = [];
    this.chipsSeleccionados = [];
    const fieldDetalle = document.getElementById('fieldDetalle') as HTMLTextAreaElement | null;
    if (fieldDetalle) fieldDetalle.value = '';
    const fieldTagSelect = document.getElementById('fieldTagSelect') as HTMLSelectElement | null;
    if (fieldTagSelect) fieldTagSelect.value = '';
    const inputBuscador = document.getElementById('buscador-fuse-local') as HTMLInputElement | null;
    if (inputBuscador) inputBuscador.value = '';
    this.renderizarGaleria();
    this.poblarPuntosCinematicos([]);
  }

  public cambiarVista(vista: 'reporte' | 'mapa'): void {
    const vistaReporte = document.getElementById('vista-reporte');
    const vistaMapa = document.getElementById('vista-mapa');

    if (vistaReporte) vistaReporte.style.display = vista === 'reporte' ? 'block' : 'none';
    if (vistaMapa) vistaMapa.style.display = vista === 'mapa' ? 'flex' : 'none';

    document.querySelectorAll<HTMLElement>('nav button').forEach((btn) => {
      btn.style.color = 'var(--text-muted, #94a3b8)';
      btn.setAttribute('aria-pressed', 'false');
    });

    const btnNav = document.getElementById(`nav-btn-${vista}`);
    if (btnNav) {
      btnNav.style.color = 'var(--primary-blue, #38bdf8)';
      btnNav.setAttribute('aria-pressed', 'true');
    }

    if (vista === 'mapa') {
      if (!this.mapaPWA) {
        setTimeout(() => this.inicializarMapa(), 200);
      } else {
        setTimeout(() => this.mapaPWA.invalidateSize(), 200);
      }
    }
  }

  private inicializarMapa(): void {
    const divMapa = document.getElementById('mapa-gps-pwa');
    if (!divMapa || typeof L === 'undefined') return;

    if (!this.mapaPWA) {
      const { center, zoom } = this.tenantConfig.geoViewer;
      this.mapaPWA = L.map('mapa-gps-pwa', { preferCanvas: true }).setView([center[1], center[0]], zoom);

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxNativeZoom: 17,
        maxZoom: 21
      }).addTo(this.mapaPWA);

      this.capaMarcadores = L.layerGroup().addTo(this.mapaPWA);
    }

    this.renderizarMarcadoresMapa();
  }

  private renderizarMarcadoresMapa(): void {
    if (!this.mapaPWA || !this.capaMarcadores || !this.catalogoGlobal.length) return;

    this.capaMarcadores.clearLayers();

    this.catalogoGlobal.forEach((equipo) => {
      if (equipo.lat && equipo.lng && !isNaN(equipo.lat) && !isNaN(equipo.lng)) {
        const sev = (equipo.sev ?? 'verde').toLowerCase();
        let colorPin = '#00e676';
        if (sev === 'rojo' || sev === 'critico') colorPin = '#ef4444';
        else if (sev === 'naranja') colorPin = '#f97316';
        else if (sev === 'amarillo') colorPin = '#eab308';

        const iconEquipo = L.divIcon({
          className: 'custom-pin-pwa',
          html: `<div style="background-color: ${colorPin}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(0,0,0,0.8);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const htmlPopup = `
          <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 140px;">
              <strong style="color: #0f172a; font-size: 0.95rem; font-family: monospace;">${this.escaparHTML(equipo.tag)}</strong><br>
              <span style="color: #64748b; font-size: 0.75rem;">Área: ${this.escaparHTML(equipo.area)}</span><br>
              <button type="button" 
                      onclick="window.reportarDesdeMapa('${this.escaparHTML(equipo.tag)}', '${this.escaparHTML(equipo.area)}')" 
                      style="margin-top: 8px; background: var(--primary-hover, #0284c7); color: white; border: none; padding: 6px 10px; border-radius: 6px; width: 100%; cursor: pointer; font-weight: 700; font-size: 0.75rem;">
                  🎯 Reportar en este equipo
              </button>
          </div>
        `;

        const marcador = L.marker([equipo.lat, equipo.lng], { icon: iconEquipo }).bindPopup(htmlPopup);
        this.capaMarcadores.addLayer(marcador);
      }
    });
  }

  public centrarEnMiUbicacion(): void {
    if (!this.mapaPWA) return;

    this.mapaPWA.locate({ setView: true, maxZoom: 17 });
    this.mapaPWA.once('locationfound', (e: any) => {
      if (this.marcadorGPS) {
        this.mapaPWA.removeLayer(this.marcadorGPS);
      }
      const iconoGPS = L.divIcon({
        className: 'gps-pin',
        html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #3b82f6;"></div>`,
        iconSize: [16, 16]
      });
      this.marcadorGPS = L.marker(e.latlng, { icon: iconoGPS }).addTo(this.mapaPWA);
    });
  }

  public reportarDesdeMapa(tag: string, area: string): void {
    this.cambiarVista('reporte');
    this.avanzarPaso(1);

    const selectArea = document.getElementById('fieldArea') as HTMLSelectElement | null;
    if (selectArea) {
      selectArea.value = area;
      this.onAreaCambiada(area);

      setTimeout(() => {
        const selectEquipo = document.getElementById('fieldTagSelect') as HTMLSelectElement | null;
        if (selectEquipo) {
          selectEquipo.value = tag;
          this.onEquipoCambiado(tag);
        }
        this.mostrarNotificacion('📍 Equipo seleccionado desde el mapa.');
      }, 60);
    }
  }

  public buscarEnMapa(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || !this.mapaPWA) return;
    const target = e.target as HTMLInputElement;
    const busqueda = target.value.toLowerCase().trim();
    if (!busqueda) return;

    const equipo = this.catalogoGlobal.find((eq) => eq.tag && eq.tag.toLowerCase().includes(busqueda));
    if (!equipo) {
      alert(`⚠️ No se encontró el equipo "${busqueda}".`);
      return;
    }
    if (!equipo.lat || !equipo.lng) {
      alert(`⚠️ El equipo "${equipo.tag}" no tiene coordenadas GPS.`);
      return;
    }

    this.mapaPWA.flyTo([equipo.lat, equipo.lng], 18, { animate: true, duration: 1.5 });
  }

  public mostrarNotificacion(msg: string): void {
    const t = document.getElementById('toastNotificacion');
    if (!t) return;

    t.textContent = msg;
    t.style.display = 'block';

    if (this.timerNotificacion !== null) clearTimeout(this.timerNotificacion);
    this.timerNotificacion = window.setTimeout(() => {
      t.style.display = 'none';
    }, 3800);
  }

  private escaparHTML(texto = ''): string {
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}