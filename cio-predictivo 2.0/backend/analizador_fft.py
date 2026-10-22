import numpy as np
from scipy.signal import butter, lfilter

def aplicar_filtro_paso_alto(datos, fs=1000, corte=5):
    """Filtra ruido de baja frecuencia en la señal de aceleración o velocidad."""
    nyq = 0.5 * fs
    normal_cutoff = corte / nyq
    b, a = butter(1, normal_cutoff, btype='high', analog=False)
    return lfilter(b, a, datos)

def calcular_espectro_fft(senal, fs=1000):
    """Calcula la Transformada Rápida de Fourier (FFT) para detección de fallas en rodamientos/engranajes."""
    senal_filtrada = aplicar_filtro_paso_alto(senal, fs)
    N = len(senal_filtrada)
    if N == 0:
        return [], []
    
    yf = np.fft.rfft(senal_filtrada)
    xf = np.fft.rfftfreq(N, 1 / fs)
    amplitudes = (2.0 / N) * np.abs(yf)
    return xf.tolist(), amplitudes.tolist()

def evaluar_severidad_iso(rms_velocidad: float) -> str:
    """Evalúa la severidad vibracional según umbrales ISO 20816-3 para maquinaria industrial."""
    if rms_velocidad <= 2.3:
        return "Zona A (Óptimo)"
    elif rms_velocidad <= 4.5:
        return "Zona B (Seguimiento)"
    elif rms_velocidad <= 7.1:
        return "Zona C (Alerta)"
    else:
        return "Zona D (Crítico - Acción Inmediata)"