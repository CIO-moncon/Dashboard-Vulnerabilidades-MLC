# Historial de Cambios (Changelog)

Todas las modificaciones notables de la plataforma **CIO Predictivo 2.0** serán documentadas en este archivo.

## [2.4.0] - 2026-10-22
### Añadido
- Refactorización de popups en MapLibre GL JS con diseño Industrial Glassmorphism oscuro, eliminando conflictos visuales y superposiciones de coordenadas.
- Validación estricta para evitar duplicidad de etiquetas (Tags) en los marcadores interactivos del mapa 3D.
- Documentación del plan arquitectónico para integración con backend en Python (FastAPI + SciPy) y despliegue con Docker.

## [2.3.0] - 2026-10-15
### Añadido
- Módulo de gestión en cascada para puntos cinemáticos (spots) en los expedientes de equipos.
- Sistema de escucha reactiva global para badges de alertas en la barra lateral.
- Visor modal interno de documentos PDF para reportes de terreno y SAP PM.

## [2.2.0] - 2026-09-30
### Añadido
- Integración oficial de MapLibre GL JS con soporte para relieve DEM y control de perspectiva 3D/2D.
- Filtros dinámicos por cota/nivel de planta (`Nivel 1`, `Nivel 2`, etc.).