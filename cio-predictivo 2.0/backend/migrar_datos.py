"""Migración manual de firebase_data.json hacia el backend SQLite.

El backend ya importa este archivo automáticamente en el primer arranque si la
tabla `cbm_records` está vacía. Este script sirve para forzar una re-importación
o para migrar contra un backend ya en ejecución.

Uso (desde la carpeta backend/):

    set CIO_ADMIN_EMAIL=admin@cpf.cl
    set CIO_ADMIN_PASSWORD=TuClaveSegura
    python migrar_datos.py

Variables opcionales:
    CIO_API_URL   URL base del backend (por defecto http://127.0.0.1:8000)
    CIO_TENANT_ID Tenant destino (por defecto mina_los_colorados)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

try:  # Carga opcional de backend/.env para reutilizar la configuración del backend.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

API_URL = os.getenv("CIO_API_URL", "http://127.0.0.1:8000").rstrip("/")
TENANT_ID = os.getenv("CIO_TENANT_ID", "mina_los_colorados")
EMAIL = os.getenv("CIO_ADMIN_EMAIL", "admin@cpf.cl")
PASSWORD = os.getenv("CIO_ADMIN_PASSWORD", "CambiarEstaClave123!")

ARCHIVO_JSON = os.path.join(os.path.dirname(__file__), "firebase_data.json")


def _post_json(ruta: str, cuerpo: dict, token: str | None = None) -> tuple[int, dict]:
    """Realiza un POST JSON sin dependencias externas."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Tenant-ID"] = TENANT_ID

    solicitud = urllib.request.Request(
        f"{API_URL}{ruta}",
        data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(solicitud, timeout=10) as respuesta:
            return respuesta.status, json.loads(respuesta.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        detalle = error.read().decode("utf-8", errors="replace")
        return error.code, {"detail": detalle}
    except urllib.error.URLError as error:
        return 0, {"detail": f"No se pudo conectar con {API_URL}: {error.reason}"}


def autenticar() -> str:
    estado, data = _post_json("/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if estado != 200 or not data.get("access_token"):
        print(f"[!] Login fallido (HTTP {estado}): {data.get('detail', data)}")
        sys.exit(1)
    print(f"[+] Autenticado como {data.get('usuario', {}).get('email', EMAIL)}")
    return str(data["access_token"])


def enviar(token: str, recurso: str, accion: str, payload: dict) -> bool:
    estado, data = _post_json(
        "/api/cbm/registro-directo",
        {"resource": recurso, "actionType": accion, "payload": payload},
        token=token,
    )
    if estado in (200, 201):
        return True
    print(f"  [-] Error HTTP {estado}: {data.get('detail', data)}")
    return False


def ejecutar_migracion() -> None:
    if not os.path.exists(ARCHIVO_JSON):
        print(f"No se encontró el archivo: {ARCHIVO_JSON}")
        sys.exit(1)

    token = autenticar()

    print("Leyendo firebase_data.json...")
    with open(ARCHIVO_JSON, encoding="utf-8") as archivo:
        data = json.load(archivo)

    # 1. Activos críticos
    activos = data.get("activos_criticos", {}) or {}
    print(f"\nInsertando {len(activos)} activos críticos en tenant '{TENANT_ID}'...")
    insertados_activos = 0

    for id_firebase, activo in activos.items():
        tag = (activo.get("tag") or id_firebase).strip().upper()
        payload_activo = {
            "tag": tag,
            "nombre": activo.get("nombre") or f"Activo {tag}",
            "area": activo.get("area") or "General",
            "nivel": activo.get("nivel") or "Nivel 1",
            "severidad": activo.get("severidad") or activo.get("estado") or "VERDE",
            "latitud": activo.get("latitud") or activo.get("lat"),
            "longitud": activo.get("longitud") or activo.get("lng"),
            "components": activo.get("componentes") or activo.get("components") or [],
            "spots": activo.get("spots") or {},
            "criticidad": activo.get("criticidad") or "Media",
        }
        if enviar(token, f"activo_catastro:{tag}", "UPSERT", payload_activo):
            insertados_activos += 1
            print(f"  [+] Activo {tag} migrado con éxito.")
        else:
            print(f"  [-] No se pudo migrar el activo {tag}.")

    # 2. Alertas de terreno
    alertas = data.get("alertas_terreno", {}) or {}
    print(f"\nInsertando {len(alertas)} alertas de terreno...")
    insertadas_alertas = 0

    for id_alerta, alerta in alertas.items():
        tag = (alerta.get("tag") or "S/T").strip().upper()
        ts = alerta.get("timestamp") or int(time.time() * 1000)
        payload_alerta = {
            "tag": tag,
            "area": alerta.get("area") or "General",
            "componente": alerta.get("componente") or "General",
            "severidad": alerta.get("severidad") or alerta.get("severidadPreliminar") or "AMARILLO",
            "descripcion": alerta.get("detalle") or alerta.get("descripcion") or "",
            "fotoBase64": alerta.get("fotoBase64") or "",
            "inspector": alerta.get("inspector") or "Inspector Terreno",
            "timestamp": ts,
        }
        if enviar(token, f"alerta_terreno:{tag}", "CREATE", payload_alerta):
            insertadas_alertas += 1
            print(f"  [+] Alerta {id_alerta} ({tag}) migrada con éxito.")
        else:
            print(f"  [-] No se pudo migrar la alerta {id_alerta} ({tag}).")

    print("\n" + "=" * 50)
    print("INSERCIÓN FINALIZADA:")
    print(f"   * Activos: {insertados_activos}/{len(activos)}")
    print(f"   * Alertas: {insertadas_alertas}/{len(alertas)}")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    ejecutar_migracion()
