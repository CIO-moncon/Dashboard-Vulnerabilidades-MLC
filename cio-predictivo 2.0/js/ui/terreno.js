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
                    <button class="btn-topbar"><span class="material-symbols-outlined">build</span> Generar Aviso SAP</button>
                </div>
            </div>
        </div>
    `;
}