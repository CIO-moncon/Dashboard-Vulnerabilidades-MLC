# Progreso del hardening — CIO Predictivo 2.0

> Última actualización: 2026-11-08
> Rama `main` · Commit base (último en el historial): `258dc8f` ("update opencode")
> Estado: **fases 1–9 completadas y verificadas (roadmap de hardening terminado)**; sobre esa base se añadieron el expediente/PDF 3.2.0, las observaciones + avisos CBM SAP 3.3.0, la trazabilidad S/M con fecha no editable 3.4.0 y la **trazabilidad total S/M 3.5.0**. Cambios en el árbol de trabajo, **pendientes de commit** (no hay binario `git` en el entorno de ejecución).

## Cómo retomar

1. **Continuar esta sesión de OpenCode** (conserva todo el contexto y el resumen de conversación).
2. Si abres un contexto nuevo, revisa este archivo y `cio-predictivo 2.0/docs/CHANGELOG.md` (versiones 2.5.0 → 3.5.0).

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
npm test                    # 50 passed
npm run build               # OK
```

## Entregables posteriores al hardening

- **Expediente 3.2.0**: historial en modal, tendencia ▲/▼/= al digitar, guardado que vacía "Actuales", PDF nativo corporativo con logo y pie, solo valores actuales (con respaldo en la última medición), colores ISO por magnitud, condición CBM como peor zona y fechas `dd-mm-aaaa hh:mm`.
- **Observaciones + avisos 3.3.0**: motor `src/core/cbm/observaciones.ts` (RMS Zona D → informe espectral + SAP Alta; RMS Zona C → seguimiento naranja; polea en Zona B → acotar a 15 días; temperatura/FC+ C/D → preventiva de rodamientos o cambio con SAP), panel en vivo en el expediente, sección en el PDF y módulo `src/modules/avisos/avisosCbm.ts` ("Avisos CBM SAP") con persistencia `aviso_cbm:<id>`, caché local, Outbox y estados Pendiente/Emitido/Realizado/No realizado.
- **Trazabilidad total S/M 3.5.0**: reglas puras en `src/core/cbm/trazabilidadSm.ts`; la matriz exige motivo para cualquier magnitud faltante (incluido punto 100% en blanco), permite aplicar el motivo en masa y muestra el último motivo; el guardado registra siempre la inspección (medida o S/M) con usuario, rol, `magnitudesSinMedicion` y `fechaUltimaInspeccion`; el historial muestra S/M + motivo + responsable; el PDF incluye todos los puntos y la sección "TRAZABILIDAD DE PUNTOS SIN MEDICIÓN (S/M)".
- **Orden cinemático lógico**: `src/core/domain/ordenCinematica.ts` (+ tests) ordena Motor → Reductor → Poleas → Otros con números naturales y lados; aplicado a la matriz (encabezados por componente) y al PDF.
- **Fix historial legacy 3.5.0**: `normalizarHistorial()` convierte historiales en formato objeto (bases importadas de Firebase) a arreglo y ordena por timestamp numérico; evita `spot.historial.push is not a function` al guardar y deja consistente el modal, el contador y la tendencia.

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
git commit -m "Expediente/PDF 3.2.0, observaciones + avisos CBM SAP 3.3.0 y trazabilidad total S/M 3.5.0 (fecha auto, motivo obligatorio, historial y PDF)"
git push
```

## Notas importantes

- El backend se ejecuta desde `backend/` (`uvicorn main:app`); los módulos son top-level.
- Admin inicial: `admin@cpf.cl` / `CambiarEstaClave123!` (tests usan `TestPass123!`).
- `firebase_data.json` (~52 MB) está gitignoreado y solo se importa si la BD está vacía y `CIO_IMPORTAR_FIREBASE=1`.
- `CIO_TOKEN_HORAS=8`, `CIO_REFRESH_HORAS=720` (30 días), `CIO_COOKIE_SECURE=0` (HTTPS→1).
