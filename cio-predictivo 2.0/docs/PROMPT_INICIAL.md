# CONTEXTO MAESTRO: CIO Predictivo 2.0 (Mina Los Colorados)

## 1. Propósito de la web
Plataforma web industrial de monitoreo de condición (CBM) y gestión de activos críticos para faena minera. Su objetivo principal es centralizar la inspección de equipos (correas transportadoras, reductores, poleas), calcular severidades bajo norma ISO 20816-3, integrar avisos con SAP PM y proveer un gemelo digital geoespacial interactivo en 3D para la toma de decisiones en terreno, incluso en condiciones de baja conectividad.

## 2. Stack Tecnológico Actual
- **Frontend / Cliente:** Stack nativo moderno puro sin frameworks pesados -> HTML5, CSS Moderno (Variables, Flexbox, Grid, Glassmorphism oscuro), JavaScript Moderno (ES6+, módulos, Async/Await).
- **Base de Datos y Sincronización:** Firebase Realtime Database con autenticación por roles y persistencia local offline (IndexedDB / PWA Service Workers).
- **Gemelo Digital & Mapas:** MapLibre GL JS integrado con capas satelitales (Esri), relieve DEM y pines dinámicos filtrables por cota/nivel y área.
- **Arquitectura Híbrida en Desarrollo:** Futuros microservicios analíticos en **Python (FastAPI + SciPy)** para procesamiento de espectros FFT, análisis de envolventes y Machine Learning (`Isolation Forest`).

## 3. Estado Actual del Sistema (Lo que ya funciona)
- **Autenticación y Roles:** Control estricto de usuarios (Administrador, Supervisor Planta, Analista CBM, Inspector Terreno).
- **Gemelo Digital 3D:** Mapa interactivo con rotación de cámara, filtrado por niveles, tooltips flotantes sin fondos blancos y redirección automática al expediente del equipo.
- **Expedientes y Puntos Cinemáticos:** Gestión modular de componentes con eliminación en cascada de spots y cálculo dinámico de RMS, temperatura y Factor de Cresta (`FC+`).
- **Gestión de Alertas de Terreno:** Bandeja reactiva con soporte para evidencias fotográficas y geolocalización rápida en el mapa 3D.
- **Módulo de Reportes:** Generadores de informes diarios y visualizador PDF integrado en modal interno.

## 4. Siguientes Pasos de Desarrollo
1. Consolidación del **Modo Offline PWA** con cola de sincronización automática para zonas sin señal en faena.
2. Implementación del backend en **Python (FastAPI)** para automatización de análisis de vibraciones.
3. Contenerización completa de la plataforma con **Docker y Docker Compose** para despliegue *on-premise*.