"""Tests del flujo de refresh tokens (login, refresh, logout, revocación)."""

from helpers import login


def _login_datos(client, email="admin@cpf.cl", password="TestPass123!"):
    respuesta = client.post("/api/auth/login", json={"email": email, "password": password})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def test_login_devuelve_refresh_token(client):
    datos = _login_datos(client)
    assert datos["access_token"]
    assert datos["refresh_token"]
    assert datos["refresh_expires_in"] > 0


def test_refresh_emite_nuevo_access_token(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]

    respuesta = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert respuesta.status_code == 200, respuesta.text
    nuevos = respuesta.json()

    assert nuevos["access_token"]
    assert nuevos["refresh_token"]
    assert nuevos["refresh_token"] != refresh  # rotación
    assert nuevos["usuario"]["email"] == "admin@cpf.cl"

    cabeceras = {
        "Authorization": f"Bearer {nuevos['access_token']}",
        "X-Tenant-ID": nuevos["usuario"]["tenantId"],
    }
    assert client.get("/api/auth/me", headers=cabeceras).status_code == 200


def test_refresh_rechaza_token_reutilizado(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]

    primera = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert primera.status_code == 200

    # En el navegador la cookie HttpOnly (nueva) tiene prioridad; simulamos el
    # escenario CLI/sin cookie limpiando el jar para probar solo el token del cuerpo.
    client.cookies.clear()

    segunda = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert segunda.status_code == 401


def test_refresh_rechaza_token_invalido(client):
    respuesta = client.post("/api/auth/refresh", json={"refresh_token": "x" * 40})
    assert respuesta.status_code == 401


def test_logout_revoca_refresh(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]

    assert client.post("/api/auth/logout", json={"refresh_token": refresh}).status_code == 200

    # El token revocado ya no puede refrescar.
    assert client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_logout_es_idempotente(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]

    assert client.post("/api/auth/logout", json={"refresh_token": refresh}).status_code == 200
    assert client.post("/api/auth/logout", json={"refresh_token": refresh}).status_code == 200


def test_cambio_password_revoca_refresh(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]
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

    assert client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_reset_password_revoca_refresh(client):
    datos = _login_datos(client)
    refresh = datos["refresh_token"]
    cabeceras = login(client)

    respuesta = client.post(
        "/api/users/{}/reset-password".format(datos["usuario"]["uid"]),
        headers=cabeceras,
        json={"password_nueva": "OtraClaveSegura123!"},
    )
    assert respuesta.status_code == 200

    assert client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code == 401
