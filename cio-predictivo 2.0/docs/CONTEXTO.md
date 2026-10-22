Reporte Técnico: CIO Predictivo 2.0 (Planta Mina Los Colorados)
1. Propósito de la web
Plataforma web industrial de monitoreo de condición (CBM) y gestión de activos críticos para faena minera. Su objetivo principal es centralizar la inspección de equipos (correas transportadoras, reductores, poleas), calcular severidades bajo norma ISO 20816-3, integrar avisos con SAP PM y proveer un gemelo digital geoespacial interactivo en 3D para la toma de decisiones en terreno, incluso en condiciones de baja conectividad.

2. Estructura de archivos actual
index.html: Página principal y contenedor de vistas SPA (Single Page Application).

database.rules.json: Reglas de seguridad, validación de esquemas e indexación de Firebase.

css/: Hojas de estilo modulares con diseño industrial Glassmorphism y temas oscuros.

js/

app.js: Módulo principal de inicialización, autenticación, gestión de mapas y rutas reactivas.

core/: Configuración centralizada de Firebase (firebase-config.js) y plantillas PDF corporativas (pdf-plantilla.js).

ui/: Módulos de interfaz de usuario (expediente.js, pms.js, sidebar.js, triage.js, analisis.js).

domain/: Lógica de negocio y catálogos de plantas (plantillas.js).

3. Estado del CSS y Diseño
Estilo visual: Glassmorphism industrial oscuro optimizado para salas de control y dispositivos móviles en faena.

Layouts: Uso intensivo de CSS Grid y Flexbox para paneles adaptativos, tablas interactivas de puntos cinemáticos y modulares.

Componentes visuales:

Sistema de semaforización ISO (Zonas A, B, C, D) con clases dinámicas y efectos pulsantes para alertas críticas.

Popups personalizados para MapLibre GL JS adaptados al gemelo digital sin interferir con los marcadores geográficos.

Interfaz responsive y adaptable a modo Kiosko de pantalla completa.

4. Estado del JavaScript
Arquitectura de modulación: ES6+ Modules con carga asíncrona (Async/Await) y eventos centralizados.

Firebase & Base de Datos: Conexión en tiempo real (Database Realtime) con control estricto de roles de usuario (Administrador, Supervisor, Analista, Inspector).

Gemelo Digital 3D: Integración avanzada con MapLibre GL JS, mapas satelitales (Esri), relieve DEM y control de cámaras (pitch/bearing) con pines dinámicos filtrables por cota/nivel y área.

Expedientes y Puntos Cinemáticos: Gestión interactiva de componentes (motores, reductores, pares de poleas LI/LD) con eliminación en cascada inteligente y cálculo dinámico de severidades RMS, temperatura y Factor de Cresta (FC+).

Reportes y Visor PDF: Generación integrada de reportes diarios en PDF listos para SAP PM con visor interactivo en modal interno.

5. Siguientes pasos e integración híbrida recomendada
Modo Offline & Sincronización PWA: Habilitar la persistencia local de Firebase (enablePersistence()) junto con Service Workers avanzados para permitir el ingreso de rutas de terreno sin conexión y su sincronización automática al recuperar señal.

Backend Analítico en Python (FastAPI + SciPy): Diseñar microservicios en Python para automatizar Transformadas Rápidas de Fourier (FFT), envolventes y detección de anomalías mediante Machine Learning no supervisado (Isolation Forest / PyOD).

Series Temporales: Integrar una base de datos optimizada para telemetría histórica (ej. InfluxDB o TimescaleDB) para mejorar la renderización de las tendencias de vibración a largo plazo.

Contenerización: Desplegar el sistema completo (Frontend PWA + Backend Python + BD) mediante Docker y Docker Compose para instalaciones on-premise seguras en Mina Los Colorados.