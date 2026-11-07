"""Tests para verificar la presencia de cabeceras de seguridad HTTP y CSP."""


def test_cabeceras_seguridad_presentes(client):
    respuesta = client.get("/api/health")
    assert respuesta.status_code == 200

    headers = respuesta.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "geolocation=()" in headers.get("Permissions-Policy", "")
    assert "default-src 'self'" in headers.get("Content-Security-Policy", "")
    assert "frame-ancestors 'none'" in headers.get("Content-Security-Policy", "")


def test_hsts_desactivado_por_defecto_en_desarrollo(client):
    respuesta = client.get("/api/health")
    assert "Strict-Transport-Security" not in respuesta.headers
