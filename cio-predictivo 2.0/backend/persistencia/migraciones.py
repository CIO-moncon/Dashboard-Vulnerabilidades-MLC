"""Ejecución de migraciones de esquema con Alembic.

``actualizar_esquema`` es invocado por ``persistencia/conexion.inicializar_db``
durante el arranque. Maneja tres casos:

  1. Base nueva (sin tabla ``users``): aplica ``head`` y crea todo el esquema.
  2. Base existente creada antes de Alembic (tiene ``users`` pero no
     ``alembic_version``): sella la revisión inicial ``0001`` y luego aplica
     las revisiones pendientes.
  3. Base ya migrada: aplica únicamente las revisiones pendientes.
"""

from __future__ import annotations

import os
import sqlite3

from alembic.config import Config

from alembic import command

_DIRECTORIO_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ruta_db() -> str:
    return os.getenv(
        "CIO_DB_PATH",
        os.path.join(_DIRECTORIO_BACKEND, "cio_predictivo.db"),
    )


def _config_alembic() -> Config:
    config = Config(os.path.join(_DIRECTORIO_BACKEND, "alembic.ini"))
    config.set_main_option("sqlalchemy.url", "sqlite:///" + _ruta_db().replace("\\", "/"))
    return config


def _conectar_crudo() -> sqlite3.Connection:
    conexion = sqlite3.connect(_ruta_db(), timeout=15)
    conexion.row_factory = sqlite3.Row
    return conexion


def _asegurar_wal() -> None:
    """Habilita WAL antes de migrar (seguro y persistente)."""
    conexion = _conectar_crudo()
    try:
        conexion.execute("PRAGMA journal_mode = WAL;")
    finally:
        conexion.close()


def _existe_tabla(nombre: str) -> bool:
    conexion = _conectar_crudo()
    try:
        fila = conexion.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (nombre,),
        ).fetchone()
    finally:
        conexion.close()
    return fila is not None


def _version_actual() -> str | None:
    conexion = _conectar_crudo()
    try:
        fila = conexion.execute("SELECT version_num FROM alembic_version").fetchone()
    except sqlite3.OperationalError:
        return None
    finally:
        conexion.close()
    return fila["version_num"] if fila else None


def actualizar_esquema() -> None:
    """Aplica las migraciones pendientes (crea o adopta el esquema)."""
    _asegurar_wal()

    config = _config_alembic()

    if _existe_tabla("users") and _version_actual() is None:
        # Base anterior a Alembic: equivale a la revisión inicial (0001), que
        # no crea tabla de versiones. Se sella en 0001 y luego se aplican las
        # migraciones pendientes (p. ej. 0002) mediante upgrade head.
        command.stamp(config, "0001")

    command.upgrade(config, "head")
