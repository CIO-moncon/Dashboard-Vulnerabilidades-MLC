"""Conexión SQLite, constantes y esquema de CIO Predictivo 2.0.

Este módulo es la única fuente de verdad sobre cómo se abre la base de datos.
Los repositorios reciben una ``FabricaConexion``, lo que permite inyectar una
base temporal o en memoria en los tests sin tocar la base real.

El esquema de producción se gestiona con Alembic (``inicializar_db``); el DDL
de ``crear_esquema`` se conserva como espejo para bases temporales de test.
"""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager

_DIRECTORIO_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RUTA_DB = os.getenv(
    "CIO_DB_PATH",
    os.path.join(_DIRECTORIO_BACKEND, "cio_predictivo.db"),
)
RUTA_FIREBASE = os.path.join(_DIRECTORIO_BACKEND, "firebase_data.json")
TENANT_DEFECTO = os.getenv("CIO_TENANT_ID", "mina_los_colorados")

ROLES_VALIDOS = frozenset(
    {
        "ADMINISTRADOR",
        "SUPERVISOR",
        "ANALISTA CBM",
        "OPERADOR TERRENO",
    }
)

FabricaConexion = Callable[[], AbstractContextManager[sqlite3.Connection]]


def _conectar() -> sqlite3.Connection:
    """Crea una conexión cruda. El llamador es responsable de cerrarla."""
    conexion = sqlite3.connect(RUTA_DB, timeout=15)
    conexion.row_factory = sqlite3.Row
    conexion.execute("PRAGMA foreign_keys = ON;")
    return conexion


@contextmanager
def conexion_db() -> Iterator[sqlite3.Connection]:
    """Conexión transaccional: confirma, revierte y cierra siempre."""
    conexion = _conectar()
    try:
        yield conexion
        conexion.commit()
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


def crear_esquema(conexion: sqlite3.Connection) -> None:
    """Crea tablas e índices sobre una conexión dada (idempotente).

    Usada por los tests para preparar bases temporales inyectadas. Refleja la
    revisión inicial (0001) de Alembic; el esquema de producción se gestiona
    con migraciones (ver ``persistencia/migraciones.py``).
    """
    conexion.executescript(
        """
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            activo INTEGER NOT NULL DEFAULT 1,
            creado_en REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cbm_records (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            resource TEXT NOT NULL,
            action_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            creado_en REAL NOT NULL,
            actualizado_en REAL
        );

        CREATE INDEX IF NOT EXISTS idx_cbm_tenant ON cbm_records (tenant_id);
        CREATE INDEX IF NOT EXISTS idx_cbm_resource ON cbm_records (tenant_id, resource);
        CREATE INDEX IF NOT EXISTS idx_cbm_creado ON cbm_records (tenant_id, creado_en);

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_role TEXT NOT NULL,
            action_type TEXT NOT NULL,
            resource TEXT NOT NULL,
            timestamp REAL NOT NULL,
            metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id, timestamp);
        """
    )


def inicializar_db() -> None:
    """Aplica las migraciones de esquema pendientes (Alembic)."""
    from persistencia.migraciones import actualizar_esquema

    actualizar_esquema()
