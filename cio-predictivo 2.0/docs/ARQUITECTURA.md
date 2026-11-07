# 🏗️ Arquitectura del Sistema — CIO Predictivo 2.0

Plataforma web industrial de monitoreo de condición (CBM) y gestión de activos
críticos para faena minera. Centraliza la inspección de equipos (correas
transportadoras, reductores, poleas), calcula severidades bajo norma ISO 20816-3,
integra avisos con SAP PM y provee un gemelo digital geoespacial interactivo en
3D, operando incluso con baja conectividad.

## 1. Vista general

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente (PWA)                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ index.html   │  │ terreno.html │  │ Service Worker   │  │
│  │ (dashboard)  │  │ (offline)    │  │ (app shell +     │  │
│  │              │  │              │  │  tiles SWR)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────┴─────────────────┴────────────────────┴─────────┐  │
│  │  Vite + TypeScript (ES modules nativos, sin framework)│  │
│  │  IndexedDB Outbox · SyncManager · AuthService (JWT)   │  │
│  └──────────────────────────┬────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTPS /api/*
┌──────────────────────────────┼──────────────────────────────┐
│  Backend (FastAPI + Uvicorn) │                              │
│  ┌───────────────────────────┴──────────────────────────┐   │
│  │ Routers: auth · users · cbm · análisis FFT · auditoría│   │
│  │ Middleware: CORS · cabeceras de seguridad · rate limit│   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                           │
│  ┌──────────────┴──────────┐  ┌─────────────────────────┐  │
│  │ SQLite (cio_predictivo.db)│  │ analizador_fft.py     │  │
│  │ users · cbm_records ·    │  │ NumPy · SciPy ·       │  │
│  │ audit_log                │  │ scikit-learn · mpl    │  │
│  └──────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 2. Capas del frontend

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Entradas | `index.html`, `terreno.html` | Shell SPA y app de terreno (PWA) |
| Orquestador | `src/main.ts` | Inicialización, login, registro de módulos, exposición de `window.*` |
| Core | `src/core/{auth, domain, offline, pdf, theme, types, utils}` | Autenticación JWT, dominio ISO 20816-3, Outbox IndexedDB, sincronización, PDF, theming, sanitización |
| Módulos | `src/modules/{activos, analisis, avisos, layout, pms, terreno, triage, usuarios}` | Vistas y lógica de negocio por dominio |
| Tenants | `src/tenants/los-colorados.config.ts` | Configuración por faena (tema, catálogo) |

## 3. Capas del backend

| Módulo | Responsabilidad |
|---|---|
| `main.py` | App FastAPI, middleware (CORS, seguridad, rate limit), endpoints REST, modelos Pydantic |
| `persistencia/` | Repositorios por agregado: `RepositorioUsuarios`, `RepositorioCbm`, `RepositorioAuditoria`; conexión y esquema en `persistencia/conexion.py` |
| `alembic/` | Migraciones de esquema versionadas (`env.py`, `versions/0001_esquema_inicial.py`) |
| `database.py` | Fachada de compatibilidad con la API histórica de funciones sueltas |
| `security.py` | Hash PBKDF2-SHA256, JWT HS256 (PyJWT) y hash SHA-256 de refresh tokens opacos |
| `analizador_fft.py` | FFT, detección de picos, Isolation Forest, evaluación ISO 20816-3, renderizado PNG base64 |
| `migrar_datos.py` | Migración manual autenticada contra el API |
| `cambiar_clave.py` | Rotación/recuperación de contraseña por CLI |
| `backup_db.py` | Respaldo consistente (API SQLite + WAL checkpoint) con rotación y compresión |

## 4. Decisiones de diseño clave

- **Sin frameworks pesados en cliente:** se prescinde de React/Vue/Angular para evitar sobrecargas de compilación y garantizar rendimiento fluido en tablets de terreno y sala de control. Se usan módulos ES6+ nativos.
- **Persistencia local offline (PWA):** IndexedDB (Outbox) + Service Worker (app shell, tiles cache-first, API sin caché) permiten operar sin red y sincronizar al recuperar señal.
- **Autenticación real:** JWT HS256 firmado por el backend; contraseñas hasheadas con PBKDF2-SHA256. Roles: ADMINISTRADOR, SUPERVISOR, ANALISTA CBM, OPERADOR TERRENO. Sesiones largas con **refresh tokens opacos** (rotación y revocación en logout/cambio de contraseña).
- **Persistencia por repositorios:** `persistencia/` separa conexión/esquema de los repositorios de usuarios, CBM y auditoría. Cada repositorio acepta una fábrica de conexiones, lo que permite inyectar una base temporal en tests. `database.py` se mantiene solo como fachada de compatibilidad.
- **Migraciones versionadas (Alembic):** el esquema evoluciona mediante revisiones en `alembic/versions/`; `inicializar_db()` aplica `alembic upgrade head` al arranque y adopta bases anteriores a Alembic con `stamp head`.
- **Multi-tenant por tenant_id:** filtrado en todas las consultas; el tenant del token debe coincidir con `X-Tenant-ID`.
- **Normas industriales:** severidad y diagnóstico bajo ISO 20816-3 (zonas A/B/C/D).
- **Despliegue on-premise:** Docker + docker-compose, base SQLite persistente en volumen, HTTPS opcional con HSTS.

## 5. Flujos principales

1. **Login:** `AuthService.login()` → `POST /api/auth/login` → JWT + refresh token + usuario. Sesión persistida en `localStorage` (`cio_session_v2`); expiración validada en cliente.
2. **Operación de terreno:** `SyncManager.despacharOEncolar()` intenta envío directo; si falla, encola en IndexedDB (Outbox) y sincroniza cada 60 s / al recuperar red / al volver a primer plano.
3. **Análisis de vibración:** `POST /api/analizar-vibracion` → FFT + Isolation Forest + ISO 20816-3 → gráfico PNG base64.
4. **Gestión de usuarios:** solo ADMINISTRADOR vía `GET/POST/PUT /api/users` y reset de contraseña.
5. **Respaldos:** script CLI o `POST /api/admin/backup` con rotación automática.

## 6. Estado de la documentación

- `docs/README.md`: quickstart actualizado.
- `docs/CHANGELOG.md`: historial hasta v2.5.1.
- `docs/ARQUITECTURA.md` y `docs/CONTEXTO.md`: **actualizados en esta revisión** para reflejar la arquitectura real (sin referencias a Firebase/InfluxDB).

## 7. Deuda técnica conocida (ver reporte de auditoría)

- Acoplamiento inter-módulo vía `window.*` globals (~50).
- Duplicación histórica de `escaparHTML` (centralizada en v2.5.1).
- JWT en `localStorage` (mitigado por CSP y sanitización; migración a cookies HttpOnly pendiente — el refresh token ya permite sesiones largas sin re-login).