# 🛡️ CIO Predictivo 2.0 — Planta Mina Los Colorados

Plataforma industrial de monitoreo de condición (CBM) con frontend **Vite +
TypeScript** (PWA offline) y backend **FastAPI + SQLite**. Diseñada para operar en
entornos mineros de alta exigencia y baja conectividad.

## 🚀 Características principales

- **Gemelo digital 3D:** visualización cartográfica con MapLibre GL JS y modelos de elevación.
- **Gestión de activos y severidad:** diagnóstico de vibraciones y temperaturas bajo norma **ISO 20816-3**.
- **Modo offline / PWA:** operación sin conexión y sincronización automática del Outbox.
- **Seguridad por roles:** autenticación JWT y permisos granulares para Administrador,
  Supervisor, Analista CBM y Operador de Terreno.
- **Auditoría persistente:** trazabilidad de login, análisis y cambios por tenant.

## 🛠️ Requisitos

- **Node.js 20+** y npm.
- **Python 3.11+**.

La plataforma usa módulos ES nativos, por lo que no debe abrirse `index.html` con
`file://`; utilice el servidor de desarrollo de Vite o un servidor estático.

## ⚙️ Configuración local

1. Backend:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   Copy-Item .env.example .env
   # Editar .env: definir CIO_SECRET_KEY y CIO_ADMIN_PASSWORD
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```

2. Frontend (otra terminal):

   ```powershell
   npm install
   npm run dev
   ```

   Abrir <http://localhost:5173>. Vite redirige `/api` a `http://127.0.0.1:8000`.

## 🔐 Credenciales iniciales

| Campo      | Valor                  |
| ---------- | ---------------------- |
| Email      | `admin@cpf.cl`         |
| Contraseña | `CambiarEstaClave123!` |

Cambie la contraseña antes de producción mediante `CIO_ADMIN_PASSWORD` (se aplica
solo al crear el administrador inicial con la tabla `users` vacía).

## 🧪 Verificación

```powershell
npm run typecheck
npm test
npm run build
```

Consulte el **README de la raíz del repositorio** para el detalle de variables de
entorno, despliegue, endpoints y notas operativas.

## 📚 Documentación adicional

- `docs/ARQUITECTURA.md`
- `docs/CONTEXTO.md`
- `docs/MANUAL_TERRENO.md`
- `docs/CHANGELOG.md`
