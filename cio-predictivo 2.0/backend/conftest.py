"""Fixtures compartidas para los tests del backend."""

import os
import tempfile

# Variables de entorno ANTES de importar main/database/security.
_tmpdir = tempfile.mkdtemp(prefix="cio_test_")
os.environ["CIO_DB_PATH"] = os.path.join(_tmpdir, "test.db")
os.environ["CIO_SECRET_KEY"] = "test-secret-key-at-least-32-bytes-long!!"
os.environ["CIO_ADMIN_EMAIL"] = "admin@cpf.cl"
os.environ["CIO_ADMIN_PASSWORD"] = "TestPass123!"
os.environ["CIO_ADMIN_NOMBRE"] = "Administrador Test"
os.environ["CIO_TENANT_ID"] = "mina_los_colorados"
os.environ["CIO_IMPORTAR_FIREBASE"] = "0"
os.environ["CIO_TOKEN_HORAS"] = "8"

import pytest
from fastapi.testclient import TestClient

import main
from persistencia import RepositorioUsuarios, conexion_db


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        # Aislar cada test: limpiar tablas y re-sembrar admin.
        with conexion_db() as conexion:
            conexion.execute("DELETE FROM audit_log")
            conexion.execute("DELETE FROM cbm_records")
            conexion.execute("DELETE FROM users")
        RepositorioUsuarios().sembrar_admin()
        main._intentos_login.clear()
        yield c


def login(client, email="admin@cpf.cl", password="TestPass123!"):
    respuesta = client.post("/api/auth/login", json={"email": email, "password": password})
    assert respuesta.status_code == 200, respuesta.text
    datos = respuesta.json()
    return {
        "Authorization": f"Bearer {datos['access_token']}",
        "X-Tenant-ID": datos["usuario"]["tenantId"],
    }
