"""Tests del flujo de cookies HttpOnly para la sesión."""

from helpers import login


def _login(client):
    respuesta = client.post(
        "/api/auth/login",
        json={"email": "admin@cpf.cl", "password": "TestPass123!"},
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta


def test_login_establece_cookies_httponly(client):
    respuesta = _login(client)

    assert respuesta.cookies.get("cio_access_token")
    assert respuesta.cookies.get("cio_refresh_token")

    set_cookie = respuesta.headers.get("set-cookie", "")
    assert "cio_access_token" in set_cookie
    assert "cio_refresh_token" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie or "samesite=lax" in set_cookie


def test_me_con_cookie_sin_authorization(client):
    _login(client)

    # Sin cabecera Authorization: la cookie HttpOnly debe bastar.
    respuesta = client.get("/api/auth/me", headers={"X-Tenant-ID": "mina_los_colorados"})
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["email"] == "admin@cpf.cl"


def test_refresh_con_cookie_sin_cuerpo(client):
    _login(client)

    respuesta = client.post("/api/auth/refresh")
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["access_token"]
    assert respuesta.cookies.get("cio_access_token")


def test_logout_limpia_cookies_y_revoca(client):
    _login(client)

    assert client.post("/api/auth/logout").status_code == 200

    # Sin cookie ni cuerpo ya no es posible refrescar.
    assert client.post("/api/auth/refresh").status_code == 401


def test_bearer_sigue_funcionando_para_cli(client):
    # El flujo Bearer (scripts/CLI) debe seguir operativo tras la migración.
    cabeceras = login(client)
    respuesta = client.get("/api/auth/me", headers=cabeceras)
    assert respuesta.status_code == 200
