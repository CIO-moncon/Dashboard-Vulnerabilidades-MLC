// src/js/ui/alertas.js

export function iniciarReceptorAlertasCIO() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.error("Firebase no está cargado aún.");
        return;
    }

    const dbAlertas = firebase.database().ref('alertas_terreno');

    // Almacén global para las evidencias (evita saturar el DOM con Base64)
    if (!window.almacenEvidencias) window.almacenEvidencias = {};

    dbAlertas.on('value', (snapshot) => {
        const contenedor = document.getElementById('lista-alertas-terreno');
        const contador = document.getElementById('badge-contador-alertas');
        const data = snapshot.val();

        if (!data) {
            if (contenedor) contenedor.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">No hay reportes nuevos desde terreno.</p>';
            if (contador) contador.style.display = 'none';
            return;
        }

        // Ordenar por fecha (más recientes primero)
        const alertasArray = Object.keys(data).map(key => ({ id: key, ...data[key] }))
                                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Filtrar pendientes
        const alertasPendientes = alertasArray.filter(alerta => alerta.estado !== 'resuelto');
        
        if (contador) {
            contador.innerText = alertasPendientes.length;
            contador.style.display = alertasPendientes.length > 0 ? 'inline-block' : 'none';
        }

        let htmlTarjetas = '';
        alertasPendientes.forEach(alerta => {
            let colorBorde = 'var(--status-ok)'; 
            if (alerta.severidad === 'Rojo') colorBorde = 'var(--status-critico)';
            if (alerta.severidad === 'Naranja') colorBorde = 'var(--status-alarma)';
            if (alerta.severidad === 'Amarillo') colorBorde = 'var(--status-seguimiento)';

            const fechaStr = new Date(alerta.timestamp).toLocaleString('es-CL', { 
                day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' 
            });

            // Limpieza del "Spot: undefined"
            let spotLimpio = alerta.componente;
            if (!spotLimpio || spotLimpio === 'undefined') {
                const match = alerta.detalle.match(/\[COMPONENTE:\s*([^\]]+)\]/);
                spotLimpio = match ? match[1] : 'Condición General';
            }
            let detalleLimpio = alerta.detalle.replace(/\[COMPONENTE:.*?\]\n?/g, '');

            // ==========================================
            // LÓGICA DE GALERÍA MULTIMEDIA (FOTOS Y VIDEOS)
            // ==========================================
            window.almacenEvidencias[alerta.id] = alerta.evidencias || [];
            
            // Respaldo por si es un reporte antiguo que solo traía 'fotoBase64'
            if (!alerta.evidencias && alerta.fotoBase64) {
                window.almacenEvidencias[alerta.id] = [{tipo: 'imagen', data: alerta.fotoBase64}];
            }

            let htmlEvidencias = '';
            const evs = window.almacenEvidencias[alerta.id];
            
            if (evs && evs.length > 0) {
                htmlEvidencias = '<div class="alerta-galeria" style="display: flex; gap: 8px; margin-top: 8px; overflow-x: auto; padding-bottom: 4px;">';
                evs.forEach((ev, idx) => {
                    if (ev.tipo === 'imagen') {
                        htmlEvidencias += `<img src="${ev.data}" onclick="window.abrirVisorEvidencia('${alerta.id}', ${idx})" style="height: 55px; width: 55px; min-width: 55px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">`;
                    } else if (ev.tipo === 'video') {
                        htmlEvidencias += `<div onclick="window.abrirVisorEvidencia('${alerta.id}', ${idx})" style="height: 55px; width: 55px; min-width: 55px; background: rgba(0,0,0,0.4); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.2); transition: transform 0.2s; color: var(--status-critico);" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"><span class="material-symbols-outlined" style="font-size: 26px;">play_circle</span></div>`;
                    }
                });
                htmlEvidencias += '</div>';
            }

            htmlTarjetas += `
            <div class="tarjeta-alerta-cio" style="border-left: 4px solid ${colorBorde};">
                <div class="alerta-cabecera">
                    <div class="alerta-tag-container">
                        <span class="material-symbols-outlined icon-tag">precision_manufacturing</span>
                        <span class="alerta-tag">${alerta.tag}</span>
                    </div>
                    <span class="alerta-fecha">${fechaStr}</span>
                </div>
                
                <div class="alerta-cuerpo">
                    <div class="alerta-spot">
                        <span class="material-symbols-outlined">build_circle</span>
                        <strong>Spot:</strong> ${spotLimpio}
                    </div>
                    <div class="alerta-detalle">
                        ${detalleLimpio.replace(/\n/g, '<br>')}
                    </div>
                </div>
                
                <!-- MINI GALERÍA INYECTADA -->
                ${htmlEvidencias}
                
                <div class="alerta-acciones">
                    <button class="btn-alerta-mapa" onclick="window.centrarMapaEnEquipo('${alerta.tag}')">
                        <span class="material-symbols-outlined">location_on</span> Mapa
                    </button>
                    <button class="btn-alerta-validar" onclick="window.validarHallazgoAnalista('${alerta.id}', '${alerta.tag}', '${alerta.severidad}')">
                        <span class="material-symbols-outlined">check_circle</span> Validar
                    </button>
                </div>
            </div>
            `;
        });

        if (contenedor) contenedor.innerHTML = htmlTarjetas;
    });
}

// ========================================================
// VISOR DE EVIDENCIA (LIGHTBOX INTEGRADO GENERADO EN JS)
// ========================================================
window.abrirVisorEvidencia = function(alertaId, idx) {
    const ev = window.almacenEvidencias[alertaId][idx];
    if (!ev) return;

    // Crear el contenedor oscuro si no existe
    let visor = document.getElementById('visor-evidencia-cio');
    if (!visor) {
        visor = document.createElement('div');
        visor.id = 'visor-evidencia-cio';
        visor.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px); z-index:99999; display:flex; justify-content:center; align-items:center; flex-direction:column;';
        document.body.appendChild(visor);
    }

    // Dibujar el contenido según sea Foto o Video
    let contenido = '';
    if (ev.tipo === 'imagen') {
        contenido = `<img src="${ev.data}" style="max-width:90%; max-height:85vh; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.8);">`;
    } else if (ev.tipo === 'video') {
        contenido = `<video src="${ev.data}" controls autoplay style="max-width:90%; max-height:85vh; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.8);"></video>`;
    }

    // Inyectar al DOM
    visor.innerHTML = `
        <button onclick="document.getElementById('visor-evidencia-cio').style.display='none'" 
                style="position:absolute; top:25px; right:25px; background:var(--status-critico, #ef4444); color:white; border:none; border-radius:50%; width:45px; height:45px; cursor:pointer; display:flex; justify-content:center; align-items:center; box-shadow:0 4px 10px rgba(0,0,0,0.4); transition: transform 0.2s;"
                onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
            <span class="material-symbols-outlined" style="font-size: 24px;">close</span>
        </button>
        ${contenido}
    `;
    visor.style.display = 'flex';
};

// ==========================================
// FUNCIONES DE SOPORTE DE BOTONES
// ==========================================
window.validarHallazgoAnalista = function(idAlerta, tagEquipo, severidadSugerida) {
    alert(`Analista CBM:\nValidación iniciada para ${tagEquipo}.\nSe inyectará la severidad: ${severidadSugerida} al catastro global.`);
};

window.centrarMapaEnEquipo = function(tag) {
    alert(`Buscando equipo ${tag} en el mapa general...`);
};