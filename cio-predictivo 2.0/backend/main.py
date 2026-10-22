from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import numpy as np
from sklearn.ensemble import IsolationForest

from analizador_fft import calcular_espectro_fft, evaluar_severidad_iso

app = FastAPI(
    title="CIO Predictivo 2.0 — Backend Analítico CBM",
    description="Microservicio de procesamiento de vibraciones, FFT y Machine Learning para Mina Los Colorados.",
    version="2.4.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
);

class SolicitudAnalisis(BaseModel):
    tag_equipo: str = Field(..., example="CV-01-M01")
    componente: str = Field(..., example="Reductore Principal")
    frecuencia_muestreo: float = Field(default=1000.0, description="Hz")
    muestra_temporal: List[float] = Field(..., description="Array crudo de aceleración/velocidad")

class ResultadoAnalisis(BaseModel):
    tag_equipo: str
    rms_calculado: float
    estado_iso: str
    frecuencias: List[float]
    amplitudes: List[float]
    anomalia_detectada: bool

@app.get("/")
def leer_raiz():
    return {
        "sistema": "CIO Predictivo 2.0 Backend",
        "faena": "Mina Los Colorados",
        "estado": "Operativo",
        "norma": "ISO 20816-3"
    }

@app.post("/api/v1/analizar-vibracion", response_model=ResultadoAnalisis)
def analizar_vibracion(payload: SolicitudAnalisis):
    try:
        datos = np.array(payload.muestra_temporal)
        if len(datos) == 0:
            raise HTTPException(status_code=400, detail="La muestra temporal está vacía.")

        # 1. Cálculo de RMS
        rms = float(np.sqrt(np.mean(datos**2)))

        # 2. Evaluación ISO 20816-3
        estado_iso = evaluar_severidad_iso(rms)

        # 3. FFT con SciPy
        xf, yf = calcular_espectro_fft(datos, payload.frecuencia_muestreo)

        # 4. Machine Learning No Supervisado (Isolation Forest para detección de anomalías)
        # Se entrena de forma rápida sobre la misma muestra para aislar outliers estadísticos
        modelo_ml = IsolationForest(contamination=0.05, random_state=42)
        X = datos.reshape(-1, 1)
        modelo_ml.fit(X)
        predicciones = modelo_ml.predict(X)
        anomalia_detectada = bool(np.any(predicciones == -1))

        return {
            "tag_equipo": payload.tag_equipo,
            "rms_calculado": round(rms, 3),
            "estado_iso": estado_iso,
            "frecuencias": xf,
            "amplitudes": yf,
            "anomalia_detectada": anomalia_detectada
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en procesamiento analítico: {str(e)}")