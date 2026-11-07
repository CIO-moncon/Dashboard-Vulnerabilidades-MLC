"""Tests del endpoint de respaldo de base de datos."""

import os
import tempfile

from helpers import login


def test_backup_requiere_admin(client):
    import time

    import security
    from persistencia import conexion_db

    with conexion_db() as conexion:
        conexion.execute(
            """
            INSERT INTO users (id, email, password_hash, nombre, rol, tenant_id, activo, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                "usr_op2",
                "op2@cpf.cl",
                security.hash_password("OperadorPass123!"),
                "Operador2",
                "OPERADOR TERRENO",
                "mina_los_colorados",
                time.time(),
            ),
        )
    cabeceras = login(client, email="op2@cpf.cl", password="OperadorPass123!")
    respuesta = client.post("/api/admin/backup", headers=cabeceras)
    assert respuesta.status_code == 403


def test_backup_genera_archivo(client, monkeypatch):
    directorio = tempfile.mkdtemp(prefix="cio_backup_test_")
    monkeypatch.setenv("CIO_BACKUP_DIR", directorio)

    cabeceras = login(client)
    respuesta = client.post("/api/admin/backup", headers=cabeceras)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    assert datos["tamano_bytes"] > 0
    assert os.path.exists(datos["archivo"])
    assert os.path.getsize(datos["archivo"]) == datos["tamano_bytes"]
