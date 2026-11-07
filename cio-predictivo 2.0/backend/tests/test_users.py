"""Tests de gestión de usuarios (solo ADMINISTRADOR)."""

from helpers import login


def _admin(client):
    return login(client)


def test_listar_usuarios_requiere_admin(client):
    # Crear un operador y loguearse con él.
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
    respuesta = client.get("/api/users", headers=cabeceras)
    assert respuesta.status_code == 403


def test_listar_usuarios_admin(client):
    cabeceras = _admin(client)
    respuesta = client.get("/api/users", headers=cabeceras)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert "usuarios" in datos
    # Al menos el admin inicial.
    assert len(datos["usuarios"]) >= 1
    # No debe exponer password_hash.
    for u in datos["usuarios"]:
        assert "password_hash" not in u
        assert "email" in u


def test_crear_usuario(client):
    cabeceras = _admin(client)
    respuesta = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "nuevo@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "Nuevo Usuario",
            "rol": "ANALISTA CBM",
        },
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "success"
    usuario = datos["usuario"]
    assert usuario["email"] == "nuevo@cpf.cl"
    assert usuario["rol"] == "ANALISTA CBM"
    assert usuario["activo"] is True

    # Puede loguearse con la nueva clave.
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "nuevo@cpf.cl", "password": "ClaveSeguraNueva123!"},
    )
    assert login_resp.status_code == 200


def test_crear_usuario_email_duplicado(client):
    cabeceras = _admin(client)
    client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "dup@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "Dup",
            "rol": "OPERADOR TERRENO",
        },
    )
    respuesta = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "dup@cpf.cl",
            "password": "OtraClaveSegura123!",
            "nombre": "Dup2",
            "rol": "OPERADOR TERRENO",
        },
    )
    assert respuesta.status_code == 409


def test_crear_usuario_rol_invalido(client):
    cabeceras = _admin(client)
    respuesta = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "x@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "X",
            "rol": "SUPER_ADMIN",
        },
    )
    assert respuesta.status_code == 422


def test_crear_usuario_password_corta(client):
    cabeceras = _admin(client)
    respuesta = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "y@cpf.cl",
            "password": "corta",
            "nombre": "Y",
            "rol": "OPERADOR TERRENO",
        },
    )
    assert respuesta.status_code == 422


def test_actualizar_usuario_nombre_y_rol(client):
    cabeceras = _admin(client)
    creado = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "upd@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "Original",
            "rol": "OPERADOR TERRENO",
        },
    ).json()["usuario"]

    respuesta = client.put(
        f"/api/users/{creado['id']}",
        headers=cabeceras,
        json={"nombre": "Actualizado", "rol": "ANALISTA CBM"},
    )
    assert respuesta.status_code == 200
    usuario = respuesta.json()["usuario"]
    assert usuario["nombre"] == "Actualizado"
    assert usuario["rol"] == "ANALISTA CBM"


def test_desactivar_usuario(client):
    cabeceras = _admin(client)
    creado = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "des@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "Desact",
            "rol": "OPERADOR TERRENO",
        },
    ).json()["usuario"]

    respuesta = client.put(
        f"/api/users/{creado['id']}",
        headers=cabeceras,
        json={"activo": False},
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["usuario"]["activo"] is False

    # El usuario desactivado no puede loguearse.
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "des@cpf.cl", "password": "ClaveSeguraNueva123!"},
    )
    assert login_resp.status_code == 401


def test_no_desactivar_propia_cuenta(client):
    cabeceras = _admin(client)
    me = client.get("/api/auth/me", headers=cabeceras).json()
    respuesta = client.put(
        f"/api/users/{me['uid']}",
        headers=cabeceras,
        json={"activo": False},
    )
    assert respuesta.status_code == 400


def test_no_desactivar_ultimo_admin(client):
    cabeceras = _admin(client)
    me = client.get("/api/auth/me", headers=cabeceras).json()
    respuesta = client.put(
        f"/api/users/{me['uid']}",
        headers=cabeceras,
        json={"rol": "SUPERVISOR"},
    )
    assert respuesta.status_code == 400


def test_reset_password_por_admin(client):
    cabeceras = _admin(client)
    creado = client.post(
        "/api/users",
        headers=cabeceras,
        json={
            "email": "reset@cpf.cl",
            "password": "ClaveSeguraNueva123!",
            "nombre": "Reset",
            "rol": "OPERADOR TERRENO",
        },
    ).json()["usuario"]

    respuesta = client.post(
        f"/api/users/{creado['id']}/reset-password",
        headers=cabeceras,
        json={"password_nueva": "NuevaClaveResetSegura123!"},
    )
    assert respuesta.status_code == 200

    # Clave antigua falla, la nueva funciona.
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "reset@cpf.cl", "password": "ClaveSeguraNueva123!"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "reset@cpf.cl", "password": "NuevaClaveResetSegura123!"},
        ).status_code
        == 200
    )


def test_reset_password_usuario_inexistente(client):
    cabeceras = _admin(client)
    respuesta = client.post(
        "/api/users/usr_noexiste/reset-password",
        headers=cabeceras,
        json={"password_nueva": "NuevaClaveResetSegura123!"},
    )
    assert respuesta.status_code == 404


def test_usuario_de_otro_tenant_no_visible(client):
    cabeceras = _admin(client)
    respuesta = client.get("/api/users", headers=cabeceras)
    assert respuesta.status_code == 200
    # Todos los usuarios listados pertenecen al tenant del admin.
    for u in respuesta.json()["usuarios"]:
        assert u["tenant_id"] == "mina_los_colorados"
