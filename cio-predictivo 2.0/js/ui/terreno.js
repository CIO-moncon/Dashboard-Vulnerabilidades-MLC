export function renderizarHallazgo(idAlerta, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div class="panel-industrial" style="animation: fadeIn 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h3 style="color: var(--iso-zona-d); display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined">warning</span> Reporte Terreno: Fuga de Aceite
                    </h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">Reportado por Pedro Inspector (Técnico Nivel I)</p>
                </div>
                <button id="btn-volver-dashboard" class="btn-topbar">
                    <span class="material-symbols-outlined">arrow_back</span> Volver a Planta
                </button>
            </div>

            <div style="background: var(--bg-input); padding: 25px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">DESCRIPCIÓN DEL HALLAZGO</p>
                <p style="font-size: 0.95rem; line-height: 1.6; margin-bottom: 30px; color: var(--text-main);">Se detecta fuga de aceite visible en el sello del eje de entrada (G1). Nivel de aceite por debajo del mínimo en mirilla. Se percibe aumento de temperatura al tacto en la carcasa del Reductor 3102.</p>
                
                <div style="display: flex; gap: 12px; border-top: 1px solid var(--border-glass); padding-top: 20px;">
                    <!-- Se añadió el ID btn-generar-sap al botón -->
                    <button id="btn-generar-sap" class="btn-topbar"><span class="material-symbols-outlined">build</span> Generar Aviso SAP</button>
                </div>
            </div>
        </div>
    `;

    // ---------------------------------------------------------
    // LÓGICA DE INTERACCIÓN Y UI ASÍNCRONA
    // ---------------------------------------------------------
    
    // Evento para generar Aviso SAP con confirmación visual
    const btnGenerarSAP = document.getElementById('btn-generar-sap');
    if (btnGenerarSAP) {
        btnGenerarSAP.addEventListener('click', async () => {
            const confirmado = await UI.confirmar(
                "¿Estás seguro de generar un aviso de mantenimiento correctivo en SAP para este hallazgo en terreno?", 
                "Confirmar Integración SAP"
            );
            
            if (confirmado) {
                // Aquí en el futuro puedes inyectar la lógica de tu API o Firebase
                btnGenerarSAP.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Procesando...`;
                
                // Simulamos el tiempo de respuesta del servidor (1.5s)
                setTimeout(() => {
                    UI.mostrarToast("Aviso SAP generado exitosamente.", "exito");
                    btnGenerarSAP.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Aviso SAP Enviado`;
                    btnGenerarSAP.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                    btnGenerarSAP.style.color = "var(--iso-zona-a)";
                    btnGenerarSAP.style.borderColor = "rgba(16, 185, 129, 0.3)";
                    btnGenerarSAP.disabled = true;
                }, 1500);
            }
        });
    }

    // Aseguramos que el botón de volver al dashboard funcione (si no está mapeado globalmente en app.js)
    const btnVolver = document.getElementById('btn-volver-dashboard');
    if (btnVolver) {
        btnVolver.addEventListener('click', () => {
            // Lógica para volver a la vista principal (puedes ajustarla según tu orquestador)
            const mapContainer = document.getElementById('mapa-planta');
            if (mapContainer) mapContainer.style.display = 'block';
            contenedor.innerHTML = ''; 
        });
    }
}