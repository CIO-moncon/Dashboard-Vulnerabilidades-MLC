"""Migración inicial desde ``firebase_data.json`` hacia SQLite."""

from __future__ import annotations

import json
import os
import time

from persistencia.cbm import RepositorioCbm
from persistencia.conexion import RUTA_FIREBASE, TENANT_DEFECTO


def importar_firebase_si_vacio(repositorio_cbm: RepositorioCbm) -> None:
    """Carga firebase_data.json solo la primera vez (base de datos vacía)."""
    if os.getenv("CIO_IMPORTAR_FIREBASE", "1").lower() in {"0", "false", "no"}:
        return

    if repositorio_cbm.contar_registros() > 0:
        return

    if not os.path.exists(RUTA_FIREBASE):
        print(f"[DB] Archivo de migración no encontrado: {RUTA_FIREBASE}")
        return

    try:
        print("[DB] 📦 Importando catastro inicial desde firebase_data.json...")
        with open(RUTA_FIREBASE, encoding="utf-8") as archivo:
            data = json.load(archivo)

        tenant = os.getenv("CIO_TENANT_ID", TENANT_DEFECTO)
        ahora = time.time()
        activos = data.get("activos_criticos", {}) or {}
        alertas = data.get("alertas_terreno", {}) or {}

        registros: list[tuple] = []

        for id_fb, activo in activos.items():
            tag = (activo.get("tag") or id_fb).strip().upper()
            payload = {
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
            registros.append(
                (
                    f"rec_catastro_{tag}",
                    tenant,
                    "migracion_sistema",
                    f"activo_catastro:{tag}",
                    "UPSERT",
                    json.dumps(payload, ensure_ascii=False),
                    ahora,
                )
            )

        for id_alerta, alerta in alertas.items():
            tag = (alerta.get("tag") or "S/T").strip().upper()
            payload = {
                "tag": tag,
                "area": alerta.get("area") or "General",
                "componente": alerta.get("componente") or "General",
                "severidad": alerta.get("severidad")
                or alerta.get("severidadPreliminar")
                or "AMARILLO",
                "descripcion": alerta.get("detalle") or alerta.get("descripcion") or "",
                "fotoBase64": alerta.get("fotoBase64") or "",
                "inspector": alerta.get("inspector") or "Inspector Terreno",
                "timestamp": alerta.get("timestamp") or int(ahora * 1000),
            }
            registros.append(
                (
                    f"rec_alerta_{id_alerta}",
                    tenant,
                    "migracion_sistema",
                    f"alerta_terreno:{tag}",
                    "CREATE",
                    json.dumps(payload, ensure_ascii=False),
                    ahora,
                )
            )

        repositorio_cbm.insertar_muchos(registros)

        print(
            f"[DB] ✅ Importación completada: {len(activos)} activos y "
            f"{len(alertas)} alertas en tenant '{tenant}'."
        )
    except Exception as error:  # pragma: no cover - depende de datos externos
        print(f"[DB] ⚠️ Error al importar firebase_data.json: {error}")
