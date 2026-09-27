// ==========================================
// NÚCLEO CIO - CONEXIÓN FIREBASE Y LÓGICA
// ==========================================

// 1. Configuración de tu base de datos (Extraída de tu app de terreno)
const firebaseConfig = {
    apiKey: "AIzaSyBd5MEZdMmgzBs1xCyeGYeKtQx5gJIeY3w",
    authDomain: "dashboard-vulnerabilidades-mlc.firebaseapp.com",
    databaseURL: "https://dashboard-vulnerabilidades-mlc-default-rtdb.firebaseio.com",
    projectId: "dashboard-vulnerabilidades-mlc"
};

// 2. Inicializar Firebase de forma segura
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Referencias a tus colecciones
const alertasRef = db.ref('alertas_terreno');
const activosRef = db.ref('activos_criticos');

// ==========================================
// ESCUCHA EN TIEMPO REAL (REALTIME LISTENER)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Escuchamos la colección de alertas en vivo
    alertasRef.on('value', (snapshot) => {
        const datos = snapshot.val();
        renderizarDashboard(datos);
    });

});

// ==========================================
// RENDERIZADO BENTO GRID & ZONAS ISO 20816-3
// ==========================================

function renderizarDashboard(alertasData) {
    const contenedorAlertas = document.getElementById('lista-alertas');
    
    // Contadores para la norma ISO 20816-3
    let conteoZonaD_Rojo = 0;
    let conteoZonaC_Naranja = 0;
    let conteoZonaB_Amarillo = 0;

    // Si la base de datos está vacía
    if (!alertasData) {
        contenedorAlertas.innerHTML = '<p class="text-muted" style="text-align:center; padding-top: 20px;">Sin alertas activas. Planta estabilizada.</p>';
        actualizarKPIs(0, 0, 0, 0);
        return;
    }

    // Convertir el objeto de Firebase en un Array y ordenarlo por fecha (las más nuevas primero)
    const alertasArray = Object.values(alertasData);
    alertasArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let htmlInyectado = '';

    alertasArray.forEach(alerta => {
        // 1. Calcular KPIs según la severidad enviada desde terreno
        if (alerta.severidad === 'Rojo') conteoZonaD_Rojo++;
        if (alerta.severidad === 'Naranja') conteoZonaC_Naranja++;
        if (alerta.severidad === 'Amarillo') conteoZonaB_Amarillo++;

        // 2. Estilizar la tarjeta de la alerta según la severidad
        let colorBorde = 'var(--text-muted)';
        let icono = 'info';

        if (alerta.severidad === 'Rojo') { colorBorde = 'var(--status-critical)'; icono = 'dangerous'; }
        if (alerta.severidad === 'Naranja') { colorBorde = 'var(--status-warning)'; icono = 'warning'; }
        if (alerta.severidad === 'Amarillo') { colorBorde = 'var(--status-alert)'; icono = 'visibility'; }

        // Formatear la fecha
        const fechaFormateada = new Date(alerta.timestamp).toLocaleString('es-CL', { 
            day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' 
        });

        // 3. Construir el HTML de la alerta para el panel izquierdo
        htmlInyectado += `
            <div style="border-left: 4px solid ${colorBorde}; background: rgba(255,255,255,0.03); padding: 12px; margin-bottom: 12px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: white; font-size: 1.05rem;">${alerta.tag || 'SIN TAG'}</strong>
                    <span style="font-size: 0.75rem; color: ${colorBorde}; font-weight: bold; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">
                        ${alerta.severidad.toUpperCase()}
                    </span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 5px;">
                    <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">build</span> ${alerta.faena || 'Área General'}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">
                    "${alerta.detalle}"
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 10px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                    Reportado: ${fechaFormateada}
                </div>
            </div>
        `;
    });

    // Renderizar la lista de alertas
    contenedorAlertas.innerHTML = htmlInyectado;

    // Calcular equipos en Zona A (Normal) 
    // Por ahora, simularemos que hay un total de 150 equipos monitorizados restando los que tienen alarmas.
    const TOTAL_EQUIPOS_PLANTA = 150;
    const equiposConAlarma = conteoZonaD_Rojo + conteoZonaC_Naranja + conteoZonaB_Amarillo;
    const conteoZonaA_Verde = TOTAL_EQUIPOS_PLANTA - equiposConAlarma;

    // Actualizar el DOM
    actualizarKPIs(conteoZonaA_Verde, conteoZonaB_Amarillo, conteoZonaC_Naranja, conteoZonaD_Rojo);
}

function actualizarKPIs(zonaA, zonaB, zonaC, zonaD) {
    document.getElementById('kpi-ok').innerText = zonaA;
    document.getElementById('kpi-alert').innerText = zonaB;
    document.getElementById('kpi-warn').innerText = zonaC;
    document.getElementById('kpi-crit').innerText = zonaD;
}