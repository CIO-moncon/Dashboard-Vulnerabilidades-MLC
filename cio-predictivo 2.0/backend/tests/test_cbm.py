"""Tests de endpoints CBM y sincronización del Outbox."""

from helpers import login


def test_registro_directo_create(client):
    cabeceras = login(client)
    respuesta = client.post(
        "/api/cbm/registro-directo",
        headers=cabeceras,
        json={
            "resource": "alerta_terreno:T1",
            "actionType": "CREATE",
            "payload": {"tag": "T1", "severidad": "AMARILLO"},
        },
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "success"


def test_listar_registros(client):
    cabeceras = login(client)
    client.post(
        "/api/cbm/registro-directo",
        headers=cabeceras,
        json={
            "resource": "alerta_terreno:T1",
            "actionType": "CREATE",
            "payload": {"tag": "T1"},
        },
    )
    respuesta = client.get("/api/cbm/registros", headers=cabeceras)
    assert respuesta.status_code == 200
    assert respuesta.json()["total"] >= 1


def test_filtro_por_tag(client):
    cabeceras = login(client)
    client.post(
        "/api/cbm/registro-directo",
        headers=cabeceras,
        json={
            "resource": "activo_catastro:EQ-1",
            "actionType": "UPSERT",
            "payload": {"tag": "EQ-1", "nombre": "Equipo 1"},
        },
    )
    respuesta = client.get("/api/cbm/registros?tag=EQ-1", headers=cabeceras)
    assert respuesta.status_code == 200
    for registro in respuesta.json()["registros"]:
        assert registro["payload"].get("tag") == "EQ-1"


def test_upsert_activo_actualiza(client):
    cabeceras = login(client)
    client.post(
        "/api/cbm/registro-directo",
        headers=cabeceras,
        json={
            "resource": "activo_catastro:EQ-2",
            "actionType": "UPSERT",
            "payload": {"tag": "EQ-2", "nombre": "Original"},
        },
    )
    client.post(
        "/api/cbm/registro-directo",
        headers=cabeceras,
        json={
            "resource": "activo_catastro:EQ-2",
            "actionType": "UPSERT",
            "payload": {"tag": "EQ-2", "nombre": "Actualizado"},
        },
    )
    respuesta = client.get("/api/cbm/registros?tag=EQ-2", headers=cabeceras)
    nombres = [r["payload"].get("nombre") for r in respuesta.json()["registros"]]
    assert "Actualizado" in nombres


def test_sync_outbox_valida_tenant(client):
    cabeceras = login(client)
    cuerpo = {
        "tenantId": "mina_los_colorados",
        "items": [
            {
                "id": "o1",
                "tenantId": "mina_los_colorados",
                "actionType": "CREATE",
                "resource": "alerta_terreno:X",
                "payload": {"tag": "X"},
            },
            {
                "id": "o2",
                "tenantId": "otro_tenant",
                "actionType": "CREATE",
                "resource": "x",
                "payload": {"tag": "X"},
            },
        ],
    }
    respuesta = client.post("/api/cbm/sincronizar-outbox", headers=cabeceras, json=cuerpo)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["sincronizados"] == ["o1"]
    assert len(datos["rechazados"]) == 1
    assert "Inconsistencia de tenant" in datos["rechazados"][0]["motivo"]


def test_sync_outbox_actiontype_invalido(client):
    cabeceras = login(client)
    cuerpo = {
        "tenantId": "mina_los_colorados",
        "items": [
            {
                "id": "o3",
                "tenantId": "mina_los_colorados",
                "actionType": "INVALIDO",
                "resource": "x",
                "payload": {"tag": "X"},
            }
        ],
    }
    respuesta = client.post("/api/cbm/sincronizar-outbox", headers=cabeceras, json=cuerpo)
    assert respuesta.status_code == 200
    assert respuesta.json()["sincronizados"] == []
    assert len(respuesta.json()["rechazados"]) == 1


def test_auditoria_requiere_rol(client):
    cabeceras = login(client)
    respuesta = client.get("/api/auditoria", headers=cabeceras)
    assert respuesta.status_code == 200
    assert isinstance(respuesta.json()["logs"], list)


def test_analizar_vibracion_validacion_muestras(client):
    cabeceras = login(client)
    respuesta = client.post(
        "/api/analizar-vibracion",
        headers=cabeceras,
        json={"tag_equipo": "EQ1", "amplitudes": [1.0, 2.0], "frecuencia_muestreo": 1000},
    )
    assert respuesta.status_code == 422


def test_analizar_vibracion_ok(client):
    cabeceras = login(client)
    amplitudes = [0.1] * 100
    respuesta = client.post(
        "/api/analizar-vibracion",
        headers=cabeceras,
        json={"tag_equipo": "EQ1", "amplitudes": amplitudes, "frecuencia_muestreo": 1000},
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["tag_equipo"] == "EQ1"
    assert "resultado_analisis" in datos
    assert "picos_espectrales_dominantes" in datos["resultado_analisis"]
    assert "grafico_fft_base64" in datos["resultado_analisis"]


def test_rol_insuficiente_analizar(client):
    import time

    import security
    from persistencia import conexion_db

    # Crear un usuario con rol OPERADOR TERRENO directamente en la BD.
    with conexion_db() as conexion:
        conexion.execute(
            """
            INSERT INTO users (id, email, password_hash, nombre, rol, tenant_id, activo, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                "usr_op",
                "op@cpf.cl",
                security.hash_password("OperadorPass123!"),
                "Operador",
                "OPERADOR TERRENO",
                "mina_los_colorados",
                time.time(),
            ),
        )

    cabeceras = login(client, email="op@cpf.cl", password="OperadorPass123!")
    amplitudes = [0.1] * 100
    respuesta = client.post(
        "/api/analizar-vibracion",
        headers=cabeceras,
        json={"tag_equipo": "EQ1", "amplitudes": amplitudes, "frecuencia_muestreo": 1000},
    )
    assert respuesta.status_code == 403
