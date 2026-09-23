(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc"
  };

  let db = null;
  let dbUsers = null;
  let dbAlertasTerreno = null;

  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.database().ref('activos_criticos');
      dbUsers = firebase.database().ref('usuarios_registrados');
      dbAlertasTerreno = firebase.database().ref('alertas_terreno');
    }
  } catch (err) {
    console.warn("Firebase fallback:", err);
  }

  const FAENAS = Object.freeze([
    'Planta, Mina los Colorados',
    'Mina, Mina los Colorados',
    'Planta de Pellets',
    'Planta, Mina el Romeral',
    'Mina, Mina el Romeral'
  ]);

  const SEV_PESO = Object.freeze({ Rojo: 5, Naranja: 4, Amarillo: 3, Verde: 2, Plomo: 1 });
  const SEV_COLOR = Object.freeze({ Rojo: '#ef4444', Naranja: '#f97316', Amarillo: '#eab308', Verde: '#22c55e', Plomo: '#6b7280' });

  const state = {
    currentScreen: 1,
    usuarioActivo: null,
    faenaAsignada: null,
    isSuperAdmin: false,
    faenaSeleccionada: null,
    areaSeleccionada: null,
    equipoSeleccionado: null,
    equipoIdModal: null,
    siteMapVisible: false,
    authMode: 'login',
    mapaGlobal: null,
    capaGlobal: null,
    mapaSite: null,
    capaSite: null,
    equipos: [],
    alertasTerreno: []
  };

  function generarSeedLocal() {
    const list = [];
    const areas = ['AREA 52', 'Chancado Primario', 'Molienda SAG', 'Correas Transporte', 'Despacho Fino', 'Stockpile'];
    for (let i = 1; i <= 207; i++) {
      const area = areas[i % areas.length];
      const sevRand = i % 18 === 0 ? 'Rojo' : (i % 7 === 0 ? 'Naranja' : 'Verde');
      list.push({
        id: `mlc_eq_${i}`,
        siteId: 'Planta, Mina los Colorados',
        domain: i % 2 === 0 ? 'planta' : 'mina',
        area: area,
        tag: `MH${2700 + i}`,
        tipo: i % 3 === 0 ? 'Reductor' : 'Motor/Correa',
        lat: (-28.2876 + (Math.random() * 0.018 - 0.009)).toFixed(5),
        lng: (-70.8130 + (Math.random() * 0.018 - 0.009)).toFixed(5),
        componentes: [{ nombre: 'Spot Principal', severidad: sevRand, rms: (2.0 + Math.random() * 3).toFixed(1), om: i % 12 === 0 ? `OM-${4000 + i}` : '' }]
      });
    }
    return list;
  }

  state.equipos = generarSeedLocal();

  const sanitize = (str) => (str || '').replace(/[<>&"']/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m]));
  const normalizarFaena = (f) => FAENAS.includes(f) ? f : FAENAS[0];

  function calcMaxSev(comps) {
    if (!comps || !comps.length) return 'Plomo';
    let max = 1;
    let maxSev = 'Plomo';
    comps.forEach((c) => {
      if (c && SEV_PESO[c.severidad] > max) {
        max = SEV_PESO[c.severidad];
        maxSev = c.severidad;
      }
    });
    return maxSev;
  }

  function renderScreen1() {
    const container = document.getElementById('viewScreen1Content');
    if (!container) return;

    const stats = {};
    FAENAS.forEach((f) => { stats[f] = { count: 0, critical: 0, maxSev: 'Plomo', maxPeso: 1 }; });

    state.equipos.forEach((eq) => {
      const f = normalizarFaena(eq.siteId);
      stats[f].count++;
      const s = calcMaxSev(eq.componentes);
      if (s === 'Rojo' || s === 'Naranja') stats[f].critical++;
      if (SEV_PESO[s] > stats[f].maxPeso) {
        stats[f].maxPeso = SEV_PESO[s];
        stats[f].maxSev = s;
      }
    });

    const sortedFaenas = FAENAS.map((f) => ({ name: f, ...stats[f] }))
      .sort((a, b) => b.maxPeso - a.maxPeso || b.critical - a.critical);

    container.innerHTML = sortedFaenas.map((d) => {
      const anim = (d.maxSev === 'Rojo' || d.maxSev === 'Naranja') ? `anim-${d.maxSev.toLowerCase()}` : '';
      return `
        <article class="card-area ${anim}" onclick="window.CIO.seleccionarFaena('${sanitize(d.name)}')">
          <header>
            <span class="label-muted">Faena Operativa CMP</span>
            <h3 class="value-strong" style="margin:4px 0 8px 0;">${sanitize(d.name)}</h3>
          </header>
          <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-card); padding-top:8px;">
            <div><span class="label-muted">Activos</span><div class="value-strong">${d.count}</div></div>
            <div><span class="label-muted">Condición</span><div class="value-strong" style="color:${SEV_COLOR[d.maxSev]}">${d.critical > 0 ? d.critical + ' Alertas' : 'Normal'}</div></div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderScreen2() {
    const target = state.faenaSeleccionada || state.faenaAsignada || FAENAS[0];
    document.getElementById('screen2SiteTitle').innerText = target;
    const container = document.getElementById('viewScreen2Container');
    if (!container) return;
    container.style.display = state.siteMapVisible ? 'none' : '';

    const eqsFaena = state.equipos.filter((e) => normalizarFaena(e.siteId) === target);

    if (!state.areaSeleccionada) {
      const areas = {};
      eqsFaena.forEach((eq) => {
        const a = eq.area || 'Sin Área';
        if (!areas[a]) areas[a] = { count: 0, critical: 0, maxSev: 'Plomo', maxPeso: 1 };
        areas[a].count++;
        const s = calcMaxSev(eq.componentes);
        if (s === 'Rojo' || s === 'Naranja') areas[a].critical++;
        if (SEV_PESO[s] > areas[a].maxPeso) {
          areas[a].maxPeso = SEV_PESO[s];
          areas[a].maxSev = s;
        }
      });

      const sortedAreas = Object.keys(areas).map((a) => ({ name: a, ...areas[a] }))
        .sort((a, b) => b.maxPeso - a.maxPeso || b.critical - a.critical);

      container.className = 'grid-container';
      container.innerHTML = sortedAreas.map((a) => {
        const anim = (a.maxSev === 'Rojo' || a.maxSev === 'Naranja') ? `anim-${a.maxSev.toLowerCase()}` : '';
        return `
          <article class="card-area ${anim}" onclick="window.CIO.seleccionarArea('${sanitize(a.name)}')">
            <span class="label-muted">Área Operacional</span>
            <h3 class="value-strong" style="margin:4px 0 8px 0;">${sanitize(a.name)}</h3>
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-card); padding-top:8px;">
              <div><span class="label-muted">Activos</span><div class="value-strong">${a.count}</div></div>
              <div><span class="label-muted">Condición</span><div class="value-strong" style="color:${SEV_COLOR[a.maxSev]}">${a.critical > 0 ? a.critical + ' Alertas' : 'Normal'}</div></div>
            </div>
          </article>
        `;
      }).join('') || '<div class="label-muted">Sin áreas registradas.</div>';
    } else {
      container.className = 'grid-equipos';
      const eqsArea = eqsFaena.filter((e) => (e.area || 'Sin Área') === state.areaSeleccionada);
      eqsArea.sort((a, b) => SEV_PESO[calcMaxSev(b.componentes)] - SEV_PESO[calcMaxSev(a.componentes)]);

      const navHeader = `
        <div style="grid-column: 1/-1; display:flex; align-items:center; gap:10px; margin-bottom:4px; background:var(--glass-card); backdrop-filter:blur(8px); padding:8px 12px; border-radius:8px; border:1px solid var(--glass-border);">
          <button class="btn-base" type="button" onclick="window.CIO.volverAreas()">⬅️ Volver a Áreas</button>
          <span style="font-weight:700; color:var(--accent-color); font-size:0.85rem;">Área: ${sanitize(state.areaSeleccionada)}</span>
        </div>
      `;

      container.innerHTML = navHeader + eqsArea.map((eq) => {
        const s = calcMaxSev(eq.componentes);
        const anim = (s === 'Rojo' || s === 'Naranja') ? `anim-${s.toLowerCase()}` : '';
        const tagValue = eq.tag || eq.Tag || eq.TAG || eq.equipo || eq.id || 'S/T';
        const fieldCount = state.alertasTerreno.filter((a) => (a.tag || '').trim().toUpperCase() === tagValue.trim().toUpperCase()).length;
        const badge = fieldCount > 0 ? `<span class="badge-field-floating">💬 Terreno (${fieldCount})</span>` : '';

        return `
          <article class="card-equipo sev-${s.toLowerCase()} ${anim}" onclick="window.CIO.abrirDetalle('${eq.id}')">
            ${badge}
            <span class="eq-type">${sanitize(eq.area)}</span>
            <div class="eq-tag code-font">${sanitize(tagValue)}</div>
            <span class="eq-type" style="color:${SEV_COLOR[s]}">${s.toUpperCase()}</span>
          </article>
        `;
      }).join('');
    }
  }

  function renderScreen3() {
    const filter = document.getElementById('superAdminFilterSite')?.value || 'TODAS';
    const eqs = filter === 'TODAS' ? state.equipos : state.equipos.filter((e) => normalizarFaena(e.siteId) === filter);
    eqs.sort((a, b) => SEV_PESO[calcMaxSev(b.componentes)] - SEV_PESO[calcMaxSev(a.componentes)]);

    const container = document.getElementById('viewScreen3Global');
    if (!container) return;

    container.innerHTML = eqs.map((eq) => {
      const s = calcMaxSev(eq.componentes);
      const anim = (s === 'Rojo' || s === 'Naranja') ? `anim-${s.toLowerCase()}` : '';
      const tagValue = eq.tag || eq.Tag || eq.TAG || eq.id || 'S/T';
      return `
        <article class="card-equipo sev-${s.toLowerCase()} ${anim}">
          <span class="label-muted">${sanitize(eq.siteId)}</span>
          <div class="eq-tag code-font">${sanitize(tagValue)}</div>
          <div style="margin-top:6px;">
            <button class="btn-base btn-primary" type="button" style="padding:2px 8px; font-size:0.65rem;" onclick="window.CIO.abrirEdicion('${eq.id}')">✏️ Editar</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function actualizarMapaSite(eqs) {
    if (typeof L === 'undefined') return;
    const mapBox = document.getElementById('view-site-map');
    if (!mapBox) return;

    if (!state.mapaSite) {
      state.mapaSite = L.map('view-site-map').setView([-28.2876, -70.8130], 13);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(state.mapaSite);
      state.capaSite = L.layerGroup().addTo(state.mapaSite);
    } else {
      state.mapaSite.invalidateSize();
    }

    state.capaSite.clearLayers();
    const bounds = [];

    eqs.forEach((eq) => {
      const lat = parseFloat(eq.lat);
      const lng = parseFloat(eq.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        const s = calcMaxSev(eq.componentes);
        const col = SEV_COLOR[s] || '#6b7280';
        const pulse = s === 'Rojo' ? 'map-pin-pulse' : '';
        const tagValue = eq.tag || eq.Tag || eq.id || 'S/T';
        const icon = L.divIcon({
          className: 'custom-pin',
          html: `<div class="${pulse}" style="background:${col}; width:20px; height:20px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px ${col};"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        L.marker([lat, lng], { icon }).bindPopup(`<strong>${sanitize(tagValue)}</strong><br>${sanitize(eq.area)}<br><span style="color:${col};font-weight:bold;">${s}</span>`).addTo(state.capaSite);
        bounds.push([lat, lng]);
      }
    });

    if (bounds.length) state.mapaSite.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  }

  // Recepción en Tiempo Real desde Firebase
  if (db) {
    db.on('value', (snap) => {
      const raw = snap.val();
      if (raw) {
        state.equipos = Object.keys(raw).map((k) => {
          const item = raw[k] || {};
          const detectedTag = item.tag || item.Tag || item.TAG || item.equipo || item.Equipo || item.nombre || k;
          const detectedArea = item.area || item.Area || item.AREA || 'Sin Área';
          const detectedSite = item.siteId || item.site || item.faena || item.Faena || 'Planta, Mina los Colorados';

          return {
            id: k,
            ...item,
            siteId: normalizarFaena(detectedSite),
            area: detectedArea,
            tag: detectedTag,
            tipo: item.tipo || item.Tipo || 'Activo',
            componentes: item.componentes || item.spots || []
          };
        });
      }
      refresh();
    });

    if (dbAlertasTerreno) {
      let inicializacionCompletada = false;
      dbAlertasTerreno.once('value', (snap) => {
        const raw = snap.val();
        state.alertasTerreno = raw ? Object.keys(raw).map((k) => ({ id: k, ...(raw[k] || {}) })) : [];
        inicializacionCompletada = true;
        refresh();
      });

      dbAlertasTerreno.limitToLast(1).on('child_added', (snap) => {
        if (!inicializacionCompletada) return;
        const data = snap.val();
        if (!data) return;

        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch(e) {}

        const toast = document.createElement('aside');
        toast.className = 'toast-terreno-alert';
        toast.innerHTML = `
          <div class="toast-terreno-header">
            <span>🚨 NUEVO REPORTE EN TERRENO</span>
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background:transparent; border:none; color:#fff; font-size:1.2rem; cursor:pointer;">&times;</button>
          </div>
          <div class="toast-terreno-body">
            <strong>Faena:</strong> ${sanitize(data.faena || 'General')} (${sanitize(data.area || '')})<br>
            <strong>Equipo:</strong> <span class="code-font" style="color:#60a5fa;">${sanitize(data.tag || '')}</span> | <strong>Sev:</strong> <span style="color:#ef4444; font-weight:bold;">${sanitize(data.severidad || 'Alerta')}</span><br>
            <strong>Hallazgo:</strong> ${sanitize(data.detalle || '')}
          </div>
          <button type="button" class="btn-base btn-primary" style="padding:8px 12px; font-size:0.75rem; justify-content:center;" onclick="window.CIO.abrirDetallePorTag('${sanitize(data.tag)}'); this.parentElement.remove();">
            🔍 Ver Activo y Foto
          </button>
        `;
        document.body.appendChild(toast);

        setTimeout(() => { toast.remove(); }, 12000);
      });
    }
  }

  function refresh() {
    if (state.currentScreen === 1) renderScreen1();
    else if (state.currentScreen === 2) renderScreen2();
    else if (state.currentScreen === 3) renderScreen3();
  }

  window.CIO = {
    goScreen: (num) => {
      state.currentScreen = num;
      document.querySelectorAll('.screen-view').forEach((el) => el.classList.remove('active'));
      document.getElementById(`screen-${num}`)?.classList.add('active');
      const titles = { 1: 'Vista Pública (Global)', 2: `Faena: ${state.faenaSeleccionada || 'Operativa'}`, 3: 'Consola SuperAdmin' };
      document.getElementById('headerScreenTitle').innerText = titles[num] || 'CIO';
      if (num !== 2) state.siteMapVisible = false;
      refresh();
    },

    seleccionarFaena: (f) => {
      state.faenaSeleccionada = f;
      state.areaSeleccionada = null;
      state.siteMapVisible = false;
      document.getElementById('badgeFaenaAsignada').innerText = f;
      window.CIO.goScreen(2);
    },

    seleccionarArea: (a) => {
      state.areaSeleccionada = a;
      renderScreen2();
    },

    volverAreas: () => {
      state.areaSeleccionada = null;
      renderScreen2();
    },

    stepBackScreen2: () => {
      if (state.siteMapVisible) {
        window.CIO.toggleSiteMapTab();
        return;
      }
      if (state.areaSeleccionada) {
        window.CIO.volverAreas();
        return;
      }
      window.CIO.goScreen(1);
    },

    toggleSiteMapTab: () => {
      state.siteMapVisible = !state.siteMapVisible;
      const mapBox = document.getElementById('view-site-map');
      const container = document.getElementById('viewScreen2Container');
      const lbl = document.getElementById('labelToggleSiteMap');
      const target = state.faenaSeleccionada || FAENAS[0];

      if (state.siteMapVisible) {
        mapBox.style.display = 'block';
        container.style.display = 'none';
        lbl.innerText = 'Ver Tarjetas';
        setTimeout(() => actualizarMapaSite(state.equipos.filter((e) => normalizarFaena(e.siteId) === target)), 150);
      } else {
        mapBox.style.display = 'none';
        container.style.display = '';
        lbl.innerText = 'Ver Mapa de Faena';
      }
    },

    abrirDetalle: (id) => {
      state.equipoIdModal = id;
      const eq = state.equipos.find((e) => e.id === id);
      if (!eq) return;

      const tagValue = eq.tag || eq.Tag || eq.id || 'S/T';
      document.getElementById('detSiteTag').innerText = `${eq.siteId} | TAG: ${tagValue}`;
      document.getElementById('detTitle').innerText = `${eq.tipo || 'Activo'} - ${eq.area}`;

      const list = document.getElementById('detComponentesList');
      const comps = [...(eq.componentes || [])].sort((a, b) => SEV_PESO[b.severidad || 'Plomo'] - SEV_PESO[a.severidad || 'Plomo']);
      list.innerHTML = comps.map((c) => `
        <div style="background:var(--input-bg); padding:12px 16px; border-radius:8px; border:1px solid var(--glass-border); ${c.severidad === 'Rojo' ? 'border-left:4px solid #ef4444;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:0.95rem;">${sanitize(c.nombre || c.spot)}</strong>
            <span style="color:${SEV_COLOR[c.severidad]}; font-weight:800; text-transform:uppercase;">${c.severidad}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">RMS: <strong>${c.rms || 'N/D'}</strong> | Orden de Trabajo: <strong>${c.om || 'S/N'}</strong></div>
        </div>
      `).join('') || '<div class="label-muted" style="padding:14px;">Sin spots oficiales registrados.</div>';

      const terList = document.getElementById('detTerrenoList');
      const myReports = state.alertasTerreno.filter((a) => (a.tag || '').trim().toUpperCase() === tagValue.trim().toUpperCase());
      
      terList.innerHTML = myReports.length > 0 ? myReports.map((r) => `
        <article class="card-reporte-terreno-lg">
          <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.75rem;">
            <span>🕒 <strong>${r.timestamp ? new Date(r.timestamp).toLocaleString() : 'N/D'}</strong></span>
            <span style="color:${SEV_COLOR[r.severidad]}; font-weight:bold; font-size:0.85rem;">${r.severidad}</span>
          </div>
          <div style="font-size:0.9rem; color:#fff; line-height:1.4;">${sanitize(r.detalle)}</div>
          
          ${r.fotoBase64 ? `
            <div style="margin-top:8px;">
              <img src="${r.fotoBase64}" class="img-terreno-preview-lg" alt="Evidencia de terreno" onclick="window.CIO.abrirFotoEnNuevaPestana('${r.fotoBase64}')" title="Clic para ver en pestaña completa" />
              <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                <button type="button" class="btn-base" style="font-size:0.68rem; padding:4px 8px;" onclick="window.CIO.abrirFotoEnNuevaPestana('${r.fotoBase64}')">🔍 Abrir foto en pestaña nueva</button>
              </div>
            </div>
          ` : ''}
        </article>
      `).join('') : '<div class="label-muted" style="padding:14px; font-style:italic;">No hay reportes de ronda para este activo.</div>';

      document.getElementById('modalDetalleActivo').showModal();
    },

    abrirDetallePorTag: (tag) => {
      const eq = state.equipos.find((e) => (e.tag || '').trim().toUpperCase() === tag.trim().toUpperCase());
      if (eq) {
        window.CIO.abrirDetalle(eq.id);
      }
    },

    abrirFotoEnNuevaPestana: (base64Data) => {
      const win = window.open("");
      win.document.write(`<body style="margin:0; background:#0a0a0c; display:flex; justify-content:center; align-items:center; height:100vh;"><img src="${base64Data}" style="max-width:98%; max-height:98%; object-fit:contain; border-radius:6px; box-shadow:0 0 30px rgba(0,0,0,0.8);" /></body>`);
    },

    cerrarModalDetalle: () => document.getElementById('modalDetalleActivo').close(),
    toggleTheme: () => document.body.classList.toggle('light-mode'),

    handleUserBtnClick: () => {
      if (!state.usuarioActivo) {
        document.getElementById('modalAuth').showModal();
      } else {
        document.getElementById('userDropdownMenu').classList.toggle('is-active');
      }
    },

    setAuthMode: (mode) => {
      state.authMode = mode;
      const isReg = mode === 'register';
      
      document.getElementById('boxFullName').classList.toggle('is-hidden', !isReg);
      document.getElementById('boxFaenaSite').classList.toggle('is-hidden', !isReg);

      const tabLogin = document.getElementById('tabBtnLogin');
      const tabRegister = document.getElementById('tabBtnRegister');
      const title = document.getElementById('authModalHeaderTitle');
      const desc = document.getElementById('authModalHeaderDesc');
      const btn = document.getElementById('authSubmitActionBtn');

      if (tabLogin) tabLogin.classList.toggle('is-active', !isReg);
      if (tabRegister) tabRegister.classList.toggle('is-active', isReg);

      if (isReg) {
        title.innerText = 'Crear Cuenta de Operador';
        desc.innerText = 'Regístrate y selecciona tu faena base para habilitar la edición de condición.';
        btn.innerText = 'Registrarse y Entrar';
      } else {
        title.innerText = 'Acceso Operador CIO';
        desc.innerText = 'Ingresa tus credenciales autorizadas por CMP para gestionar condición de activos.';
        btn.innerText = 'Ingresar al Sistema';
      }
    },

    handleAuthSubmission: () => {
      const u = document.getElementById('authUsername').value.trim();
      const p = document.getElementById('authPassword').value.trim();
      const fullname = document.getElementById('authFullname')?.value.trim();
      const selectedSite = document.getElementById('authSelectedSite')?.value;

      if (!u || !p) {
        alert("⚠️ Completa usuario y contraseña.");
        return;
      }

      const lookupId = u.replace(/[^a-zA-Z0-9]/g, '_');

      if (state.authMode === 'register') {
        if (!fullname) {
          alert("⚠️ Ingresa tu nombre y apellido.");
          return;
        }
        if (dbUsers) {
          dbUsers.child(lookupId).set({
            nombreCompleto: fullname,
            usuario: u,
            password: p,
            faenaAsignada: selectedSite,
            creadoEn: new Date().toISOString()
          }).then(() => {
            alert("✅ Cuenta de operador registrada correctamente.");
            loginLocal(fullname, selectedSite);
          }).catch(err => alert("Error: " + err.message));
        } else {
          loginLocal(fullname, selectedSite);
        }
      } else {
        if (dbUsers) {
          dbUsers.child(lookupId).once('value', snap => {
            const uData = snap.val();
            if (uData && uData.password === p) {
              loginLocal(uData.nombreCompleto || uData.usuario, uData.faenaAsignada || 'Planta, Mina los Colorados');
            } else {
              loginLocal(u.split('@')[0], selectedSite || 'Planta, Mina los Colorados');
            }
          });
        } else {
          loginLocal(u.split('@')[0], selectedSite || 'Planta, Mina los Colorados');
        }
      }

      function loginLocal(nombre, faena) {
        state.usuarioActivo = nombre;
        state.faenaAsignada = faena;
        document.body.classList.add('user-authenticated');
        document.getElementById('labelUsuarioBtn').innerText = nombre.split(' ')[0];
        document.getElementById('dropUserInfo').innerText = `Activo: ${nombre} | Faena: ${faena}`;
        document.getElementById('modalAuth').close();
        alert(`✅ Sesión iniciada: ${nombre} (${faena})`);
      }
    },

    cerrarSesionUsuario: () => {
      state.usuarioActivo = null;
      state.faenaAsignada = null;
      document.body.classList.remove('user-authenticated');
      document.getElementById('labelUsuarioBtn').innerText = 'Entrar';
      document.getElementById('dropUserInfo').innerText = 'Invitado (Solo Lectura)';
      document.getElementById('userDropdownMenu').classList.remove('is-active');
      window.CIO.goScreen(1);
    },

    solicitarPermisoSuperAdmin: () => {
      const p = prompt("🔑 Clave SuperAdmin:");
      if (p === "Moncon2026") {
        state.isSuperAdmin = true;
        window.CIO.goScreen(3);
      } else if (p !== null) {
        alert("❌ Clave incorrecta.");
      }
    },

    renderScreen3Global: () => renderScreen3(),

    exportarReporteGerenciaAlta: () => {
      const txt = `REPORTE ALTA GERENCIA CIO - CMP\nTotal: ${state.equipos.length}\nFecha: ${new Date().toISOString()}`;
      const blob = new Blob([txt], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Reporte_Global_${Date.now()}.txt`;
      a.click();
    },

    exportarReporteGerenciaPorFaena: () => {
      const target = document.getElementById('superAdminFilterSite')?.value || FAENAS[0];
      const count = state.equipos.filter((e) => normalizarFaena(e.siteId) === target).length;
      const txt = `REPORTE FAENA [${target}]\nTotal Activos: ${count}\nFecha: ${new Date().toISOString()}`;
      const blob = new Blob([txt], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Reporte_${target.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      a.click();
    },

    abrirEdicionEquipoNuevoAuth: () => {
      state.equipoSeleccionado = { id: 'EQ_' + Date.now(), siteId: state.faenaSeleccionada || FAENAS[0], domain: 'planta', area: state.areaSeleccionada || 'Área General', componentes: [] };
      window.CIO.abrirEdicionModalObj();
    },

    abrirEdicionGlobalNuevo: () => {
      state.equipoSeleccionado = { id: 'EQ_' + Date.now(), siteId: FAENAS[0], domain: 'planta', componentes: [] };
      window.CIO.abrirEdicionModalObj();
    },

    abrirEdicion: (id) => {
      state.equipoSeleccionado = state.equipos.find((e) => e.id === id);
      if (state.equipoSeleccionado) window.CIO.abrirEdicionModalObj();
    },

    abrirEdicionModalObj: () => {
      const eq = state.equipoSeleccionado;
      document.getElementById('edSiteId').value = eq.siteId;
      document.getElementById('edDomain').value = eq.domain || 'planta';
      document.getElementById('edArea').value = eq.area || '';
      document.getElementById('edTag').value = eq.tag || eq.Tag || eq.id || '';
      document.getElementById('edTipo').value = eq.tipo || '';
      document.getElementById('edFecha').value = eq.fecha || '';
      document.getElementById('edLat').value = eq.lat || '';
      document.getElementById('edLng').value = eq.lng || '';
      const cont = document.getElementById('edComponentesContainer');
      cont.innerHTML = '';
      (eq.componentes || []).forEach((c) => window.CIO.agregarFormComponente(c));
      document.getElementById('modalEdicion').showModal();
    },

    agregarFormComponente: (data = {}) => {
      const cont = document.getElementById('edComponentesContainer');
      const div = document.createElement('div');
      div.style.cssText = "background:var(--input-bg); padding:10px; border:1px solid var(--border-card); border-radius:6px; position:relative;";
      div.className = 'comp-item';
      div.innerHTML = `
        <button type="button" class="btn-base btn-danger" style="position:absolute; top:8px; right:8px; padding:2px 6px; font-size:0.6rem;" onclick="this.parentElement.remove()">Eliminar</button>
        <div class="form-grid">
          <div><label>Spot</label><input type="text" class="c-nom" value="${data.nombre || ''}"></div>
          <div><label>RMS</label><input type="text" class="c-rms" value="${data.rms || ''}"></div>
          <div class="span-2"><label>Severidad</label><select class="c-sev"><option value="Rojo" ${data.severidad==='Rojo'?'selected':''}>Rojo</option><option value="Naranja" ${data.severidad==='Naranja'?'selected':''}>Naranja</option><option value="Verde" ${data.severidad==='Verde'?'selected':''}>Verde</option></select></div>
        </div>
      `;
      cont.appendChild(div);
    },

    guardarEquipo: () => {
      if (!state.equipoSeleccionado) return;
      const comps = [];
      document.querySelectorAll('.comp-item').forEach((el) => {
        comps.push({
          nombre: el.querySelector('.c-nom')?.value || '',
          rms: el.querySelector('.c-rms')?.value || '',
          severidad: el.querySelector('.c-sev')?.value || 'Verde'
        });
      });
      const payload = {
        siteId: document.getElementById('edSiteId').value,
        domain: document.getElementById('edDomain').value,
        area: document.getElementById('edArea').value,
        tag: document.getElementById('edTag').value,
        tipo: document.getElementById('edTipo').value,
        lat: document.getElementById('edLat').value,
        lng: document.getElementById('edLng').value,
        componentes: comps
      };
      if (db) db.child(state.equipoSeleccionado.id).update(payload);
      document.getElementById('modalEdicion').close();
    },

    eliminarEquipo: () => {
      if (confirm('¿Eliminar activo?') && db && state.equipoSeleccionado) {
        db.child(state.equipoSeleccionado.id).remove();
        document.getElementById('modalEdicion').close();
      }
    },

    editarActivoActualDesdeDetalle: () => {
      if (!state.equipoIdModal) return;
      document.getElementById('modalDetalleActivo').close();
      window.CIO.abrirEdicion(state.equipoIdModal);
    },

    procesarCargaExcelFaena: (e) => {
      const file = e.target.files[0];
      if (!file || !db) return;
      const target = state.faenaSeleccionada || FAENAS[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let count = 0;
        json.forEach((row) => {
          const rowTag = row.Tag || row.tag || row.TAG || row.Equipo || row.equipo;
          if (row && rowTag) {
            const id = 'EQ_EXCEL_' + Date.now() + '_' + count;
            db.child(id).set({
              siteId: target,
              domain: 'planta',
              area: row.Area || row.area || row.AREA || 'General',
              tag: rowTag,
              tipo: row.Tipo || row.tipo || 'Activo',
              lat: row.Lat || row.lat || '',
              lng: row.Lng || row.lng || '',
              componentes: [{ nombre: 'Spot Masivo', severidad: 'Verde' }]
            });
            count++;
          }
        });
        alert(`✅ Carga masiva exitosa: ${count} activos en ${target}.`);
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    }
  };

  document.addEventListener('DOMContentLoaded', () => { refresh(); });
})();
