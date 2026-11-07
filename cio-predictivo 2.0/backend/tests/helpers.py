"""Helpers compartidos para los tests del backend."""


def login(client, email="admin@cpf.cl", password="TestPass123!"):
    respuesta = client.post("/api/auth/login", json={"email": email, "password": password})
    assert respuesta.status_code == 200, respuesta.text
    datos = respuesta.json()
    return {
        "Authorization": f"Bearer {datos['access_token']}",
        "X-Tenant-ID": datos["usuario"]["tenantId"],
    }
