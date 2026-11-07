"""Capa de persistencia de CIO Predictivo 2.0.

Repositorios por agregado:
  - ``RepositorioUsuarios``  → tabla ``users``.
  - ``RepositorioCbm``       → tabla ``cbm_records``.
  - ``RepositorioAuditoria`` → tabla ``audit_log``.

Cada repositorio acepta una fábrica de conexiones, lo que permite inyectar
una base temporal o en memoria en los tests sin tocar la base real.
"""

from persistencia.auditoria import RepositorioAuditoria
from persistencia.cbm import RepositorioCbm
from persistencia.conexion import (
    ROLES_VALIDOS,
    RUTA_DB,
    TENANT_DEFECTO,
    FabricaConexion,
    conexion_db,
    crear_esquema,
    inicializar_db,
)
from persistencia.migracion import importar_firebase_si_vacio
from persistencia.refresh_tokens import RepositorioRefreshTokens
from persistencia.usuarios import RepositorioUsuarios

__all__ = [
    "ROLES_VALIDOS",
    "RUTA_DB",
    "TENANT_DEFECTO",
    "FabricaConexion",
    "RepositorioAuditoria",
    "RepositorioCbm",
    "RepositorioRefreshTokens",
    "RepositorioUsuarios",
    "conexion_db",
    "crear_esquema",
    "importar_firebase_si_vacio",
    "inicializar_db",
]
