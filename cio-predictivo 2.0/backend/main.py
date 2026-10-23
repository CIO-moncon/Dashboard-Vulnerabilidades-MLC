from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from analizador_fft import procesar_senal_vibracion

app = FastAPI(
    title="CIO Predictivo 2.0 - Backend Analítico",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SolicitudAnalisis(BaseModel):
    tag_equipo: str
    amplitudes: List[float]
    componente: Optional[str] = "General"
    frecuencia_muestreo: Optional[float] = 1000.0

@app.post("/api/analizar-vibracion")
def analizar_vibracion(datos: SolicitudAnalisis):
    try:
        if not datos.amplitudes:
            raise HTTPException(status_code=400, detail="El arreglo de amplitudes está vacío.")
        
        resultado = procesar_senal_vibracion(datos.amplitudes, datos.frecuencia_muestreo)
        
        return {
            "tag_equipo": datos.tag_equipo,
            "resultado_analisis": resultado
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))