import { generarPDFExpediente } from '../core/reportes.js';

export function renderizarExpediente(tagEquipo, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    // Asignamos un ID único al panel que queremos exportar
    contenedor.innerHTML = `
        <div class="panel-industrial" id="zona-imprimible" style="animation: fadeIn 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div>
                    <h3 style="color: var(--primary-blue);">Expediente Técnico CBM: ${tagEquipo}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Historial de Puntos y Diagnóstico KBE (Emerson CSI & Dynamox)</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-exportar-pdf" class="btn-topbar" style="background: rgba(16, 185, 129, 0.1); color: var(--iso-zona-a); border-color: rgba(16, 185, 129, 0.3);">
                        <span class="material-symbols-outlined">picture_as_pdf</span> Exportar PDF
                    </button>
                    <button id="btn-volver-dashboard" class="btn-topbar">
                        <span class="material-symbols-outlined">arrow_back</span> Volver a Planta
                    </button>
                </div>
            </div>

            <table class="tabla-cbm">
                <thead>
                    <tr>
                        <th>Punto</th>
                        <th>Componente</th>
                        <th>RMS (mm/s)</th>
                        <th style="width: 160px;">Tendencia (Últimos 5 días)</th>
                        <th>Estado ISO</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>M1</strong></td><td>Motor (NDE)</td><td>1.25</td>
                        <td><div style="width: 140px; height: 35px;"><canvas id="chart-m1"></canvas></div></td>
                        <td><span class="tag-estado zona-a">ZONA A</span></td>
                    </tr>
                    <tr>
                        <td><strong>M2</strong></td><td>Motor (DE)</td><td>2.10</td>
                        <td><div style="width: 140px; height: 35px;"><canvas id="chart-m2"></canvas></div></td>
                        <td><span class="tag-estado zona-b">ZONA B</span></td>
                    </tr>
                    <tr>
                        <td><strong>G4</strong></td><td>Reductor (Eje)</td><td>6.80</td>
                        <td><div style="width: 140px; height: 35px;"><canvas id="chart-g4"></canvas></div></td>
                        <td><span class="tag-estado zona-c">ZONA C</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    setTimeout(() => {
        crearMiniGrafico('chart-m1', [0.8, 0.9, 1.1, 1.2, 1.25], '#10b981');
        crearMiniGrafico('chart-m2', [1.5, 1.7, 1.8, 1.9, 2.10], '#84cc16');
        crearMiniGrafico('chart-g4', [2.5, 2.8, 3.1, 5.5, 6.80], '#f59e0b');

        // Escuchar el clic del botón PDF
        const btnPdf = document.getElementById('btn-exportar-pdf');
        if (btnPdf) {
            btnPdf.addEventListener('click', () => {
                generarPDFExpediente(tagEquipo, 'zona-imprimible');
            });
        }
    }, 100);
}

function crearMiniGrafico(idCanvas, datosRms, colorLinea) {
    const ctx = document.getElementById(idCanvas);
    if (!ctx) return;
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Día 1', 'Día 2', 'Día 3', 'Día 4', 'Hoy'],
            datasets: [{ data: datosRms, borderColor: colorLinea, borderWidth: 2.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: '#010409', titleColor: '#38bdf8', callbacks: { label: function(context) { return context.parsed.y + ' mm/s'; } } } },
            scales: { x: { display: false }, y: { display: false, min: 0 } },
            layout: { padding: 0 }
        }
    });
}