# 🏗️ Arquitectura del Sistema — CIO Predictivo 2.0

La arquitectura de **CIO Predictivo 2.0** está diseñada bajo un modelo híbrido moderno, combinando una aplicación cliente ultrarrápida basada en tecnologías nativas con un motor analítico avanzado y persistencia robusta para entornos industriales mineros.

## 1. Diagrama de Componentes y Capas

[ Frontend PWA (HTML5 / CSS / JS ES6+) ]
│
├──> MapLibre GL JS (Gemelo Digital 3D / DEM / Esri)
├──> Firebase SDK Realtime DB (Sincronización Cloud + IndexedDB Offline)
│
[ Backend Analítico (Python / FastAPI) ] (En desarrollo)
│
├──> SciPy / NumPy (Procesamiento de Espectros FFT / PeakVue)
├──> Scikit-Learn / PyOD (Detección de Anomalías / Machine Learning)
│
[ Base de Datos Histórica y Despliegue ] (Planificado)
├──> InfluxDB / TimescaleDB (Telemetría de Series Temporales)
└──> Docker & Docker Compose (Despliegue On-Premise en Faena)


## 2. Decisiones de Diseño Clave
- **Sin Frameworks Pesados en Cliente:** Se prescinde de React o Vue para evitar sobrecargas de compilación, utilizando módulos nativos ES6+ puros. Esto garantiza un rendimiento fluido en tablets de terreno y equipos de sala de control.
- **Persistencia Local Offline (PWA):** Aprovechamiento de la sincronización nativa de Firebase combinada con Service Workers, permitiendo recopilar rutas de vibración y alertas sin cobertura de red.
- **Normas Industriales Incorporadas:** Los umbrales de severidad y diagnóstico automatizado de spots se rigen estrictamente bajo la norma **ISO 20816-3**.