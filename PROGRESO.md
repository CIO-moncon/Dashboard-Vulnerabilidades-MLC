# Progreso del hardening — CIO Predictivo 2.0

> Última actualización: 2026-11-08
> Rama `main` · Commit base (último en el historial): `258dc8f` ("update opencode")
> Estado: **fases 1–9 completadas y verificadas (roadmap de hardening terminado)**. Cambios en el árbol de trabajo, **pendientes de commit** (no hay binario `git` en el entorno de ejecución).

## Cómo retomar

1. **Continuar esta sesión de OpenCode** (conserva todo el contexto y el resumen de conversación).
2. Si abres un contexto nuevo, revisa este archivo y `cio-predictivo 2.0/docs/CHANGELOG.md` (versiones 2.5.0 → 2.9.0).

## Fases completadas

| # | Fase | Dónde |
|---|------|-------|
| 1 | Centralizar `escaparHTML` | `src/core/utils/sanitizar.ts` |
| 2 | Reescribir docs + eliminar código muerto | `docs/ARQUITECTURA.md`, `docs/CONTEXTO.md` |
| 3 | Linting (Ruff + ESLint/Prettier + pre-commit) | `backend/ruff.toml`, `eslint.config.js`, `.prettierrc`, `.pre-commit-config.yaml` |
| 4 | Refactor `database.py` → repositorios | `backend/persistencia/` |
| 5 | Alembic (migraciones de esquema) | `backend/alembic/`, `backend/alembic.ini` |
| 6 | Refresh tokens | `backend/persistencia/refresh_tokens.py`, `POST /api/auth/refresh` |
| 7 | JWT → cookies HttpOnly | `src/core/auth/authService.ts`, `backend/main.py` |
| 8 | Desacoplar `window.*` (~50 globales) | `src/core/app/comandos.ts`, `src/core/app/estadoApp.ts` |
| 9 | Workbox precache (PWA) | `vite.config.ts` (vite-plugin-pwa), `public/sw.js` |

## Verificación (todo en verde)

Backend (desde `cio-predictivo 2.0/backend/`):

```powershell
ruff check . && ruff format --check .
python -m compileall -q main.py database.py security.py analizador_fft.py migrar_datos.py cambiar_clave.py backup_db.py conftest.py persistencia alembic
python -m pytest            # 61 passed
```

Frontend (desde `cio-predictivo 2.0/`):

```powershell
npm run typecheck           # sin errores
npm run lint                # 0 errores (warnings permitidos)
npm run format:check        # OK
npm test                    # 25 passed
npm run build               # OK
```

## Siguientes pasos (fuera del roadmap de hardening)

- Paginación en tablas grandes (catastro, auditoría).
- Tests E2E (Playwright) para flujos críticos.

## Checklist de producción (bloqueado en el entorno: sin `git` ni `docker`)

- Definir `CIO_SECRET_KEY` (mín. 32 caracteres) y `CIO_ADMIN_PASSWORD` en `backend/.env`.
- Cambiar la contraseña inicial `CambiarEstaClave123!` antes de exponer.
- En producción HTTPS: `CIO_ENABLE_HSTS=1` y `CIO_COOKIE_SECURE=1`.

## Cómo commitear (cuando haya `git` disponible)

```powershell
git status
git add -A
git commit -m "Hardening: fases 1-9 (repositorios, Alembic, refresh tokens, cookies HttpOnly, comandos UI, precache Workbox)"
git push
```

## Notas importantes

- El backend se ejecuta desde `backend/` (`uvicorn main:app`); los módulos son top-level.
- Admin inicial: `admin@cpf.cl` / `CambiarEstaClave123!` (tests usan `TestPass123!`).
- `firebase_data.json` (~52 MB) está gitignoreado y solo se importa si la BD está vacía y `CIO_IMPORTAR_FIREBASE=1`.
- `CIO_TOKEN_HORAS=8`, `CIO_REFRESH_HORAS=720` (30 días), `CIO_COOKIE_SECURE=0` (HTTPS→1).
