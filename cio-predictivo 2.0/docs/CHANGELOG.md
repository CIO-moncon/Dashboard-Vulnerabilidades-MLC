# Historial de Cambios (Changelog)

Todas las modificaciones notables de la plataforma **CIO Predictivo 2.0** serán documentadas en este archivo.

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