"""Fachada de compatibilidad de la persistencia SQLite.

La implementación vive ahora en el paquete ``persistencia``:
  - ``persistencia.conexion``   → conexión, esquema y constantes.
  - ``persistencia.usuarios``   → ``RepositorioUsuarios``.
  - ``persistencia.cbm``        → ``RepositorioCbm``.
  - ``persistencia.auditoria``  → ``RepositorioAuditoria``.

Este módulo conserva la API histórica (funciones sueltas) para scripts y
tests existentes. El código nuevo debe importar desde ``persistencia``.
"""

from __future__ import annotations

from typing import Any

from persistencia import (
    ROLES_VALIDOS,
    RUTA_DB,
    TENANT_DEFECTO,
    RepositorioAuditoria,
    RepositorioCbm,
    RepositorioUsuarios,
)
from persistencia.conexion import _conectar, inicializar_db
from persistencia.migracion import importar_firebase_si_vacio as _importar_firebase

__all__ = [
    "ROLES_VALIDOS",
    "RUTA_DB",
    "TENANT_DEFECTO",
    "_conectar",
    "actualizar_password_hash",
    "actualizar_usuario",
    "buscar_usuario_por_email",
    "buscar_usuario_por_id",
    "contar_administradores_activos",
    "contar_registros",
    "crear_registro",
    "crear_usuario",
    "importar_firebase_si_vacio",
    "inicializar_db",
    "listar_auditoria",
    "listar_registros",
    "listar_usuarios",
    "registrar_auditoria",
    "sembrar_usuario_admin",
    "upsert_activo",
]

_repositorio_usuarios = RepositorioUsuarios()
_repositorio_cbm = RepositorioCbm()
_repositorio_auditoria = RepositorioAuditoria()


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------
def sembrar_usuario_admin() -> None:
    _repositorio_usuarios.sembrar_admin()


def buscar_usuario_por_email(email: str) -> dict[str, Any] | None:
    return _repositorio_usuarios.buscar_por_email(email)


def buscar_usuario_por_id(user_id: str) -> dict[str, Any] | None:
    return _repositorio_usuarios.buscar_por_id(user_id)


def actualizar_password_hash(user_id: str, password_hash: str) -> bool:
    return _repositorio_usuarios.actualizar_password_hash(user_id, password_hash)


def listar_usuarios(tenant_id: str) -> list[dict[str, Any]]:
    return _repositorio_usuarios.listar(tenant_id)


def crear_usuario(
    email: str,
    password_hash: str,
    nombre: str,
    rol: str,
    tenant_id: str,
) -> dict[str, Any]:
    return _repositorio_usuarios.crear(email, password_hash, nombre, rol, tenant_id)


def actualizar_usuario(
    user_id: str,
    nombre: str | None = None,
    rol: str | None = None,
    activo: bool | None = None,
) -> bool:
    return _repositorio_usuarios.actualizar(user_id, nombre, rol, activo)


def contar_administradores_activos(tenant_id: str) -> int:
    return _repositorio_usuarios.contar_administradores_activos(tenant_id)


# ---------------------------------------------------------------------------
# Registros CBM
# ---------------------------------------------------------------------------
def upsert_activo(
    tenant_id: str, user_id: str, tag: str, payload: dict[str, Any]
) -> dict[str, Any]:
    return _repositorio_cbm.upsert_activo(tenant_id, user_id, tag, payload)


def crear_registro(
    record_id: str,
    tenant_id: str,
    user_id: str,
    resource: str,
    action_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return _repositorio_cbm.crear_registro(
        record_id, tenant_id, user_id, resource, action_type, payload
    )


def listar_registros(
    tenant_id: str, tag: str | None = None, limit: int = 500, offset: int = 0
) -> list[dict[str, Any]]:
    return _repositorio_cbm.listar_registros(tenant_id, tag, limit, offset)


def contar_registros(tenant_id: str | None = None) -> int:
    return _repositorio_cbm.contar_registros(tenant_id)


# ---------------------------------------------------------------------------
# Auditoría
# ---------------------------------------------------------------------------
def registrar_auditoria(
    tenant_id: str,
    user_id: str,
    user_role: str,
    action_type: str,
    resource: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    _repositorio_auditoria.registrar(tenant_id, user_id, user_role, action_type, resource, metadata)


def listar_auditoria(tenant_id: str, limit: int = 50) -> list[dict[str, Any]]:
    return _repositorio_auditoria.listar(tenant_id, limit)


# ---------------------------------------------------------------------------
# Migración inicial desde Firebase
# ---------------------------------------------------------------------------
def importar_firebase_si_vacio() -> None:
    _importar_firebase(_repositorio_cbm)
