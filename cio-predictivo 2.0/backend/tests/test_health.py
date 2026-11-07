"""Tests de salud del backend."""


def test_health(client):
    respuesta = client.get("/api/health")
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "online"
    assert datos["system"] == "CIO Predictivo 2.0 Core"
    assert "version" in datos
