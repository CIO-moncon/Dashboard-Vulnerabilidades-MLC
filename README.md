# CIO Predictivo 2.0 — Dashboard de Vulnerabilidades MLC

Plataforma industrial de monitoreo de condición (CBM) para la **Mina Los Colorados**.
Combina un frontend **Vite + TypeScript** (PWA offline), un backend **FastAPI** con
persistencia **SQLite** y autenticación real por **JWT** con **refresh tokens** en
cookies **HttpOnly**.

> Estado: listo para despliegue on-premise. Requiere configuración de secretos y
> cambio de la contraseña inicial antes de exponerse en producción.

---

## Estructura del repositorio

```
Dashboard-Vulnerabilidades-MLC/
├─ .gitignore
├─ README.md
└─ cio-predictivo 2.0/
   ├─ index.html            # Dashboard principal
   ├─ terreno.html          # App de terreno (offline / PWA)
   ├─ src/                  # Código TypeScript
   ├─ public/               # sw.js, manifest.json, assets estáticos
   ├─ css/
   ├─ backend/              # FastAPI + SQLite
   │  ├─ main.py
   │  ├─ persistencia/      # Repositorios (usuarios, CBM, auditoría) + migraciones
   │  ├─ alembic/           # Migraciones de esquema (env.py, versions/)
   │  ├─ alembic.ini
   │  ├─ database.py        # Fachada de compatibilidad
   │  ├─ security.py
   │  ├─ analizador_fft.py
   │  ├─ requirements.txt
   │  └─ .env.example
   ├─ docs/
   ├─ vite.config.ts
   └─ package.json
```

---

## Requisitos

- **Node.js 20+** y npm.
- **Python 3.11+**.
- (Opcional) Un proxy inverso (Nginx/Caddy) para servir `dist/` y `/api` bajo el
  mismo dominio en producción.

---

## Inicio rápido

### 1. Backend (FastAPI + SQLite)

```powershell
cd "cio-predictivo 2.0/backend"

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt

# Configurar variables de entorno
Copy-Item .env.example .env
# Editar .env y definir como mínimo CIO_SECRET_KEY y CIO_ADMIN_PASSWORD

python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

El backend debe ejecutarse **desde la carpeta `backend/`**, porque importa
`database`, `security` y `analizador_fft` como módulos locales.

Verificación:

- Salud: <http://127.0.0.1:8000/api/health>
- Documentación interactiva: <http://127.0.0.1:8000/api/docs>

Al primer arranque se crea la base `backend/cio_predictivo.db` y el usuario
administrador inicial si la tabla `users` está vacía.

### 2. Frontend (Vite)

En otra terminal:

```powershell
cd "cio-predictivo 2.0"
npm install
npm run dev
```

Abrir <http://localhost:5173>. Vite redirige `/api` a `http://127.0.0.1:8000`.

---

## Credenciales iniciales

| Campo      | Valor                     |
| ---------- | ------------------------- |
| Email      | `admin@cpf.cl`            |
| Contraseña | `CambiarEstaClave123!`    |
| Rol        | `ADMINISTRADOR`           |

⚠️ **Cambie la contraseña antes de producción.** El administrador solo se crea si
la tabla `users` está vacía. Para definir otra desde el inicio, configure
`CIO_ADMIN_PASSWORD` en `.env` **antes** del primer arranque.

Si la base ya existe con la contraseña por defecto, use el endpoint
`POST /api/auth/change-password` (autenticado) o el script:

```powershell
cd "cio-predictivo 2.0/backend"
python cambiar_clave.py admin@cpf.cl "NuevaClaveSegura123!"
```

### Respaldos de la base de datos

Respaldo consistente (seguro con WAL activo) y rotación automática:

```powershell
cd "cio-predictivo 2.0/backend"
python backup_db.py                      # respaldo diario por defecto
python backup_db.py --compress --keep 30 # comprimido, conserva 30
```

También disponible on-demand vía `POST /api/admin/backup` (solo ADMINISTRADOR).
Programar con cron (Linux) o el Programador de tareas (Windows).

---

## Variables de entorno del backend

Copiar `backend/.env.example` a `backend/.env`. El backend carga ese archivo
automáticamente si `python-dotenv` está instalado (incluido en `requirements.txt`).

| Variable                | Por defecto                                              | Descripción |
| ----------------------- | -------------------------------------------------------- | ----------- |
| `CIO_SECRET_KEY`        | *(aleatoria temporal)*                                   | Clave de firma JWT. **Obligatoria** en producción, mínimo 32 caracteres. Si no se define, los tokens se invalidan al reiniciar. |
| `CIO_TOKEN_HORAS`       | `8`                                                      | Vigencia del token de acceso en horas. |
| `CIO_REFRESH_HORAS`     | `720`                                                    | Vigencia del refresh token en horas (30 días por defecto). |
| `CIO_COOKIE_SECURE`     | `0`                                                      | `1` para marcar las cookies de sesión con `Secure` (solo con HTTPS). |
| `CIO_ALLOWED_ORIGINS`   | `http://localhost:5173,http://127.0.0.1:5173`            | Orígenes CORS separados por coma. No usar `*` en producción. |
| `CIO_TRUST_PROXY`       | `0`                                                      | `1` para usar `X-Forwarded-For` en el rate limit de login (solo detrás de un proxy controlado). |
| `CIO_ENABLE_HSTS`       | `0`                                                      | `1` para enviar Strict-Transport-Security (solo con HTTPS en producción). |
| `CIO_BACKUP_DIR`        | `backend/backups`                                        | Directorio de respaldos (script y endpoint admin). |
| `CIO_BACKUP_KEEP`       | `14`                                                     | Cantidad de respaldos a conservar (rotación). |
| `CIO_TENANT_ID`         | `mina_los_colorados`                                     | Tenant por defecto de la instalación. |
| `CIO_DB_PATH`           | `backend/cio_predictivo.db`                              | Ruta del archivo SQLite. |
| `CIO_ADMIN_EMAIL`       | `admin@cpf.cl`                                           | Email del administrador inicial. |
| `CIO_ADMIN_PASSWORD`    | `CambiarEstaClave123!`                                   | Contraseña del administrador inicial. |
| `CIO_ADMIN_NOMBRE`      | `Administrador CIO`                                      | Nombre visible del administrador. |
| `CIO_IMPORTAR_FIREBASE` | `1`                                                      | Importa `firebase_data.json` la primera vez que la BD está vacía. Usar `0` para desactivar. |

Generar una clave segura:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Build y despliegue

```powershell
cd "cio-predictivo 2.0"
npm run build
```

## Despliegue con Docker (recomendado para producción)

Requiere Docker y Docker Compose instalados.

```powershell
cd "cio-predictivo 2.0"

# 1. Configurar secretos
Copy-Item backend/.env.example backend/.env
# Editar backend/.env: CIO_SECRET_KEY, CIO_ADMIN_PASSWORD, CIO_ALLOWED_ORIGINS

# 2. Levantar
docker compose up -d --build

# 3. Verificar
# Frontend: http://localhost
# Backend:  http://localhost:8000/api/health
```

Notas:
- La base SQLite se persiste en el volumen Docker `cio-predictivo-data` (`/data/cio_predictivo.db`).
- Para migrar `firebase_data.json`, descomente el volumen en `docker-compose.yml` y active `CIO_IMPORTAR_FIREBASE=1` en el primer arranque.
- Para actualizar: `docker compose up -d --build` (los datos persisten en el volumen).
- Para ver logs: `docker compose logs -f`.
- Para detener: `docker compose down` (los datos se conservan).

El resultado queda en `dist/` con `index.html`, `terreno.html`, `sw.js`,
`manifest.json` y `assets/`. El proyecto usa `base: './'`, por lo que puede
servirse tanto en la raíz como en una subruta.

En producción, sirva `dist/` con un servidor estático y publique el backend bajo
`/api` en el mismo origen (o configure `CIO_ALLOWED_ORIGINS` y la URL del API).

---

## Pruebas y verificación

```powershell
cd "cio-predictivo 2.0"

npm run typecheck   # TypeScript sin emitir
npm run lint        # ESLint (0 errores, warnings permitidos hasta 100)
npm run format:check # Prettier
npm test            # Vitest (dominio + Outbox)
npm run build       # typecheck + build de producción
```

El repositorio incluye un workflow de **GitHub Actions** (`.github/workflows/ci.yml`)
que ejecuta automáticamente typecheck, tests y build del frontend, compilación y tests
del backend, y la construcción de las imágenes Docker en cada push/PR.

Backend:

```powershell
cd "cio-predictivo 2.0/backend"
python -m py_compile main.py database.py security.py analizador_fft.py migrar_datos.py cambiar_clave.py backup_db.py persistencia/*.py alembic/*.py alembic/versions/*.py
python -m pip install -r requirements-dev.txt
ruff check . && ruff format --check .
python -m pytest
```

---

## API principal

| Método | Ruta                         | Auth | Roles |
| ------ | ---------------------------- | ---- | ----- |
| GET    | `/api/health`                | No   | — |
| POST   | `/api/auth/login`            | No   | — |
| POST   | `/api/auth/refresh`          | No   | — |
| POST   | `/api/auth/logout`           | No   | — |
| GET    | `/api/auth/me`               | JWT  | Cualquiera |
| POST   | `/api/auth/change-password`  | JWT  | Cualquiera |
| GET    | `/api/users`                 | JWT  | Administrador |
| POST   | `/api/users`                 | JWT  | Administrador |
| PUT    | `/api/users/{id}`            | JWT  | Administrador |
| POST   | `/api/users/{id}/reset-password` | JWT | Administrador |
| POST   | `/api/admin/backup`          | JWT  | Administrador |
| POST   | `/api/analizar-vibracion`    | JWT  | Administrador, Supervisor, Analista CBM |
| POST   | `/api/cbm/registro-directo`  | JWT  | Según recurso/acción |
| POST   | `/api/cbm/sincronizar-outbox`| JWT  | Cualquiera |
| GET    | `/api/cbm/registros`         | JWT  | Cualquiera |
| GET    | `/api/auditoria`             | JWT  | Administrador, Supervisor |

Los endpoints protegidos usan una cookie **HttpOnly** (`cio_access_token`) para
autenticar al navegador; el cliente CLI/scripts puede seguir usando
`Authorization: Bearer <token>`. Si se envía `X-Tenant-ID`, debe coincidir con el
tenant del token (si no, `403`).

---

## Notas operativas

- **Offline / Outbox:** `terreno.html` comparte sesión con `index.html` vía
  `localStorage` (`cio_session_v2`, que guarda solo metadatos de usuario, nunca
  el token). Si no hay sesión, redirige a `index.html`.
  El Service Worker cachea el app shell y sincroniza la cola automáticamente.
- **`firebase_data.json`:** archivo de migración inicial (~54 MB). Está ignorado
  por Git; si existe en `backend/` y la BD está vacía, se importa automáticamente.
  Si ya estaba versionado, quítelo del índice con `git rm --cached "backend/firebase_data.json"`.
- **Base de datos:** `*.db`, `*.db-wal` y `*.db-shm` están ignorados por Git.
  Respaldar el archivo SQLite (o el volumen) de forma periódica en producción.
- **Secretos:** nunca versionar `.env` ni `CIO_SECRET_KEY`.
