import io
import base64
from typing import List, Dict, Any, Optional
import numpy as np
from scipy.signal import find_peaks, windows
from sklearn.ensemble import IsolationForest
import matplotlib
matplotlib.use('Agg')  # Modo headless para servidores sin display
import matplotlib.pyplot as plt

# -----------------------------------------------------------------------------
# MODELO ML PRE-ENTRENADO (Inicializado una sola vez en memoria)
# -----------------------------------------------------------------------------
# Línea base preliminar de comportamiento de vibración [RMS, Crest Factor]
BASE_TRAIN_DATA = np.array([
    [1.2, 2.1], [1.5, 2.3], [1.1, 2.0], [1.8, 2.5],
    [2.0, 2.2], [1.3, 2.4], [1.6, 2.1], [1.4, 2.3],
    [2.2, 2.6], [1.7, 2.2], [1.9, 2.4], [2.1, 2.3]
])
clf_anomalias = IsolationForest(contamination=0.08, random_state=42)
clf_anomalias.fit(BASE_TRAIN_DATA)


def procesar_senal_vibracion(
    amplitudes: List[float],
    fs: float = 1000.0,
    grupo_iso: str = "grupo1",
    soporte_iso: str = "rigido"
) -> Dict[str, Any]:
    """
    Procesa la señal temporal de vibración:
    1. Remoción de offset DC y aplicación de ventana Hanning.
    2. FFT corregida en amplitud y extracción de armónicos dominantes.
    3. Evaluación de anomalías estadísticas con Isolation Forest.
    4. Clasificación según matriz ISO 20816-3.
    5. Renderizado de gráfico espectral en Base64 con estética industrial oscura.
    """
    x = np.asarray(amplitudes, dtype=np.float64)
    n = len(x)

    if n < 8:
        raise ValueError("Se requieren al menos 8 muestras para un análisis espectral FFT válido.")

    # 1. Parámetros Estadísticos Temporales (sobre señal física sin DC)
    dc_offset = float(np.mean(x))
    x_ac = x - dc_offset

    rms = float(np.sqrt(np.mean(x_ac**2)))
    pico = float(np.max(np.abs(x_ac)))
    factor_cresta = float(pico / rms) if rms > 1e-6 else 0.0

    # 2. Transformada Rápida de Fourier (FFT con Ventana Hanning)
    ventana = windows.hann(n)
    factor_correccion_amplitud = 2.0  # Ganancia coherente para ventana Hanning

    x_enventanada = x_ac * ventana
    fft_vals = np.abs(np.fft.rfft(x_enventanada)) / n * factor_correccion_amplitud
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)

    # Duplicar energía de frecuencias intermedias para espectro unilateral
    if len(fft_vals) > 2:
        fft_vals[1:-1] *= 2.0

    # 3. Detección de Picos Espectrales Dominantes
    max_amp = float(np.max(fft_vals)) if len(fft_vals) > 0 else 0.0
    prominencia_minima = max_amp * 0.08

    picos_indices, _ = find_peaks(fft_vals, prominence=prominencia_minima)
    picos_espectrales = [
        {"frecuencia_hz": round(float(freqs[idx]), 2), "amplitud": round(float(fft_vals[idx]), 4)}
        for idx in picos_indices
    ]
    picos_espectrales = sorted(picos_espectrales, key=lambda k: k["amplitud"], reverse=True)[:5]

    # 4. Inferencia de Anomalía con Isolation Forest
    vector_caracteristicas = np.array([[rms, factor_cresta]])
    prediccion_ml = clf_anomalias.predict(vector_caracteristicas)
    anomalia_detectada = bool(prediccion_ml[0] == -1)

    # 5. Evaluación Normativa ISO 20816-3
    # Matriz normalizada idéntica a evaluadorIso.ts
    matriz_limites = {
        ("grupo1", "rigido"): {"b": 2.3, "c": 4.5, "d": 7.1},
        ("grupo1", "flexible"): {"b": 3.5, "c": 7.1, "d": 11.0},
        ("grupo2", "rigido"): {"b": 1.4, "c": 2.8, "d": 4.5},
        ("grupo2", "flexible"): {"b": 2.3, "c": 4.5, "d": 7.1}
    }
    limites = matriz_limites.get((grupo_iso, soporte_iso), matriz_limites[("grupo1", "rigido")])

    if rms <= limites["b"]:
        evaluacion_iso = "Zona A (Óptimo)"
        recomendacion = "Condición normal. Continuar con la pauta de rutina."
    elif rms <= limites["c"]:
        evaluacion_iso = "Zona B (Aceptable)"
        recomendacion = "Condición aceptable para operación continua sin restricciones."
    elif rms <= limites["d"]:
        evaluacion_iso = "Zona C (Alarma)"
        recomendacion = "Operación restringida. Programar inspección de vibración o termografía en el próximo turno."
    else:
        evaluacion_iso = "Zona D (Peligro / Daño)"
        recomendacion = "¡CONDICIÓN CRÍTICA! Detener equipo o programar intervención correctiva urgente."

    if anomalia_detectada and evaluacion_iso in ["Zona A (Óptimo)", "Zona B (Aceptable)"]:
        recomendacion += " (Nota CBM: Se detectó patrón impulsivo o transitorio anómalo por factor de cresta elevado)."

    # 6. Renderizado de Gráfico Espectral (Paleta Industrial Sala de Control)
    fig, ax = plt.subplots(figsize=(6, 2.4), facecolor='#0E1B1F', dpi=140)
    ax.set_facecolor('#16282D')

    ax.plot(freqs, fft_vals, color='#38BDF8', linewidth=1.1, label='Espectro FFT (Hanning)')

    if picos_espectrales:
        px = [p["frecuencia_hz"] for p in picos_espectrales]
        py = [p["amplitud"] for p in picos_espectrales]
        ax.scatter(px, py, color='#F5A623', s=24, zorder=5, label='Armónicos Dominantes')

    ax.set_title(f"Espectro FFT | RMS: {rms:.2f} mm/s | {evaluacion_iso}", color='#F4F6F5', fontsize=8.5, fontweight='bold', pad=8)
    ax.set_xlabel("Frecuencia (Hz)", color='#94A3B8', fontsize=7.5)
    ax.set_ylabel("Amplitud (mm/s)", color='#94A3B8', fontsize=7.5)
    ax.tick_params(colors='#94A3B8', labelsize=7)
    ax.grid(color='rgba(255, 255, 255, 0.07)', linestyle='--', linewidth=0.5)

    for spine in ax.spines.values():
        spine.set_edgecolor('rgba(255, 255, 255, 0.12)')

    plt.tight_layout()

    # Buffer a Base64 sin tocar disco
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor='#0E1B1F', edgecolor='none')
    buffer.seek(0)
    imagen_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    plt.close(fig)

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