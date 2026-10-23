# CONTEXTO MAESTRO: CIO Predictivo 2.0 (Mina Los Colorados)

## 1. Propósito de la web
Plataforma web industrial de monitoreo de condición (CBM) y gestión de activos críticos para faena minera. Su objetivo principal es centralizar la inspección de equipos (correas transportadoras, reductores, poleas), calcular severidades bajo norma ISO 20816-3, integrar avisos con SAP PM y proveer un gemelo digital geoespacial interactivo en 3D para la toma de decisiones en terreno, incluso en condiciones de baja conectividad, respaldado por analítica avanzada, MLOps y resiliencia offline.

## 2. Stack Tecnológico Actual y Arquitectura
- **Frontend / Cliente:** Stack nativo moderno puro sin frameworks pesados -> HTML5, CSS Moderno (Variables, Flexbox, Grid, Glassmorphism oscuro), JavaScript Moderno (ES6+, módulos, Async/Await), Chart.js para tendencias múltiples.
- **Base de Datos y Sincronización:** Firebase Realtime Database con autenticación por roles, persistencia local offline (IndexedDB / PWA Service Workers bajo patrón *Outbox*) y reglas de seguridad segmentadas.
- **Gemelo Digital & Mapas:** MapLibre GL JS integrado con capas satelitales (Esri), relieve DEM y pines dinámicos filtrables por cota/nivel, área y geofencing industrial.
- **Backend Analítico e Ingesta Híbrida (Python & FastAPI):**
  - **FastAPI & Pydantic:** Microservicio REST con validación estricta de esquemas, resiliencia de conexión offline y logging estructurado.
  - **SciPy & NumPy:** Procesamiento de señales, Transformada Rápida de Fourier (FFT) vectorizada, filtrado y extracción de picos espectrales dominantes.
  - **Scikit-Learn (Isolation Forest):** Detección de anomalías no supervisada y calibración adaptativa basada en la línea base histórica de Firebase.
  - **Matplotlib (Offscreen):** Generación de gráficos espectrales FFT en alta resolución (Retina 2x) codificados en Base64 para visualización web y reportes PDF.

## 3. Estado Actual del Sistema (Lo que ya funciona)
- **Autenticación y Roles:** Control estricto de usuarios (Administrador, Supervisor Planta, Analista CBM, Inspector Terreno).
- **Gemelo Digital 3D:** Mapa interactivo con rotación de cámara, filtrado por niveles, tooltips flotantes sin fondos blancos y redirección automática al expediente del equipo.
- **Expedientes y Puntos Cinemáticos:** Gestión modular de componentes con eliminación en cascada de spots y cálculo dinámico de RMS, temperatura y Factor de Cresta (`FC+`).
- **Analítica Híbrida PWA ⇄ Python:** Indicador de estado en línea/offline del servidor FastAPI, análisis automatizado de rutas de terreno con manejo de excepciones y visualización de diagnósticos expertos.
- **Gestión de Alertas y Reportes:** Bandeja reactiva con soporte para evidencias multimedia, bitácora cruzada PMS/CBM con trazabilidad de avisos SAP PM y generadores de informes PDF diarios/espectrales en alta resolución (jsPDF).

## 4. Siguientes Pasos y Roadmap de Futuras Mejoras (Inspirado en Código Abierto / Industrial Open Source)
1. **Modo Offline PWA Avanzado:** Cola de sincronización local basada en IndexedDB con reordenamiento por lotes para asegurar la continuidad operacional completa en zonas de faena sin conectividad de red.
2. **Model Cards & MLOps:** Documentación y versionado de hiperparámetros para los modelos de Machine Learning, incorporando endpoints de metadatos de modelos.
3. **Descomposición Modal de Señales (EMD / VMD):** Integración de algoritmos avanzados en Python para separar componentes modulares ocultos en ruidos mecánicos complejos.
4. **Contenerización y Despliegue On-Premise:** Empaquetado completo de la arquitectura mediante Docker y Docker Compose para su ejecución directa en servidores de faena minera.
5. **Predicción de Vida Residual (RUL) y Automatización Avanzada:** Evolución de la regresión lineal actual hacia modelos de degradación acumulada y notificaciones inteligentes sincronizadas con SAP PM.