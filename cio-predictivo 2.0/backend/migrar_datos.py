import json
import os
import sys
import time
import requests

API_URL = "http://127.0.0.1:8000/api/cbm/registro-directo"
TENANT_ID = "mina_los_colorados"

HEADERS = {
    "Content-Type": "application/json",
    "X-Tenant-ID": TENANT_ID,
    "Authorization": "Bearer jwt_mock_token_cio_v2"
}

ARCHIVO_JSON = os.path.join(os.path.dirname(__file__), "firebase_data.json")

def ejecutar_migracion():
    if not os.path.exists(ARCHIVO_JSON):
        print(f"No se encontro el archivo: {ARCHIVO_JSON}")
        sys.exit(1)

    print("Leyendo archivo firebase_data.json...")
    with open(ARCHIVO_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Migracion de Activos Criticos
    activos = data.get("activos_criticos", {})
    print(f"\nInsertando {len(activos)} activos criticos en tenant '{TENANT_ID}'...")
    insertados_activos = 0

    for id_firebase, activo in activos.items():
        tag = (activo.get("tag") or id_firebase).strip().upper()

        payload_activo = {
            "resource": f"activo_catastro:{tag}",
            "actionType": "UPSERT",
            "id": tag,
            "tipo": "activo_catastro",
            "payload": {
                "tag": tag,
                "nombre": activo.get("nombre") or f"Activo {tag}",
                "area": activo.get("area") or "General",
                "nivel": activo.get("nivel") or "Nivel 1",
                "severidad": activo.get("severidad") or activo.get("estado") or "VERDE",
                "latitud": activo.get("latitud") or activo.get("lat"),
                "longitud": activo.get("longitud") or activo.get("lng"),
                "components": activo.get("componentes") or activo.get("components") or [],
                "spots": activo.get("spots") or {},
                "criticidad": activo.get("criticidad") or "Media"
            },
            "timestamp": int(time.time() * 1000)
        }

        try:
            r = requests.post(API_URL, json=payload_activo, headers=HEADERS, timeout=5)
            if r.status_code in (200, 201):
                insertados_activos += 1
                print(f"  [+] Activo {tag} migrado con exito.")
            else:
                print(f"  [-] Error en {tag}: {r.status_code} - {r.text}")
        except Exception as e:
            print(f"  [!] Conexion fallida en {tag}: {e}")

    # 2. Migracion de Alertas de Terreno
    alertas = data.get("alertas_terreno", {})
    print(f"\nInsertando {len(alertas)} alertas de terreno...")
    insertadas_alertas = 0

    for id_alerta, alerta in alertas.items():
        tag = (alerta.get("tag") or "S/T").strip().upper()
        ts = alerta.get("timestamp") or int(time.time() * 1000)

        payload_alerta = {
            "resource": f"alerta_terreno:{tag}",
            "actionType": "CREATE",
            "id": f"alerta_{id_alerta}",
            "tipo": "alerta_terreno",
            "payload": {
                "tag": tag,
                "area": alerta.get("area") or "General",
                "componente": alerta.get("componente") or "General",
                "severidad": alerta.get("severidad") or alerta.get("severidadPreliminar") or "AMARILLO",
                "descripcion": alerta.get("detalle") or alerta.get("descripcion") or "",
                "fotoBase64": alerta.get("fotoBase64") or "",
                "inspector": alerta.get("inspector") or "Inspector Terreno",
                "timestamp": ts
            },
            "timestamp": ts
        }

        try:
            r = requests.post(API_URL, json=payload_alerta, headers=HEADERS, timeout=5)
            if r.status_code in (200, 201):
                insertadas_alertas += 1
                print(f"  [+] Alerta {id_alerta} ({tag}) migrada con exito.")
            else:
                print(f"  [-] Error en alerta {id_alerta}: {r.status_code} - {r.text}")
        except Exception as e:
            print(f"  [!] Conexion fallida en alerta {id_alerta}: {e}")

    print("\n" + "="*50)
    print("INSERCION FINALIZADA:")
    print(f"   * Activos: {insertados_activos}/{len(activos)}")
    print(f"   * Alertas: {insertadas_alertas}/{len(alertas)}")
    print("="*50 + "\n")

if __name__ == "__main__":
    ejecutar_migracion()