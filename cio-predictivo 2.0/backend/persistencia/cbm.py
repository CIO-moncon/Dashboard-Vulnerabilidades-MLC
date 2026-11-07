"""Repositorio de registros CBM (tabla ``cbm_records``)."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any

from persistencia.conexion import FabricaConexion, conexion_db


def _fila_registro(fila: sqlite3.Row) -> dict[str, Any]:
    try:
        payload = json.loads(fila["payload"])
    except (TypeError, ValueError):
        payload = {}
    return {
        "id": fila["id"],
        "tenant_id": fila["tenant_id"],
        "user_id": fila["user_id"],
        "resource": fila["resource"],
        "action_type": fila["action_type"],
        "payload": payload,
        "creado_en": fila["creado_en"],
        "actualizado_en": fila["actualizado_en"],
    }


class RepositorioCbm:
    """Acceso a la tabla ``cbm_records``."""

    def __init__(self, fabrica_conexion: FabricaConexion = conexion_db) -> None:
        self._fabrica_conexion = fabrica_conexion

    def upsert_activo(
        self, tenant_id: str, user_id: str, tag: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Inserta o actualiza un activo de catastro de forma idempotente."""
        tag_normalizado = (tag or "").strip().upper()
        resource = f"activo_catastro:{tag_normalizado}"
        ahora = time.time()
        payload_json = json.dumps(payload, ensure_ascii=False)

        with self._fabrica_conexion() as conexion:
            fila = conexion.execute(
                "SELECT id FROM cbm_records WHERE tenant_id = ? AND resource = ? LIMIT 1",
                (tenant_id, resource),
            ).fetchone()

            if fila:
                conexion.execute(
                    """
                    UPDATE cbm_records
                    SET payload = ?, action_type = 'UPSERT', actualizado_en = ?
                    WHERE id = ?
                    """,
                    (payload_json, ahora, fila["id"]),
                )
                record_id = fila["id"]
                accion = "actualizado"
            else:
                record_id = f"rec_catastro_{tag_normalizado or uuid.uuid4().hex[:8]}"
                conexion.execute(
                    """
                    INSERT INTO cbm_records
                        (id, tenant_id, user_id, resource, action_type, payload, creado_en)
                    VALUES (?, ?, ?, ?, 'UPSERT', ?, ?)
                    """,
                    (record_id, tenant_id, user_id, resource, payload_json, ahora),
                )
                accion = "creado"

        return {
            "id": record_id,
            "tenant_id": tenant_id,
            "resource": resource,
            "accion": accion,
            "timestamp": ahora,
        }

    def crear_registro(
        self,
        record_id: str,
        tenant_id: str,
        user_id: str,
        resource: str,
        action_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Guarda una operación. Usa INSERT OR REPLACE para ser idempotente."""
        ahora = time.time()
        with self._fabrica_conexion() as conexion:
            conexion.execute(
                """
                INSERT OR REPLACE INTO cbm_records
                    (id, tenant_id, user_id, resource, action_type, payload, creado_en, actualizado_en)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    tenant_id,
                    user_id,
                    resource,
                    action_type,
                    json.dumps(payload, ensure_ascii=False),
                    ahora,
                    ahora,
                ),
            )
        return {
            "id": record_id,
            "tenant_id": tenant_id,
            "resource": resource,
            "action_type": action_type,
            "timestamp": ahora,
        }

    def listar_registros(
        self, tenant_id: str, tag: str | None = None, limit: int = 500, offset: int = 0
    ) -> list[dict[str, Any]]:
        limite = max(1, min(int(limit), 5000))
        desplazamiento = max(0, int(offset))

        with self._fabrica_conexion() as conexion:
            if tag:
                filas = conexion.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM cbm_records
                        WHERE tenant_id = ?
                          AND json_extract(payload, '$.tag') = ?
                        ORDER BY creado_en DESC
                        LIMIT ? OFFSET ?
                    ) ORDER BY creado_en ASC
                    """,
                    (tenant_id, tag.strip().upper(), limite, desplazamiento),
                ).fetchall()
            else:
                filas = conexion.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM cbm_records
                        WHERE tenant_id = ?
                        ORDER BY creado_en DESC
                        LIMIT ? OFFSET ?
                    ) ORDER BY creado_en ASC
                    """,
                    (tenant_id, limite, desplazamiento),
                ).fetchall()

        return [_fila_registro(fila) for fila in filas]

    def contar_registros(self, tenant_id: str | None = None) -> int:
        with self._fabrica_conexion() as conexion:
            if tenant_id:
                fila = conexion.execute(
                    "SELECT COUNT(*) AS total FROM cbm_records WHERE tenant_id = ?",
                    (tenant_id,),
                ).fetchone()
            else:
                fila = conexion.execute("SELECT COUNT(*) AS total FROM cbm_records").fetchone()
        return int(fila["total"]) if fila else 0

    def insertar_muchos(self, registros: list[tuple]) -> None:
        """Inserta registros en lote (migración inicial desde Firebase)."""
        if not registros:
            return
        with self._fabrica_conexion() as conexion:
            conexion.executemany(
                """
                INSERT OR IGNORE INTO cbm_records
                    (id, tenant_id, user_id, resource, action_type, payload, creado_en)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                registros,
            )
