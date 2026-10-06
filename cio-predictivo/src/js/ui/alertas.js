// src/js/ui/alertas.js

export function iniciarReceptorAlertasCIO() {
    // Asegurarnos de que Firebase esté inicializado
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.error("Firebase no está cargado aún.");
        return;
    }

    const dbAlertas = firebase.database().ref('alertas_terreno');

    dbAlertas.on('value', (snapshot) => {
        const contenedor = document.getElementById('lista-alertas-terreno');
        const contador = document.getElementById('badge-contador-alertas');
        const data = snapshot.val();

        if (!data) {
            if (contenedor) contenedor.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">No hay reportes nuevos desde terreno.</p>';
            if (contador) {
                contador.innerText = '0';
                contador.style.display = 'none';
            }
            return;
        }

        // Convertir objeto a Array y ordenar por fecha (más reciente primero)
        const alertasArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Filtrar solo las alertas nuevas
        const alertasPendientes = alertasArray.filter(alerta => alerta.estado !== 'resuelto');
        
        if (contador) {
            contador.innerText = alertasPendientes.length;
            contador.style.display = alertasPendientes.length > 0 ? 'inline-block' : 'none';
        }

        let htmlTarjetas = '';
        alertasPendientes.forEach(alerta => {
            // 1. Asignar color de borde según el semáforo
            let colorBorde = 'var(--status-ok)'; 
            if (alerta.severidad === 'Rojo') colorBorde = 'var(--status-critico)';
            if (alerta.severidad === 'Naranja') colorBorde = 'var(--status-alarma)';
            if (alerta.severidad === 'Amarillo') colorBorde = 'var(--status-seguimiento)';

            // 2. Formatear la fecha para que sea más corta
            const fechaStr = new Date(alerta.timestamp).toLocaleString('es-CL', { 
                day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' 
            });

            // 3. Limpieza de datos (Arregla el "Spot: undefined" de los reportes antiguos)
            // Extrae el nombre del componente o usa 'Condición General'
            let spotLimpio = alerta.componente;
            if (!spotLimpio || spotLimpio === 'undefined') {
                const match = alerta.detalle.match(/\[COMPONENTE:\s*([^\]]+)\]/);
                spotLimpio = match ? match[1] : 'Condición General';
            }
            
            // Limpia la etiqueta "[COMPONENTE: ...]" del texto para no repetirlo
            let detalleLimpio = alerta.detalle.replace(/\[COMPONENTE:.*?\]\n?/g, '');

            // 4. Construir la tarjeta UI Premium
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
                
                ${alerta.fotoBase64 ? `
                <div class="alerta-evidencia">
                    <img src="${alerta.fotoBase64}" alt="Evidencia Terreno" onclick="window.ampliarImagenAlerta('${alerta.fotoBase64}')">
                </div>
                ` : ''}
                
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

// Funciones globales (alojadas en window para que el HTML pueda llamarlas)
window.ampliarImagenAlerta = function(src) {
    const w = window.open("");
    w.document.write(`<body style="margin:0; background:#000; display:flex; justify-content:center; align-items:center; height:100vh;"><img src="${src}" style="max-width:100%; max-height:100vh;"></body>`);
};

window.validarHallazgoAnalista = function(idAlerta, tagEquipo, severidadSugerida) {
    // Aquí programaremos luego la actualización a la base de datos principal
    alert(`Analista CBM: Has iniciado la validación para el equipo ${tagEquipo}.\nSe evaluará inyectar la severidad: ${severidadSugerida}.`);
};

window.centrarMapaEnEquipo = function(tag) {
    // Si ya tienes tu lógica de mapa, aquí la llamaremos
    alert(`Buscando equipo ${tag} en el mapa general...`);
};