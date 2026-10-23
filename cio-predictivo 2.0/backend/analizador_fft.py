import io
import base64
import numpy as np
from scipy.signal import find_peaks
from sklearn.ensemble import IsolationForest
import matplotlib
matplotlib.use('Agg')  # Configuración para entorno servidor sin pantalla
import matplotlib.pyplot as plt

def procesar_senal_vibracion(amplitudes: list, fs: float = 1000.0):
    """
    Procesa la señal con NumPy, SciPy, Isolation Forest y genera 
    un gráfico espectral FFT codificado en Base64 para la PWA.
    """
    x = np.array(amplitudes)
    
    if len(x) == 0:
        raise ValueError("El arreglo de amplitudes está vacío.")
    
    # 1. Cálculos Estadísticos Básicos
    rms = float(np.sqrt(np.mean(x**2)))
    pico = float(np.max(np.abs(x)))
    factor_cresta = float(pico / rms) if rms > 0 else 0.0
    
    # 2. Transformada Rápida de Fourier (FFT) usando SciPy
    n = len(x)
    fft_vals = np.abs(np.fft.rfft(x)) / n
    freqs = np.fft.rfftfreq(n, 1 / fs)
    
    if len(fft_vals) > 2:
        fft_vals[1:-1] *= 2
        
    # 3. Picos Espectrales Dominantes
    picos_indices, _ = find_peaks(fft_vals, prominence=np.max(fft_vals) * 0.1 if len(fft_vals) > 0 else 0)
    picos_espectrales = [
        {"frecuencia_hz": round(float(freqs[idx]), 2), "amplitud": round(float(fft_vals[idx]), 4)}
        for idx in picos_indices
    ]
    picos_espectrales = sorted(picos_espectrales, key=lambda k: k["amplitud"], reverse=True)[:5]

    # 4. Machine Learning: Detección de Anomalías con Isolation Forest
    X_train = np.array([
        [1.2, 2.1], [1.5, 2.3], [1.1, 2.0], [1.8, 2.5], 
        [2.0, 2.2], [1.3, 2.4], [1.6, 2.1], [1.4, 2.3]
    ])
    clf = IsolationForest(contamination=0.1, random_state=42)
    clf.fit(X_train)
    prediccion_ml = clf.predict(np.array([[rms, factor_cresta]]))
    anomalia_detectada = bool(prediccion_ml[0] == -1)

    # 5. Evaluación ISO 20816-3 y Recomendación
    evaluacion_iso = "Zona A (Óptimo)"
    recomendacion = "Condición normal. Continuar con la pauta de rutina."
    
    if rms >= 7.1 or anomalia_detectada:
        evaluacion_iso = "Zona D (Crítico)"
        recomendacion = "¡ALERTA CRÍTICA! Detener el equipo o programar intervención inmediata. Revisar rodamientos, des alineamiento severo o desgaste avanzado."
    elif rms >= 4.5:
        evaluacion_iso = "Zona C (Alerta)"
        recomendacion = "Atención requerida. Programar inspección detallada por termografía o análisis de vibraciones en el próximo turno."
    elif rms >= 2.8:
        evaluacion_iso = "Zona B (Seguimiento)"
        recomendacion = "Condición aceptable pero requiere monitoreo frecuente y revisión de lubricación."

    # 6. Generación del Gráfico FFT con Matplotlib (Diseño Industrial Oscuro)
    plt.figure(figsize=(6, 2.5), facecolor='#0f172a')
    ax = plt.axes()
    ax.set_facecolor('#0b1120')
    
    ax.plot(freqs, fft_vals, color='#38bdf8', linewidth=1.2, label='Espectro FFT')
    ax.scatter([p['frecuencia_hz'] for p in picos_espectrales], [p['amplitud'] for p in picos_espectrales], color='#f59e0b', s=25, zorder=5, label='Picos Dominantes')
    
    ax.set_title(f"Espectro FFT — RMS: {rms:.2f} mm/s", color='white', fontsize=9, fontweight='bold')
    ax.set_xlabel("Frecuencia (Hz)", color='#94a3b8', fontsize=8)
    ax.set_ylabel("Amplitud", color='#94a3b8', fontsize=8)
    ax.tick_params(colors='#94a3b8', labelsize=7)
    ax.grid(color='rgba(255, 255, 255, 0.08)', linestyle='--', linewidth=0.5)
    for spine in ax.spines.values():
        spine.set_edgecolor('rgba(255, 255, 255, 0.15)')
        
    plt.tight_layout()

    # Convertir gráfico a Base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=150, facecolor='#0f172a', edgecolor='none')
    buffer.seek()
    imagen_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    plt.close()

    return {
        "rms_mm_s": round(rms, 2),
        "factor_cresta": round(factor_cresta, 2),
        "pico_maximo": round(pico, 2),
        "evaluacion_iso": evaluacion_iso,
        "anomalia_ml": anomalia_detectada,
        "recomendacion_mantenimiento": recomendacion,
        "picos_espectrales_dominantes": picos_espectrales,
        "grafico_fft_base64": f"data:image/png;base64,{imagen_base64}"
    }