import json
import os
import sys
import time
import requests

API_URL = "http://127.0.0.1:8000/api/cbm/registro-directo"
HEADERS = {
    "Content-Type": "application/json",
    "X-Tenant-ID": "los-colorados",
    "Authorization": "Bearer jwt_mock_token_cio_v2"
}

ARCHIVO_JSON = os.path.join(os.path.dirname(__file__), "firebase_data.json")

def migrar():
    if not os.path.exists(ARCHIVO_JSON):
        print(f"❌ No se encontró el archivo: {ARCHIVO_JSON}")
        print("Descarga el JSON desde la consola de Firebase y guárdalo en la carpeta backend/ como 'firebase_data.json'.")
        sys.exit(1)

    with open(ARCHIVO_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # -------------------------------------------------------------------------
    # 1. Migración de Activos Críticos (Catastro Planta)
    # -------------------------------------------------------------------------
    activos = data.get("activos_criticos", {})
    print(f"\n📡 Procesando {len(activos)} activos críticos de Firebase...")
    exitos_activos = 0

    for id_firebase, activo in activos.items():
        tag = (activo.get("tag") or id_firebase).strip().upper()
        
        # Mapeo al contrato del backend
        payload_activo = {
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
                "criticidad": activo.get("criticidad") or "Media",
                "datos_origen": "firebase_import"
            },
            "timestamp": int(time.time() * 1000)
        }

        try:
            resp = requests.post(API_URL, json=payload_activo, headers=HEADERS, timeout=5)
            if resp.status_code in (200, 201):
                exitos_activos += 1
                print(f"  [OK] Activo {tag} migrado.")
            else:
                print(f"  [!] Falló activo {tag}: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"  [ERR] Error de conexión con activo {tag}: {e}")

    # -------------------------------------------------------------------------
    # 2. Migración de Alertas de Terreno (Bandeja Triage)
    # -------------------------------------------------------------------------
    alertas = data.get("alertas_terreno", {})
    print(f"\n📡 Procesando {len(alertas)} reportes de terreno...")
    exitos_alertas = 0

    for id_alerta, alerta in alertas.items():
        tag = (alerta.get("tag") or "S/T").strip().upper()
        timestamp_alerta = alerta.get("timestamp") or int(time.time() * 1000)

        payload_alerta = {
            "id": f"alerta_{id_alerta}",
            "tipo": "alerta_terreno",
            "payload": {
                "tag": tag,
                "area": alerta.get("area") or "General",
                "componente": alerta.get("componente") or "General",
                "severidad": alerta.get("severidad") or alerta.get("severidadPreliminar") or "AMARILLO",
                "descripcion": alerta.get("detalle") or alerta.get("descripcion") or "Sin descripción",
                "fotoBase64": alerta.get("fotoBase64") or "",
                "inspector": alerta.get("inspector") or "Inspector Terreno",
                "timestamp": timestamp_alerta
            },
            "timestamp": timestamp_alerta
        }

        try:
            resp = requests.post(API_URL, json=payload_alerta, headers=HEADERS, timeout=5)
            if resp.status_code in (200, 201):
                exitos_alertas += 1
                print(f"  [OK] Alerta {tag} ({id_alerta}) migrada.")
            else:
                print(f"  [!] Falló alerta {id_alerta}: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"  [ERR] Error de conexión con alerta {id_alerta}: {e}")

    print("\n" + "="*45)
    print(f"🎉 MIGRACIÓN FINALIZADA CON ÉXITO")
    print(f"   • Activos críticos insertados: {exitos_activos}/{len(activos)}")
    print(f"   • Reportes de terreno insertados: {exitos_alertas}/{len(alertas)}")
    print("="*45 + "\n")

if __name__ == "__main__":
    migrar()