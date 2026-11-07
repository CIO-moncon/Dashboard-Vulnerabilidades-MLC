"""Tests unitarios de los repositorios con una base SQLite inyectada.

A diferencia de los tests de API (que usan la base global configurada por
``conftest.py``), aquí se inyecta una fábrica de conexiones apuntando a una
base temporal. Esto valida que la capa de persistencia es testeable de forma
aislada y sin depender de FastAPI.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager

import pytest

from persistencia import (
    RepositorioAuditoria,
    RepositorioCbm,
    RepositorioUsuarios,
    crear_esquema,
)

TENANT = "mina_los_colorados"


@pytest.fixture
def repositorios(tmp_path):
    ruta = tmp_path / "repos.db"

    @contextmanager
    def fabrica():
        conexion = sqlite3.connect(ruta, timeout=15)
        conexion.row_factory = sqlite3.Row
        conexion.execute("PRAGMA foreign_keys = ON;")
        try:
            yield conexion
            conexion.commit()
        except Exception:
            conexion.rollback()
            raise
        finally:
            conexion.close()

    with fabrica() as conexion:
        crear_esquema(conexion)

    return (
        RepositorioUsuarios(fabrica),
        RepositorioCbm(fabrica),
        RepositorioAuditoria(fabrica),
    )


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------
def test_usuarios_crud_y_busqueda_case_insensitive(repositorios):
    usuarios, _, _ = repositorios

    creado = usuarios.crear(
        email="Operador@CPF.cl",
        password_hash="hash-falso",
        nombre="Operador Uno",
        rol="OPERADOR TERRENO",
        tenant_id=TENANT,
    )
    assert creado["email"] == "operador@cpf.cl"

    encontrado = usuarios.buscar_por_email("OPERADOR@cpf.cl")
    assert encontrado is not None
    assert encontrado["id"] == creado["id"]
    assert encontrado["activo"] is True
    assert usuarios.buscar_por_id("inexistente") is None

    assert usuarios.actualizar(creado["id"], nombre="Operador Actualizado") is True
    assert usuarios.buscar_por_id(creado["id"])["nombre"] == "Operador Actualizado"

    assert usuarios.actualizar_password_hash(creado["id"], "nuevo-hash") is True
    assert usuarios.buscar_por_id(creado["id"])["password_hash"] == "nuevo-hash"

    listados = usuarios.listar(TENANT)
    assert len(listados) == 1
    assert "password_hash" not in listados[0]
    assert usuarios.contar_administradores_activos(TENANT) == 0


def test_usuarios_rechaza_rol_invalido(repositorios):
    usuarios, _, _ = repositorios
    with pytest.raises(ValueError, match="Rol inválido"):
        usuarios.crear("x@cpf.cl", "hash", "X", "HACKER", TENANT)


def test_sembrar_admin_es_idempotente(repositorios, monkeypatch):
    usuarios, _, _ = repositorios
    monkeypatch.setenv("CIO_ADMIN_EMAIL", "jefa@cpf.cl")
    monkeypatch.setenv("CIO_ADMIN_PASSWORD", "ClaveSegura123!")
    monkeypatch.setenv("CIO_ADMIN_NOMBRE", "Jefa CBM")

    usuarios.sembrar_admin()
    admin = usuarios.buscar_por_email("jefa@cpf.cl")
    assert admin is not None
    assert admin["rol"] == "ADMINISTRADOR"
    assert usuarios.contar_administradores_activos(admin["tenant_id"]) == 1

    usuarios.sembrar_admin()
    assert len(usuarios.listar(admin["tenant_id"])) == 1


# ---------------------------------------------------------------------------
# CBM
# ---------------------------------------------------------------------------
def test_cbm_upsert_es_idempotente(repositorios):
    _, cbm, _ = repositorios

    primero = cbm.upsert_activo(TENANT, "usr_1", " eq-01 ", {"tag": "EQ-01", "severidad": "VERDE"})
    assert primero["accion"] == "creado"

    segundo = cbm.upsert_activo(TENANT, "usr_2", "eq-01", {"tag": "EQ-01", "severidad": "ROJO"})
    assert segundo["accion"] == "actualizado"
    assert segundo["id"] == primero["id"]

    assert cbm.contar_registros(TENANT) == 1
    registros = cbm.listar_registros(TENANT, tag="eq-01")
    assert len(registros) == 1
    assert registros[0]["payload"]["severidad"] == "ROJO"
    assert registros[0]["user_id"] == "usr_1"


def test_cbm_crear_registro_y_filtrar_por_tenant(repositorios):
    _, cbm, _ = repositorios

    cbm.crear_registro("rec_1", TENANT, "usr_1", "alerta_terreno:EQ-01", "CREATE", {"tag": "EQ-01"})
    cbm.crear_registro(
        "rec_2", "otro_tenant", "usr_2", "alerta_terreno:EQ-02", "CREATE", {"tag": "EQ-02"}
    )

    assert cbm.contar_registros() == 2
    assert cbm.contar_registros(TENANT) == 1
    assert [r["id"] for r in cbm.listar_registros(TENANT)] == ["rec_1"]


# ---------------------------------------------------------------------------
# Auditoría
# ---------------------------------------------------------------------------
def test_auditoria_registrar_y_listar(repositorios):
    _, _, auditoria = repositorios

    auditoria.registrar(
        TENANT,
        "usr_1",
        "ADMINISTRADOR",
        "LOGIN",
        "usuario:usr_1",
        metadata={"email": "a@cpf.cl"},
    )
    auditoria.registrar(TENANT, "usr_1", "ADMINISTRADOR", "CREATE_USER", "usuario:usr_2")

    logs = auditoria.listar(TENANT)
    assert len(logs) == 2
    assert {log["action_type"] for log in logs} == {"LOGIN", "CREATE_USER"}
    login = next(log for log in logs if log["action_type"] == "LOGIN")
    assert login["metadata"] == {"email": "a@cpf.cl"}
    assert auditoria.listar("otro_tenant") == []
