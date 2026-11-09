# Historial de Cambios (Changelog)

Todas las modificaciones notables de la plataforma **CIO Predictivo 2.0** serán documentadas en este archivo.

## [3.5.0] - 2026-11-08
### Funcionalidad
- **Trazabilidad total S/M**: toda inspección queda registrada, incluso cuando un punto no se mide. Un punto 100% en blanco ya no se omite al guardar: se registra como **S/M** y exige un **motivo obligatorio** (punto parcial y total). Sin motivo, el guardado se bloquea indicando el punto afectado y las magnitudes faltantes.
- **Fecha automática**: la fecha de medición sigue siendo de solo lectura y se auto-rellena al digitar el primer valor; si el operador no la toca, el guardado usa la marca de tiempo del momento del registro. Se añade `fechaUltimaInspeccion`, que se actualiza en toda inspección aunque no haya mediciones, mientras `fechaUltima` solo cambia cuando hay al menos una magnitud medida.
- **Preservación de "Anterior"**: al dejar una magnitud en blanco, el valor previo se conserva para no perder la referencia histórica; solo se actualizan las magnitudes realmente medidas. El historial guarda `magnitudesSinMedicion`, `motivo`, `usuario` y `rol` en cada registro.
- **Motivo masivo**: nueva barra en la matriz para seleccionar un motivo y aplicarlo de una vez a todas las filas con campos vacíos, reduciendo la carga operativa. Cada fila muestra además el último motivo registrado como referencia.
- **Historial enriquecido**: el modal muestra S/M por magnitud, motivo legible (incluido "Otro" con detalle), responsable/rol y el conteo de registros (mediciones y S/M). Los registros legacy sin motivo se identifican como "S/M sin motivo registrado".
- **PDF con trazabilidad**: el reporte incluye todos los puntos de la matriz (también los 100% S/M), muestra **S/M** por magnitud según flags, etiqueta la condición como **S/M** cuando no hay ninguna medición y agrega la sección **"TRAZABILIDAD DE PUNTOS SIN MEDICIÓN (S/M)"** con punto, componente, magnitudes faltantes, motivo, responsable y fecha. Los datos anteriores a 3.5.0 se contabilizan como deuda de trazabilidad.
- **Módulo puro y pruebas**: reglas y catálogo de motivos en `src/core/cbm/trazabilidadSm.ts` (reexportado por el expediente), con `trazabilidadSm.test.ts` (11 casos: magnitudes faltantes, normalización de "otro", validación total/parcial/completa). Total frontend: **50 tests**.
- **Orden cinemático lógico**: nuevo módulo `src/core/domain/ordenCinematica.ts` (con `ordenCinematica.test.ts`, 3 casos) que clasifica cada punto en Motor → Reductor → Poleas → Otros y ordena con números naturales (G1, G2, ..., G10) y lados (NDE/LI antes de DE/LD). La matriz y el PDF ahora muestran las filas agrupadas con encabezados por componente, en lugar del orden alfabético de las claves.

### Correcciones
- **Historial legacy en formato objeto**: las bases importadas desde Firebase pueden traer `spot.historial` como objeto indexado en vez de arreglo, lo que rompía el guardado con `spot.historial.push is not a function` y desordenaba el historial. Se añadió `normalizarHistorial()`, usado por la matriz, el modal, el contador, la tendencia y el guardado; convierte a arreglo y ordena por timestamp numérico (ignorando valores no numéricos). Con esto MHPRUEBA pudo guardar S/M sin errores y el historial quedó consistente.

## [3.4.0] - 2026-11-08
### Funcionalidad
- **Fecha de medición no editable**: el campo "Fecha Medición" del expediente ahora es de solo lectura y se auto-rellena con la marca de tiempo en que se empiezan a ingresar los datos (no puede ser alterada por el usuario).
- **S/M (Sin Medición) con trazabilidad**: cuando un punto se deja con campos en blanco, la matriz, el historial y el PDF muestran **S/M** en lugar de "--". Al guardar, el sistema exige seleccionar un **motivo** de no medición (opciones: Sin acceso, Equipo de medición F/S, Trabajos cruzados, Área restringida, Condición climática, Punto no accesible, No programado, Otro con detalle libre). El motivo se persiste en el catastro y en el registro histórico, y se incluye en el reporte cuando corresponde.
- **Validación en guardado**: si un punto tiene campos en blanco y no se indicó motivo, el guardado se bloquea con un aviso indicando el punto afectado.

## [3.3.0] - 2026-11-08
### Funcionalidad
- **Observaciones y recomendaciones automáticas CBM**: nuevo motor puro `src/core/cbm/observaciones.ts` que clasifica cada punto (MOTOR, REDUCTOR, POLEA, RODAMIENTO u OTRO) y genera hallazgos en el expediente y en el PDF a partir de los niveles ISO ya calculados:
  - **RMS en Zona D** → observación **ROJA** con detalle de informe espectral adaptado al componente (motor: 1X/2X, barras de rotor, excentricidad; reductor: GMF, bandas laterales, backlash; polea: BPFO/BPFI/BSF/FTF y alineación) y aviso SAP de prioridad **Alta** a 7 días.
  - **RMS en Zona C** → observación **NARANJA** de seguimiento espectral a 30 días (sin aviso SAP).
  - **Polea con temperatura o FC+ en Zona B** → observación **AMARILLA**: "Acotar medición a 15 días" (sin aviso SAP).
  - **Temperatura o FC+ en Zona C/D** → observación **NARANJA/ROJA** con preventiva en ambos rodamientos (motor DE/NDE, reductor entrada/salida, poleas mando/libre o rodamientos del punto) y evaluación de cambio si el desgaste es severo; aviso SAP a 15/7 días.
- **Panel de observaciones en el expediente**: nueva sección "Observaciones y recomendaciones automáticas" con contador, severidad, componente, plazo y recomendación. Se **recalcula en vivo al digitar** y permite **generar el aviso SAP** desde la observación (con marca "Aviso SAP generado" si ya existe uno vigente).
- **Módulo "Avisos CBM SAP"**: nuevo `src/modules/avisos/avisosCbm.ts` y botón en la topbar. Persiste los avisos en el backend como `aviso_cbm:<id>` (con caché local `cio_avisos_cbm_v1` y cola Outbox si no hay red), deduplica avisos activos por observación y gestiona N° SAP, prioridad, estado **Pendiente / Emitido / Realizado / No realizado**, observación de cierre y acciones rápidas ✓/✕. Un aviso "No realizado" permite regenerar la observación. Incluye filtros por estado, búsqueda y acceso directo desde el expediente con el TAG precargado.
- **PDF con observaciones**: el reporte del expediente incorpora la sección "OBSERVACIONES Y RECOMENDACIONES AUTOMÁTICAS" con barra de color por severidad, detalle, recomendación y plazo, con control de saltos de página para no solaparse con el pie corporativo.
- Pruebas nuevas del motor de observaciones (`observaciones.test.ts`): 10 casos (clasificación y reglas). Total frontend: **35 tests**.

## [3.2.0] - 2026-11-08
### Funcionalidad
- **Historial de registros en el expediente (modal de consulta)**: nuevo botón "Historial (N)" en la cabecera del expediente que abre un **modal** con las últimas 12 mediciones del activo (Fecha, Punto, RMS, Temp, FC+, Fuente), ordenadas de más reciente a más antigua y con el RMS coloreado según la zona ISO 20816-3. El historial ya no se muestra inline en el expediente; se consulta a demanda (botón + cerrar con × o clic fuera). El contador del botón se actualiza al guardar.
- **Flujo de guardado de mediciones**: al pulsar "Guardar Mediciones", la medición digitada pasa a la columna "Ant." (última registrada) y al historial, y los campos "Actuales" quedan **vacíos** listos para la próxima medición. Si un campo se deja vacío, se conserva el valor anterior de ese campo. Las mediciones "actuales" previas sin guardar (p. ej. datos iniciales) se preservan en el historial sin duplicarlas.
- **Indicador de tendencia al digitar**: cada campo "Actual" (RMS, Temp, FC+) muestra en vivo, bajo el input, un símbolo frente al último registro: **▲ +Δ** (aumentó, rojo), **▼ -Δ** (disminuyó, verde) o **= se mantuvo** (gris), con umbral de tolerancia por magnitud (0.05 para RMS/FC+, 0.5 °C para temperatura).
- **PDF del expediente con formato corporativo único**: la exportación dejó de ser una captura de pantalla y ahora se genera de forma nativa con jsPDF usando la plantilla compartida (`dibujarCabeceraCorporativa` / `dibujarPiePaginaCorporativo`), por lo que incluye el **logotipo de la empresa**, la ficha del activo y el pie con paginación iguales al resto de los reportes. La tabla muestra **Punto, Componente, Fecha, RMS, Temp, FC+ y condición CBM**, priorizando lo digitado en "Actuales"; si esos campos están vacíos (p. ej. después de guardar), usa la **última medición registrada** para que el reporte nunca salga sin datos. RMS, temperatura y FC+ se imprimen con el **color de su norma** (ISO 20816-3, ISO 18434-1 e ISO 13373-2) sobre fondo tenue, con leyenda de zonas A/B/C/D.
- **Condición CBM coherente con los datos**: el badge del encabezado y la columna "CONDICIÓN CBM" se calculan como la **peor zona** entre RMS, temperatura y FC+ (A/B/C/D), reutilizando los mismos colores ISO de la tabla. Sin mediciones muestra "SIN MEDICIÓN".
- **Fechas normalizadas**: las fechas del PDF, del historial y de la columna "Ant." se muestran en formato uniforme `dd-mm-aaaa hh:mm`, centradas en su columna, evitando desbordes con formatos largos de `toLocaleString`.

## [3.1.0] - 2026-11-08
### PWA / Offline
- **Precache con Workbox**: integrado `vite-plugin-pwa` (`injectManifest`) sobre el service worker existente. En cada build se genera el manifiesto de precache (`self.__WB_MANIFEST`) con revisiones por hash: bundles JS/CSS, íconos y `manifest.json` (6 entradas, ~395 KiB). Arranque offline instantáneo tras la instalación.
- El SW conserva sus estrategias: navegación network-first con fallback al shell, assets SWR, tiles cache-first con límite, API sin caché.
- `cleanupOutdatedCaches()` de Workbox gestiona los precaches obsoletos; la purga manual ahora solo limpia cachés propias (`cio-*`) para no interferir con las de Workbox.
- El HTML se precachea aparte (`ASSETS_CORE`) para preservar la estrategia network-first de navegación.
- El registro manual del SW (`register('./sw.js')`) se mantiene en `index.html` y `terreno.html`.

## [3.0.0] - 2026-11-08
### Refactor (desacoplamiento de `window.*`)
- Eliminados los ~50 globales `window.*` que acoplaban los módulos del frontend.
- Nuevo registro tipado de comandos de UI (`src/core/app/comandos.ts`): los módulos registran sus comandos (`registrarComando`) y un único listener delegado despacha clic/input/change/keyup/submit mediante `data-accion` y `data-args` (JSON escapado con entidades HTML, decodificado por el parser del navegador). Llamadas programáticas vía `ejecutarComando`.
- Nuevo estado compartido (`src/core/app/estadoApp.ts`): `datosGlobalesEquipos` y `mapaActivo` dejaron de vivir en `window`; incluye suscripción a cambios del catastro (reemplaza al `CustomEvent('datosEquiposActualizados')`).
- Migrados los 12 módulos (main, sidebar, expediente, modalGestionEquipo, analisisAvanzado, controlAvisosEspectrales, pmsCore, triage, terrenoUI, gestionUsuarios, reportes, pdfPlantilla) y `terreno.html` a la nueva arquitectura. Se elimina `window.UI` y la exposición global de pdfPlantilla.
- Corregidos dos handlers muertos que apuntaban a funciones inexistentes: exportar PDF de tendencia (ahora muestra toast informativo) y auto-guardado de observaciones PMS (ahora guarda con debounce usando `debounceGuardado`).
- Nuevas pruebas unitarias del registro de comandos (`comandos.test.ts`): 4. Total frontend: 25.

## [2.9.0] - 2026-11-07
### Seguridad / Sesión
- Migración del JWT de `localStorage` a **cookies HttpOnly**: el backend ahora emite `cio_access_token` (`Path=/`, `SameSite=Lax`) y `cio_refresh_token` (`Path=/api/auth`, `SameSite=Strict`), ambas `HttpOnly` y con `Secure` opcional vía `CIO_COOKIE_SECURE`.
- `usuario_actual` lee el token desde la cookie con fallback a `Authorization: Bearer` (compatible con CLI/scripts/tests). `/api/auth/refresh` y `/api/auth/logout` aceptan el refresh token por cookie o por cuerpo.
- El logout limpia las cookies y revoca el refresh token; mitigación CSRF con `SameSite=Lax/Strict` y CORS con origen específico.
- Frontend: `AuthService` ya no persiste el token (solo metadatos + expiración), `getHeadersTenant` deja de enviar `Authorization`, y un **interceptor de fetch** renueva el access token antes de expirar y reintenta ante `401`.
- Nuevas pruebas de cookies (`tests/test_cookies.py`): 5. Total backend: 61.

## [2.8.0] - 2026-11-07
### Seguridad / Autenticación
- **Refresh tokens**: `POST /api/auth/refresh` emite un nuevo access token a cambio de un refresh token válido; `POST /api/auth/logout` revoca el token presentado. El login ahora devuelve `refresh_token` y `refresh_expires_in`.
- Rotación en cada uso (el token presentado se revoca y se emite uno nuevo) y revocación automática en cambio/restablecimiento de contraseña.
- Los refresh tokens son opacos (`secrets.token_urlsafe`), se almacenan solo como hash SHA-256 y viven en la nueva tabla `refresh_tokens` (migración Alembic `0002`).
- Nuevo repositorio `RepositorioRefreshTokens` y helpers `generar_token_opaco`/`hash_token` en `security.py`.
- Variable `CIO_REFRESH_HORAS` (vigencia, por defecto 720 h = 30 días) documentada en `.env.example`.
- Estrategia de adopción de bases legadas corregida: se sellan en `0001` y se aplica `0002` encima (antes se sellaba en `head`, omitiendo migraciones pendientes).
- Nuevas pruebas (`tests/test_refresh.py`): 8. Total backend: 56.

## [2.7.0] - 2026-11-07
### Migraciones y persistencia
- Integración de **Alembic** para migraciones de esquema versionadas: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako` y revisión inicial `0001_esquema_inicial`.
- `inicializar_db()` ahora aplica `alembic upgrade head` al arranque mediante `persistencia/migraciones.py::actualizar_esquema`. Detecta bases creadas antes de Alembic y las adopta con `stamp head`.
- `env.py` resuelve la URL SQLite desde `CIO_DB_PATH` y usa `render_as_batch` para futuras alteraciones de tabla en SQLite.
- Se añaden `alembic` y `SQLAlchemy` a `requirements.txt`.
- `crear_esquema` se conserva como espejo del DDL para bases temporales de test.
- Nuevas pruebas de migraciones (`tests/test_migraciones.py`): 3. Total backend: 48.

## [2.6.0] - 2026-11-07
### Refactor
- Nueva capa de persistencia `backend/persistencia/` con repositorios por agregado: `RepositorioUsuarios`, `RepositorioCbm`, `RepositorioAuditoria` y `RepositorioCbm.insertar_muchos` para la migración inicial.
- Cada repositorio acepta una fábrica de conexiones (`FabricaConexion`), lo que permite inyectar bases temporales en tests sin tocar la base real.
- `persistencia/conexion.py` centraliza conexión, esquema (`crear_esquema`), constantes y transacciones. Las conexiones ahora se cierran siempre (`conexion_db`), corrigiendo la fuga implícita del context manager de `sqlite3`.
- `database.py` queda como fachada de compatibilidad para scripts y tests existentes.
- `main.py`, `conftest.py`, tests y `cambiar_clave.py` usan la nueva API de repositorios.
- Nuevas pruebas unitarias de repositorios (`tests/test_repositorios.py`): 6 pruebas. Total backend: 45.

## [2.5.1] - 2026-11-07
### Refactor
- Centralización de `escaparHTML` en `src/core/utils/sanitizar.ts`. Eliminadas ~9 copias duplicadas en módulos (main, sidebar, notificaciones, expediente, modalGestionEquipo, controlAvisosEspectrales, pmsCore, triage, gestionUsuarios, terrenoUI). Única fuente de verdad para sanitización de texto en interpolaciones HTML.
- Linting y formato: Ruff (backend) con `ruff.toml`; ESLint 10 + typescript-eslint + Prettier (frontend) con `eslint.config.js` y `.prettierrc`. Scripts `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`. Pre-commit hooks (`.pre-commit-config.yaml`). Integrado en CI.
- Reescritura de `docs/ARQUITECTURA.md` y `docs/CONTEXTO.md` para reflejar la arquitectura real (FastAPI + SQLite + Vite, sin referencias a Firebase/InfluxDB/Live Server).
- Eliminación de código muerto: `database.rules.json` y `auditar_proyecto.py` (era de la era Firebase/JS).

## [2.5.0] - 2026-11-07
### Seguridad
- Autenticación real contra backend con JWT (HS256) y contraseñas hasheadas con PBKDF2-SHA256. Se elimina el login mock que aceptaba cualquier credencial como `ADMINISTRADOR`.
- Validación estricta de expiración del token en el frontend y cierre automático de sesión vencida.
- Rate limit en `/api/auth/login` (10 intentos fallidos por minuto por IP; los logins exitosos reinician el contador) y mensajes de error genéricos.
- Soporte opcional de `X-Forwarded-For` para el rate limit mediante `CIO_TRUST_PROXY`.
- CORS configurable por variable de entorno; el tenant del token debe coincidir con `X-Tenant-ID`.
- Autorización por roles en endpoints de gestión, análisis y auditoría.
- Endpoint `POST /api/auth/change-password` y script `backend/cambiar_clave.py` para rotar o recuperar credenciales.
- Middleware de cabeceras de seguridad HTTP (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS opcional).
- Gestión de usuarios: `GET/POST /api/users`, `PUT /api/users/{id}`, `POST /api/users/{id}/reset-password` (solo ADMINISTRADOR), con validación de roles, protección del último admin y auditoría. UI modal en el dashboard para administradores.
- Respaldos: `backend/backup_db.py` (backup consistente con API SQLite + WAL checkpoint + compresión + rotación) y endpoint `POST /api/admin/backup`.

### Backend y persistencia
- Backend FastAPI reescrito con persistencia **SQLite** (`users`, `cbm_records`, `audit_log`).
- Migración inicial automática desde `firebase_data.json` cuando la base está vacía.
- Endpoints idempotentes para catastro (`UPSERT`) y sincronización del Outbox con validación de tenant y `actionType`.
- Carga opcional de `backend/.env` mediante `python-dotenv`.
- Scripts de verificación y documentación de variables de entorno en `backend/.env.example`.
- `backend/migrar_datos.py` reescrito para autenticarse con JWT real (antes usaba un token mock inválido).

### Fiabilidad / Offline
- Cola Outbox: reintento de elementos `FALLIDO` y recuperación de `EN_PROCESO` huérfanos.
- Sincronización automática cada 60 s, al recuperar foco (`visibilitychange`) y al iniciar la app.
- Conteo real de pendientes por tenant en la app de terreno.
- Exportación de expediente PDF corregida (usa `generarPDFExpediente`).
- Service Worker reescrito (app shell + runtime SWR + tiles cache-first + API sin caché).

### Calidad e infraestructura
- Vitest + jsdom + fake-indexeddb con pruebas de dominio (ISO 20816-3), plantillas y Outbox.
- Tests del backend con pytest (health, auth, CBM, roles, sincronización Outbox): 22 pruebas.
- Corrección del renderizado FFT (colores `rgba(...)` inválidos en matplotlib 3.11).
- Scripts `typecheck`, `test` y `test:watch`.
- Build de Vite con entradas múltiples (`index.html`, `terreno.html`) y `base: './'`.
- `sw.js`, `manifest.json` y assets movidos a `public/` para incluirlos en `dist/`.
- `.gitignore` raíz y README con quickstart, credenciales iniciales y variables de entorno.
- Dockerización: `backend/Dockerfile`, `Dockerfile` (frontend multi-stage con Nginx), `docker-compose.yml`, `docker/nginx.conf` y `.dockerignore`.
- CI/CD con GitHub Actions (`.github/workflows/ci.yml`): typecheck, tests frontend/backend, build y construcción de imágenes Docker.

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