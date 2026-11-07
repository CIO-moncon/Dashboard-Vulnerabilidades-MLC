"""Tests de la ejecución de migraciones Alembic."""

from __future__ import annotations

import sqlite3

from persistencia.conexion import crear_esquema
from persistencia.migraciones import actualizar_esquema


def _tablas(ruta: str) -> set[str]:
    conexion = sqlite3.connect(ruta)
    conexion.row_factory = sqlite3.Row
    try:
        filas = conexion.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        ).fetchall()
        return {fila["name"] for fila in filas}
    finally:
        conexion.close()


def _version(ruta: str) -> str | None:
    conexion = sqlite3.connect(ruta)
    try:
        fila = conexion.execute("SELECT version_num FROM alembic_version").fetchone()
    except sqlite3.OperationalError:
        return None
    finally:
        conexion.close()
    return fila[0] if fila else None


def test_migracion_crea_esquema_nuevo(tmp_path, monkeypatch):
    ruta = str(tmp_path / "nueva.db")
    monkeypatch.setenv("CIO_DB_PATH", ruta)

    actualizar_esquema()

    tablas = _tablas(ruta)
    assert {"users", "cbm_records", "audit_log", "refresh_tokens", "alembic_version"} <= tablas
    assert _version(ruta) == "0002"


def test_migracion_adopta_base_legacy(tmp_path, monkeypatch):
    # Base creada con el DDL anterior (sin tabla alembic_version ni refresh_tokens).
    ruta = str(tmp_path / "legacy.db")
    conexion = sqlite3.connect(ruta)
    conexion.row_factory = sqlite3.Row
    try:
        crear_esquema(conexion)
        conexion.commit()
    finally:
        conexion.close()

    assert "alembic_version" not in _tablas(ruta)
    assert "refresh_tokens" not in _tablas(ruta)

    monkeypatch.setenv("CIO_DB_PATH", ruta)
    actualizar_esquema()

    # La base se adopta en 0001 y se aplica 0002 (refresh_tokens) encima.
    assert _version(ruta) == "0002"
    assert {"users", "cbm_records", "audit_log", "refresh_tokens"} <= _tablas(ruta)


def test_migracion_es_idempotente(tmp_path, monkeypatch):
    ruta = str(tmp_path / "repetida.db")
    monkeypatch.setenv("CIO_DB_PATH", ruta)

    actualizar_esquema()
    actualizar_esquema()

    assert _version(ruta) == "0002"
    assert {"users", "cbm_records", "audit_log", "refresh_tokens", "alembic_version"} <= _tablas(
        ruta
    )
