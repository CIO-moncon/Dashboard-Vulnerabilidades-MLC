"""Tests de autenticación y autorización."""

from helpers import login


def test_login_exitoso(client):
    respuesta = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "TestPass123!"},
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["token_type"] == "bearer"
    assert datos["access_token"]
    assert datos["expires_in"] > 0
    assert datos["usuario"]["rol"] == "ADMINISTRADOR"
    assert datos["usuario"]["tenantId"] == "mina_los_colorados"


def test_login_password_incorrecta(client):
    respuesta = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "incorrecta"},
    )
    assert respuesta.status_code == 401
    assert "Credenciales" in respuesta.json()["detail"]


def test_login_email_inexistente(client):
    respuesta = client.post(
        "/api/auth/login",
        json={"email": "noexiste@cpf.cl", "password": "cualquier123"},
    )
    assert respuesta.status_code == 401


def test_login_password_corta_rechazada_por_validacion(client):
    respuesta = client.post("/api/auth/login", json={"email": "admin@cpf.cl", "password": "corta"})
    assert respuesta.status_code == 422


def test_me_sin_token(client):
    respuesta = client.get("/api/cbm/registros")
    assert respuesta.status_code == 401


def test_me_con_token(client):
    cabeceras = login(client)
    respuesta = client.get("/api/auth/me", headers=cabeceras)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["email"] == "admin@cpf.cl"
    assert datos["rol"] == "ADMINISTRADOR"


def test_tenant_mismatch_rechazado(client):
    cabeceras = login(client)
    cabeceras["X-Tenant-ID"] = "otro_tenant"
    respuesta = client.get("/api/cbm/registros", headers=cabeceras)
    assert respuesta.status_code == 403


def test_change_password_flujo_completo(client):
    cabeceras = login(client)
    respuesta = client.post(
        "/api/auth/change-password",
        headers=cabeceras,
        json={
            "password_actual": "TestPass123!",
            "password_nueva": "NuevaClaveSuperSegura123!",
        },
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"

    # La clave antigua deja de funcionar.
    reintento = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "TestPass123!"},
    )
    assert reintento.status_code == 401

    # La nueva clave funciona.
    nuevo = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "NuevaClaveSuperSegura123!"},
    )
    assert nuevo.status_code == 200


def test_change_password_actual_incorrecta(client):
    cabeceras = login(client)
    respuesta = client.post(
        "/api/auth/change-password",
        headers=cabeceras,
        json={
            "password_actual": "clave-incorrecta",
            "password_nueva": "NuevaClaveSuperSegura123!",
        },
    )
    assert respuesta.status_code == 400


def test_change_password_nueva_demasiado_corta(client):
    cabeceras = login(client)
    respuesta = client.post(
        "/api/auth/change-password",
        headers=cabeceras,
        json={"password_actual": "TestPass123!", "password_nueva": "corta"},
    )
    assert respuesta.status_code == 422


def test_rate_limit_bloquea_tras_10_fallos(client):
    for _ in range(10):
        client.post(
            "/api/auth/login",
            json={"email": "admin@cpf.cl", "password": "incorrecta"},
        )
    respuesta = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "incorrecta"},
    )
    assert respuesta.status_code == 429
