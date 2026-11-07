import os
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

try:  # Carga opcional de backend/.env antes de importar seguridad y base de datos.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:  # python-dotenv es opcional; se pueden exportar variables del sistema.
    pass

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from persistencia import (
    ROLES_VALIDOS,
    RepositorioAuditoria,
    RepositorioCbm,
    RepositorioRefreshTokens,
    RepositorioUsuarios,
    importar_firebase_si_vacio,
    inicializar_db,
)
from security import (
    DURACION_REFRESH_HORAS,
    crear_token,
    decodificar_token,
    generar_token_opaco,
    hash_password,
    hash_token,
    verificar_password,
)

# -----------------------------------------------------------------------------
# CONFIGURACIÓN
# -----------------------------------------------------------------------------
ROLES_GESTION = {"ADMINISTRADOR", "SUPERVISOR", "ANALISTA CBM"}
ROLES_AUDITORIA = {"ADMINISTRADOR", "SUPERVISOR"}
ROLES_ANALISIS = {"ADMINISTRADOR", "SUPERVISOR", "ANALISTA CBM"}

repositorio_usuarios = RepositorioUsuarios()
repositorio_cbm = RepositorioCbm()
repositorio_auditoria = RepositorioAuditoria()
repositorio_refresh = RepositorioRefreshTokens()

# -----------------------------------------------------------------------------
# COOKIES DE SESIÓN (HttpOnly)
# -----------------------------------------------------------------------------
COOKIE_ACCESS = "cio_access_token"
COOKIE_REFRESH = "cio_refresh_token"
COOKIE_SECURE = os.getenv("CIO_COOKIE_SECURE", "0").lower() in {"1", "true", "yes"}


def _establecer_cookies(
    response: Response,
    access_token: str,
    access_seg: int,
    refresh_token: str,
    refresh_seg: int,
) -> None:
    response.set_cookie(
        COOKIE_ACCESS,
        access_token,
        max_age=access_seg,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    # El refresh token se limita a /api/auth para reducir la superficie CSRF.
    response.set_cookie(
        COOKIE_REFRESH,
        refresh_token,
        max_age=refresh_seg,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/api/auth",
    )


def _limpiar_cookies(response: Response) -> None:
    response.delete_cookie(COOKIE_ACCESS, path="/")
    response.delete_cookie(COOKIE_REFRESH, path="/api/auth")


def _obtener_refresh(request: Request, body_refresh: str | None) -> str | None:
    """Devuelve el refresh token desde la cookie HttpOnly o del cuerpo (fallback)."""
    return request.cookies.get(COOKIE_REFRESH) or body_refresh


def _origins_permitidos() -> list[str]:
    crudo = os.getenv(
        "CIO_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origen.strip() for origen in crudo.split(",") if origen.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    inicializar_db()
    repositorio_usuarios.sembrar_admin()
    importar_firebase_si_vacio(repositorio_cbm)
    yield


app = FastAPI(
    title="CIO Predictivo 2.0 - Core Engine Multi-Tenant",
    description="Motor central CBM para Mina Los Colorados y arquitectura SaaS",
    version="2.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

origins = _origins_permitidos()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Tenant-ID",
        "X-User-ID",
        "X-User-Role",
    ],
)

# -----------------------------------------------------------------------------
# MIDDLEWARE DE SEGURIDAD INDUSTRIAL (Cabeceras HTTP & CSP)
# -----------------------------------------------------------------------------
ENABLE_HSTS = os.getenv("CIO_ENABLE_HSTS", "0").lower() in {"1", "true", "yes"}


@app.middleware("http")
async def agregar_cabeceras_seguridad(request: Request, call_next):
    response = await call_next(request)

    # Cabeceras anti-sniffing, clickjacking y XSS
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # HSTS solo si está habilitado explícitamente (requiere HTTPS en producción)
    if ENABLE_HSTS:
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )

    # Content Security Policy (CSP) robusta pero compatible con MapLibre, fuentes y CDNs de la app
    csp_directives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.arcgisonline.com https://*.basemaps.cartocdn.com",
        "connect-src 'self' https://*.arcgisonline.com https://*.elevation-tiles-prod.arcgis.com",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ]
    response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

    return response


# -----------------------------------------------------------------------------
# ESQUEMAS
# -----------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=20, max_length=300)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=20, max_length=300)


class CambioClaveRequest(BaseModel):
    password_actual: str = Field(min_length=8, max_length=200)
    password_nueva: str = Field(min_length=12, max_length=200)


class UsuarioCrearRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=12, max_length=200)
    nombre: str = Field(min_length=1, max_length=120)
    rol: str = Field(min_length=3, max_length=40)


class UsuarioActualizarRequest(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    rol: str | None = Field(default=None, min_length=3, max_length=40)
    activo: bool | None = None


class ResetPasswordRequest(BaseModel):
    password_nueva: str = Field(min_length=12, max_length=200)


class SolicitudAnalisis(BaseModel):
    tag_equipo: str = Field(min_length=1, max_length=80)
    amplitudes: list[float] = Field(min_length=8, max_length=200_000)
    componente: str | None = Field(default="General", max_length=120)
    frecuencia_muestreo: float | None = Field(default=1000.0, gt=0, le=1_000_000)


class RegistroDirectoPayload(BaseModel):
    resource: str = Field(min_length=1, max_length=300)
    actionType: Literal["CREATE", "UPDATE", "DELETE", "UPSERT", "CBM_MEASURE"]
    payload: dict[str, Any]


class SincronizacionOutboxPayload(BaseModel):
    tenantId: str | None = None
    items: list[dict[str, Any]] = Field(min_length=1, max_length=200)


# -----------------------------------------------------------------------------
# AUTENTICACIÓN
# -----------------------------------------------------------------------------
esquema_bearer = HTTPBearer(auto_error=False)

_intentos_login: dict[str, list[float]] = {}
_lock_intentos = threading.Lock()
MAX_INTENTOS_LOGIN = 10
VENTANA_LOGIN_SEGUNDOS = 60
TRUST_PROXY = os.getenv("CIO_TRUST_PROXY", "0").lower() in {"1", "true", "yes"}


def _ip_cliente(request: Request) -> str:
    """Obtiene la IP real respetando X-Forwarded-For solo si se confía en el proxy."""
    if TRUST_PROXY:
        reenviada = request.headers.get("X-Forwarded-For", "")
        if reenviada:
            return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


def _verificar_rate_limit(request: Request) -> None:
    ip = _ip_cliente(request)
    ahora = time.time()
    with _lock_intentos:
        intentos = [t for t in _intentos_login.get(ip, []) if ahora - t < VENTANA_LOGIN_SEGUNDOS]
        _intentos_login[ip] = intentos
        if len(intentos) >= MAX_INTENTOS_LOGIN:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos de acceso. Espere un minuto.",
            )


def _registrar_intento_fallido(request: Request) -> None:
    ip = _ip_cliente(request)
    ahora = time.time()
    with _lock_intentos:
        intentos = [t for t in _intentos_login.get(ip, []) if ahora - t < VENTANA_LOGIN_SEGUNDOS]
        intentos.append(ahora)
        _intentos_login[ip] = intentos


def _limpiar_intentos(request: Request) -> None:
    ip = _ip_cliente(request)
    with _lock_intentos:
        _intentos_login.pop(ip, None)


async def usuario_actual(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(esquema_bearer),
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
) -> dict[str, Any]:
    # Preferir la cookie HttpOnly (navegador); mantener Bearer para CLI/tests.
    token = request.cookies.get(COOKIE_ACCESS)
    if not token and credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acceso requerido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decodificar_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Inicie sesión nuevamente.",
        ) from None
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        ) from None

    usuario = repositorio_usuarios.buscar_por_id(payload.get("sub", ""))
    if not usuario or not usuario["activo"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente.",
        )

    tenant_token = (payload.get("tenant_id") or usuario["tenant_id"]).strip().lower()
    if x_tenant_id and x_tenant_id.strip().lower() != tenant_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El tenant del token no coincide con X-Tenant-ID.",
        )

    return {
        "tenant_id": tenant_token,
        "user_id": usuario["id"],
        "user_role": usuario["rol"],
        "email": usuario["email"],
        "nombre": usuario["nombre"],
    }


def _requerir_rol(context: dict[str, Any], roles: set[str]) -> None:
    if context["user_role"] not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"El rol '{context['user_role']}' no tiene permisos para esta acción.",
        )


# -----------------------------------------------------------------------------
# ENDPOINTS PÚBLICOS
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "system": "CIO Predictivo 2.0 Core",
        "version": app.version,
        "timestamp": time.time(),
    }


def _emitir_refresh(user_id: str, tenant_id: str) -> tuple[str, int]:
    """Crea un refresh token opaco (se guarda solo su hash) y devuelve (token, segundos)."""
    token = generar_token_opaco()
    vigencia = DURACION_REFRESH_HORAS * 3600
    repositorio_refresh.crear(
        token_hash=hash_token(token),
        user_id=user_id,
        tenant_id=tenant_id,
        expira_en=time.time() + vigencia,
    )
    return token, vigencia


def _respuesta_sesion(
    usuario: dict[str, Any],
    access_token: str,
    expira_en: int,
    refresh_token: str,
    refresh_expira_en: int,
) -> dict[str, Any]:
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expira_en,
        "refresh_token": refresh_token,
        "refresh_expires_in": refresh_expira_en,
        "usuario": {
            "uid": usuario["id"],
            "email": usuario["email"],
            "nombre": usuario["nombre"],
            "rol": usuario["rol"],
            "tenantId": usuario["tenant_id"],
            "faenaNombre": "Mina Los Colorados",
        },
    }


@app.post("/api/auth/login")
def login(body: LoginRequest, request: Request, response: Response):
    _verificar_rate_limit(request)

    usuario = repositorio_usuarios.buscar_por_email(body.email)
    if (
        not usuario
        or not usuario["activo"]
        or not verificar_password(body.password, usuario["password_hash"])
    ):
        _registrar_intento_fallido(request)
        # Mensaje genérico para no revelar si el correo existe.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas.",
        )

    _limpiar_intentos(request)

    token, expira_en = crear_token(
        user_id=usuario["id"],
        email=usuario["email"],
        rol=usuario["rol"],
        tenant_id=usuario["tenant_id"],
    )
    refresh_token, refresh_expira_en = _emitir_refresh(usuario["id"], usuario["tenant_id"])
    _establecer_cookies(response, token, expira_en, refresh_token, refresh_expira_en)

    repositorio_auditoria.registrar(
        tenant_id=usuario["tenant_id"],
        user_id=usuario["id"],
        user_role=usuario["rol"],
        action_type="LOGIN",
        resource=f"usuario:{usuario['id']}",
        metadata={"email": usuario["email"]},
    )

    return _respuesta_sesion(usuario, token, expira_en, refresh_token, refresh_expira_en)


@app.post("/api/auth/refresh")
def refrescar_sesion(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
):
    """Emite un nuevo access token a cambio de un refresh token válido (rotación)."""
    repositorio_refresh.eliminar_expirados()

    refresh_presentado = _obtener_refresh(request, body.refresh_token if body else None)
    if not refresh_presentado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token requerido.",
        )

    registro = repositorio_refresh.buscar_por_hash(hash_token(refresh_presentado))
    if not registro or registro["revocado_en"] is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o revocado.",
        )
    if registro["expira_en"] < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expirado.",
        )

    usuario = repositorio_usuarios.buscar_por_id(registro["user_id"])
    if not usuario or not usuario["activo"] or usuario["tenant_id"] != registro["tenant_id"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente.",
        )

    # Rotación: el token presentado se revoca y se emite uno nuevo.
    repositorio_refresh.revocar(registro["id"])

    token, expira_en = crear_token(
        user_id=usuario["id"],
        email=usuario["email"],
        rol=usuario["rol"],
        tenant_id=usuario["tenant_id"],
    )
    refresh_token, refresh_expira_en = _emitir_refresh(usuario["id"], usuario["tenant_id"])
    _establecer_cookies(response, token, expira_en, refresh_token, refresh_expira_en)

    repositorio_auditoria.registrar(
        tenant_id=usuario["tenant_id"],
        user_id=usuario["id"],
        user_role=usuario["rol"],
        action_type="REFRESH_TOKEN",
        resource=f"usuario:{usuario['id']}",
        metadata={"email": usuario["email"]},
    )

    return _respuesta_sesion(usuario, token, expira_en, refresh_token, refresh_expira_en)


@app.post("/api/auth/logout")
def cerrar_sesion(
    request: Request,
    response: Response,
    body: LogoutRequest | None = None,
):
    """Revoca el refresh token presentado y limpia las cookies de sesión."""
    refresh_presentado = _obtener_refresh(request, body.refresh_token if body else None)
    _limpiar_cookies(response)

    if refresh_presentado:
        registro = repositorio_refresh.buscar_por_hash(hash_token(refresh_presentado))
        if registro and registro["revocado_en"] is None:
            repositorio_refresh.revocar(registro["id"])
            usuario = repositorio_usuarios.buscar_por_id(registro["user_id"])
            if usuario:
                repositorio_auditoria.registrar(
                    tenant_id=registro["tenant_id"],
                    user_id=usuario["id"],
                    user_role=usuario["rol"],
                    action_type="LOGOUT",
                    resource=f"usuario:{usuario['id']}",
                    metadata={"email": usuario["email"]},
                )

    # Idempotente: no revelar si el token era válido o no.
    return {"status": "ok", "mensaje": "Sesión cerrada."}


@app.post("/api/auth/change-password")
def cambiar_password(
    body: CambioClaveRequest,
    context: dict[str, Any] = Depends(usuario_actual),
):
    usuario = repositorio_usuarios.buscar_por_id(context["user_id"])
    if not usuario or not verificar_password(body.password_actual, usuario["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta.",
        )

    if body.password_actual == body.password_nueva:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser distinta de la actual.",
        )

    repositorio_usuarios.actualizar_password_hash(usuario["id"], hash_password(body.password_nueva))
    # Cambiar la contraseña invalida todas las sesiones (tokens de refresco).
    repositorio_refresh.revocar_todos_usuario(usuario["id"])
    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=usuario["id"],
        user_role=usuario["rol"],
        action_type="CHANGE_PASSWORD",
        resource=f"usuario:{usuario['id']}",
        metadata={"email": usuario["email"]},
    )

    return {"status": "ok", "mensaje": "Contraseña actualizada correctamente."}


@app.get("/api/auth/me")
def me(context: dict[str, Any] = Depends(usuario_actual)):
    return {
        "uid": context["user_id"],
        "email": context["email"],
        "nombre": context["nombre"],
        "rol": context["user_role"],
        "tenantId": context["tenant_id"],
    }


# -----------------------------------------------------------------------------
# GESTIÓN DE USUARIOS (solo ADMINISTRADOR)
# -----------------------------------------------------------------------------
@app.get("/api/users")
def listar_usuarios_endpoint(context: dict[str, Any] = Depends(usuario_actual)):
    _requerir_rol(context, {"ADMINISTRADOR"})
    return {
        "tenant_id": context["tenant_id"],
        "usuarios": repositorio_usuarios.listar(context["tenant_id"]),
    }


@app.post("/api/users")
def crear_usuario_endpoint(
    body: UsuarioCrearRequest,
    context: dict[str, Any] = Depends(usuario_actual),
):
    _requerir_rol(context, {"ADMINISTRADOR"})

    email = body.email.strip().lower()
    if repositorio_usuarios.buscar_por_email(email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese correo.",
        )

    if body.rol not in ROLES_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Rol inválido: {body.rol}",
        )

    usuario = repositorio_usuarios.crear(
        email=email,
        password_hash=hash_password(body.password),
        nombre=body.nombre,
        rol=body.rol,
        tenant_id=context["tenant_id"],
    )

    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type="CREATE_USER",
        resource=f"usuario:{usuario['id']}",
        metadata={"email": usuario["email"], "rol": usuario["rol"]},
    )

    return {"status": "success", "usuario": usuario}


@app.put("/api/users/{user_id}")
def actualizar_usuario_endpoint(
    user_id: str,
    body: UsuarioActualizarRequest,
    context: dict[str, Any] = Depends(usuario_actual),
):
    _requerir_rol(context, {"ADMINISTRADOR"})

    usuario = repositorio_usuarios.buscar_por_id(user_id)
    if not usuario or usuario["tenant_id"] != context["tenant_id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    # Evitar desactivar al propio administrador que está operando.
    if user_id == context["user_id"] and body.activo is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede desactivar su propia cuenta.",
        )

    # Evitar dejar al tenant sin administradores activos.
    if (
        body.activo is False
        and usuario["rol"] == "ADMINISTRADOR"
        and repositorio_usuarios.contar_administradores_activos(context["tenant_id"]) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede desactivar al último administrador activo del tenant.",
        )

    if body.rol is not None and body.rol not in ROLES_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Rol inválido: {body.rol}",
        )

    if (
        body.rol is not None
        and body.rol != usuario["rol"]
        and usuario["rol"] == "ADMINISTRADOR"
        and repositorio_usuarios.contar_administradores_activos(context["tenant_id"]) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede cambiar el rol del último administrador activo.",
        )

    sin_cambios = body.nombre is None and body.rol is None and body.activo is None
    if sin_cambios:
        actualizado_usuario = repositorio_usuarios.buscar_por_id(user_id)
        return {
            "status": "success",
            "usuario": {
                "id": actualizado_usuario["id"],
                "email": actualizado_usuario["email"],
                "nombre": actualizado_usuario["nombre"],
                "rol": actualizado_usuario["rol"],
                "tenant_id": actualizado_usuario["tenant_id"],
                "activo": actualizado_usuario["activo"],
                "creado_en": actualizado_usuario["creado_en"],
            },
        }

    actualizado = repositorio_usuarios.actualizar(
        user_id=user_id,
        nombre=body.nombre,
        rol=body.rol,
        activo=body.activo,
    )
    if not actualizado:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo actualizar el usuario.",
        )

    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type="UPDATE_USER",
        resource=f"usuario:{user_id}",
        metadata={
            "nombre": body.nombre,
            "rol": body.rol,
            "activo": body.activo,
        },
    )

    actualizado_usuario = repositorio_usuarios.buscar_por_id(user_id)
    return {
        "status": "success",
        "usuario": {
            "id": actualizado_usuario["id"],
            "email": actualizado_usuario["email"],
            "nombre": actualizado_usuario["nombre"],
            "rol": actualizado_usuario["rol"],
            "tenant_id": actualizado_usuario["tenant_id"],
            "activo": actualizado_usuario["activo"],
            "creado_en": actualizado_usuario["creado_en"],
        },
    }


@app.post("/api/users/{user_id}/reset-password")
def reset_password_usuario_endpoint(
    user_id: str,
    body: ResetPasswordRequest,
    context: dict[str, Any] = Depends(usuario_actual),
):
    _requerir_rol(context, {"ADMINISTRADOR"})

    usuario = repositorio_usuarios.buscar_por_id(user_id)
    if not usuario or usuario["tenant_id"] != context["tenant_id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    repositorio_usuarios.actualizar_password_hash(usuario["id"], hash_password(body.password_nueva))
    # Restablecer la contraseña invalida todas las sesiones del usuario.
    repositorio_refresh.revocar_todos_usuario(usuario["id"])
    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type="RESET_PASSWORD",
        resource=f"usuario:{user_id}",
        metadata={"email": usuario["email"]},
    )

    return {"status": "ok", "mensaje": "Contraseña restablecida correctamente."}


# -----------------------------------------------------------------------------
# RESPALDO DE BASE DE DATOS (solo ADMINISTRADOR)
# -----------------------------------------------------------------------------
@app.post("/api/admin/backup")
def backup_base_datos(context: dict[str, Any] = Depends(usuario_actual)):
    _requerir_rol(context, {"ADMINISTRADOR"})

    import backup_db

    origen = Path(
        os.getenv("CIO_DB_PATH", os.path.join(os.path.dirname(__file__), "cio_predictivo.db"))
    ).resolve()
    directorio = backup_db._directorio_destino(None)
    sello = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino = directorio / f"cio_predictivo_{sello}.db"

    try:
        backup_db._realizar_backup(origen, destino)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo generar el respaldo: {error}",
        ) from error

    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type="BACKUP_DB",
        resource="base_de_datos",
        metadata={"archivo": str(destino), "tamano_bytes": destino.stat().st_size},
    )

    return {
        "status": "ok",
        "archivo": str(destino),
        "tamano_bytes": destino.stat().st_size,
    }


# -----------------------------------------------------------------------------
# ANÁLISIS FFT
# -----------------------------------------------------------------------------
@app.post("/api/analizar-vibracion")
def analizar_vibracion(
    datos: SolicitudAnalisis,
    context: dict[str, Any] = Depends(usuario_actual),
):
    _requerir_rol(context, ROLES_ANALISIS)

    try:
        from analizador_fft import procesar_senal_vibracion
    except ImportError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "El motor FFT no está disponible. Instale las dependencias del backend "
                f"(numpy, scipy, scikit-learn, matplotlib): {error}"
            ),
        ) from error

    try:
        resultado = procesar_senal_vibracion(datos.amplitudes, datos.frecuencia_muestreo)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - errores numéricos inesperados
        raise HTTPException(status_code=500, detail=f"Error en análisis FFT: {error}") from error

    repositorio_auditoria.registrar(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type="ANALYZE",
        resource=f"activo:{datos.tag_equipo}/{datos.componente}",
        metadata={"num_muestras": len(datos.amplitudes)},
    )

    return {
        "tenant_id": context["tenant_id"],
        "tag_equipo": datos.tag_equipo,
        "resultado_analisis": resultado,
    }


# -----------------------------------------------------------------------------
# REGISTROS CBM
# -----------------------------------------------------------------------------
@app.post("/api/cbm/registro-directo")
def registro_directo(
    body: RegistroDirectoPayload,
    context: dict[str, Any] = Depends(usuario_actual),
):
    tenant_id = context["tenant_id"]
    es_activo = body.resource.startswith("activo_catastro:")

    if es_activo and body.actionType in {"UPDATE", "UPSERT", "DELETE"}:
        _requerir_rol(context, ROLES_GESTION)

    if es_activo and body.actionType in {"UPDATE", "UPSERT"}:
        tag = str(body.payload.get("tag") or body.resource.split(":", 1)[-1])
        resultado = repositorio_cbm.upsert_activo(tenant_id, context["user_id"], tag, body.payload)
    else:
        record_id = f"rec_{uuid.uuid4().hex}"
        resultado = repositorio_cbm.crear_registro(
            record_id=record_id,
            tenant_id=tenant_id,
            user_id=context["user_id"],
            resource=body.resource,
            action_type=body.actionType,
            payload=body.payload,
        )

    repositorio_auditoria.registrar(
        tenant_id=tenant_id,
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type=body.actionType,
        resource=body.resource,
        metadata={
            "tag": body.payload.get("tag"),
            "severidad": body.payload.get("severidad"),
        },
    )

    return {
        "status": "success",
        "tenant_id": tenant_id,
        **resultado,
    }


@app.post("/api/cbm/sincronizar-outbox")
def sincronizar_outbox(
    payload: SincronizacionOutboxPayload,
    context: dict[str, Any] = Depends(usuario_actual),
):
    tenant_id = context["tenant_id"]
    procesados: list[str] = []
    rechazados: list[dict[str, Any]] = []

    for item in payload.items:
        item_id = str(item.get("id") or f"outbox_{uuid.uuid4().hex}")
        item_tenant = str(item.get("tenantId") or item.get("tenant_id") or tenant_id)
        action_type = str(item.get("actionType") or item.get("action_type") or "CREATE")
        resource = str(item.get("resource") or f"cbm_record:{item_id}")
        item_payload = item.get("payload")

        if item_tenant.strip().lower() != tenant_id:
            rechazados.append(
                {
                    "id": item_id,
                    "motivo": (
                        f"Inconsistencia de tenant: recibido {item_tenant}, esperado {tenant_id}"
                    ),
                }
            )
            continue

        if action_type not in {"CREATE", "UPDATE", "DELETE", "UPSERT", "CBM_MEASURE"}:
            rechazados.append({"id": item_id, "motivo": f"actionType inválido: {action_type}"})
            continue

        if not isinstance(item_payload, dict):
            rechazados.append({"id": item_id, "motivo": "payload debe ser un objeto"})
            continue

        if resource.startswith("activo_catastro:") and action_type in {"UPDATE", "UPSERT"}:
            tag = str(item_payload.get("tag") or resource.split(":", 1)[-1])
            repositorio_cbm.upsert_activo(tenant_id, context["user_id"], tag, item_payload)
        else:
            repositorio_cbm.crear_registro(
                record_id=item_id,
                tenant_id=tenant_id,
                user_id=context["user_id"],
                resource=resource,
                action_type=action_type,
                payload=item_payload,
            )

        repositorio_auditoria.registrar(
            tenant_id=tenant_id,
            user_id=context["user_id"],
            user_role=context["user_role"],
            action_type=action_type,
            resource=resource,
            metadata={
                "tag": item_payload.get("tag"),
                "severidad": item_payload.get("severidad"),
            },
        )
        procesados.append(item_id)

    return {
        "tenant_id": tenant_id,
        "total_recibidos": len(payload.items),
        "sincronizados": procesados,
        "rechazados": rechazados,
    }


@app.get("/api/cbm/registros")
def obtener_registros_cbm(
    tag: str | None = None,
    limit: int = 500,
    offset: int = 0,
    context: dict[str, Any] = Depends(usuario_actual),
):
    tenant_id = context["tenant_id"]
    registros = repositorio_cbm.listar_registros(tenant_id, tag=tag, limit=limit, offset=offset)

    return {
        "tenant_id": tenant_id,
        "total": repositorio_cbm.contar_registros(tenant_id),
        "registros": registros,
    }


@app.get("/api/auditoria")
def obtener_auditoria(
    limit: int = 50,
    context: dict[str, Any] = Depends(usuario_actual),
):
    _requerir_rol(context, ROLES_AUDITORIA)

    return {
        "tenant_id": context["tenant_id"],
        "logs": repositorio_auditoria.listar(context["tenant_id"], limit=limit),
    }
