# Reporte Técnico: CIO Predictivo 2.0 (Planta Mina Los Colorados)

## 1. Propósito de la web

Plataforma web industrial de monitoreo de condición (CBM) y gestión de activos
críticos para faena minera. Su objetivo principal es centralizar la inspección de
equipos (correas transportadoras, reductores, poleas), calcular severidades bajo
norma ISO 20816-3, integrar avisos con SAP PM y proveer un gemelo digital
geoespacial interactivo en 3D para la toma de decisiones en terreno, incluso en
condiciones de baja conectividad.

## 2. Estructura de archivos actual

```
Dashboard-Vulnerabilidades-MLC/
├── .github/workflows/ci.yml       # CI/CD (typecheck, tests, build, Docker)
├── .gitignore
├── README.md                      # Quickstart, credenciales, variables, API
└── cio-predictivo 2.0/
    ├── index.html                 # Dashboard principal (SPA)
    ├── terreno.html               # App de terreno (PWA offline)
    ├── vite.config.ts             # Entradas múltiples, base './'
    ├── package.json               # Scripts: dev, build, typecheck, test
    ├── docker-compose.yml         # Orquestación Docker
    ├── Dockerfile                 # Frontend (Vite + Nginx)
    ├── docker/nginx.conf
    ├── .dockerignore
    ├── css/main.css
    ├── public/                    # sw.js, manifest.json, assets/img/logo-cpf.png
    ├── src/
    │   ├── main.ts                # Orquestador SPA
    │   ├── core/                  # auth, domain, offline, pdf, theme, types, utils
    │   ├── modules/               # activos, analisis, avisos, layout, pms, terreno, triage, usuarios
    │   └── tenants/               # Configuración por faena
    ├── backend/
    │   ├── main.py                # FastAPI (endpoints, middleware, auth)
    │   ├── persistencia/          # Repositorios + migraciones
    │   ├── alembic/               # Migraciones de esquema (env.py, versions/)
    │   ├── alembic.ini
    │   ├── database.py            # Fachada de compatibilidad
    │   ├── security.py            # PBKDF2 + JWT
    │   ├── analizador_fft.py      # FFT + Isolation Forest + ISO 20816-3
    │   ├── migrar_datos.py        # Migración manual autenticada
    │   ├── cambiar_clave.py       # Rotación/recuperación de contraseña
    │   ├── backup_db.py           # Respaldo consistente + rotación
    │   ├── requirements.txt
    │   ├── requirements-dev.txt   # pytest, httpx2, ruff
    │   ├── .env.example
    │   ├── Dockerfile
    │   ├── .dockerignore
    │   ├── pytest.ini
    │   ├── conftest.py
    │   └── tests/                 # 48 pruebas (pytest)
    └── docs/
        ├── ARQUITECTURA.md
        ├── CONTEXTO.md
        ├── CHANGELOG.md
        ├── MANUAL_TERRENO.md
        └── README.md
```

## 3. Estado del CSS y Diseño

- Estilo visual: Glassmorphism industrial oscuro optimizado para salas de control
  y dispositivos móviles en faena.
- Layouts: CSS Grid y Flexbox para paneles adaptativos, tablas interactivas de
  puntos cinemáticos y modulares.
- Sistema de semaforización ISO (Zonas A, B, C, D) con clases dinámicas y
  efectos pulsantes para alertas críticas.
- Popups personalizados para MapLibre GL JS adaptados al gemelo digital.
- Interfaz responsive y adaptable a modo Kiosko de pantalla completa.

## 4. Estado del Frontend (TypeScript)

- Arquitectura de modulación: ES6+ Modules con carga asíncrona (Async/Await) y
  eventos centralizados.
- Autenticación: JWT contra backend FastAPI, permisos por rol (ADMINISTRADOR,
  SUPERVISOR, ANALISTA CBM, OPERADOR TERRENO). Sesión en cookies HttpOnly; en
  `localStorage` solo se guardan metadatos y expiración (`cio_session_v2`).
- Gemelo Digital 3D: integración con MapLibre GL JS, mapas satelitales (Esri),
  relieve DEM y control de cámaras con pines dinámicos filtrables por cota/nivel
  y área.
- Expedientes y puntos cinemáticos: gestión interactiva de componentes con
  eliminación en cascada y cálculo dinámico de severidades RMS, temperatura y
  Factor de Cresta.
- Reportes y visor PDF: generación integrada de reportes en PDF con visor
  interactivo en modal.
- Modo offline / PWA: IndexedDB (Outbox) + Service Worker (app shell, tiles
  cache-first, API sin caché) con sincronización automática.
- Gestión de usuarios: modal de administración (solo ADMINISTRADOR).
- Sanitización HTML centralizada en `src/core/utils/sanitizar.ts`.

## 5. Estado del Backend (Python / FastAPI)

- Persistencia: SQLite (`users`, `cbm_records`, `audit_log`, `refresh_tokens`) con
  modo WAL y migraciones versionadas con Alembic.
- Autenticación: JWT HS256 (acceso) + refresh tokens opacos con rotación y
  revocación, servidos como cookies HttpOnly (`SameSite`, `Secure` opcional);
  contraseñas PBKDF2-SHA256; rate limit por IP.
- Autorización: por roles en endpoints de gestión, análisis y auditoría.
- Análisis: FFT + Isolation Forest + evaluación ISO 20816-3, gráfico PNG base64.
- Migración inicial automática desde `firebase_data.json` (solo si BD vacía).
- Respaldos: script CLI y endpoint on-demand con rotación.
- Seguridad: CORS configurable, cabeceras HTTP (CSP, HSTS opcional, etc.).
- Documentación interactiva: `/api/docs` (Swagger) y `/api/redoc`.

## 6. Integraciones

- **SAP PM:** nomenclatura de avisos espectrales y semanas SAP.
- **MapLibre GL JS + Esri:** gemelo digital 3D y tiles satelitales.
- **jsPDF:** exportación de expedientes y reportes.

## 7. Pruebas y calidad

- Frontend: Vitest + jsdom (21 pruebas de dominio y Outbox).
- Backend: pytest (61 pruebas de health, auth, cookies, refresh tokens, CBM,
  roles, seguridad, migraciones, backups).
- CI/CD: GitHub Actions (typecheck, tests, build, Docker).
- Linting/formatting: Ruff (backend), ESLint + Prettier (frontend), pre-commit hooks.

## 8. Despliegue

- Desarrollo: `npm run dev` (Vite, puerto 5173) + `uvicorn main:app` (puerto 8000).
- Producción: Docker Compose (`docker compose up -d --build`) con volumen
  persistente para la BD.
- Variables de entorno documentadas en `backend/.env.example`.

## 9. Siguientes pasos recomendados

1. Refactor de `window.*` globals hacia imports directos / event bus tipado.
2. Precaching de Workbox y ajustes finales de PWA.
3. Paginación en tablas grandes (catastro, auditoría).
4. Tests E2E (Playwright) para flujos críticos.