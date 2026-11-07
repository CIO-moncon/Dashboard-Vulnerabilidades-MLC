"""Repositorio de auditoría (tabla ``audit_log``)."""

from __future__ import annotations

import json
import time
from typing import Any

from persistencia.conexion import FabricaConexion, conexion_db


class RepositorioAuditoria:
    """Acceso a la tabla ``audit_log``."""

    def __init__(self, fabrica_conexion: FabricaConexion = conexion_db) -> None:
        self._fabrica_conexion = fabrica_conexion

    def registrar(
        self,
        tenant_id: str,
        user_id: str,
        user_role: str,
        action_type: str,
        resource: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self._fabrica_conexion() as conexion:
            conexion.execute(
                """
                INSERT INTO audit_log
                    (tenant_id, user_id, user_role, action_type, resource, timestamp, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id,
                    user_id,
                    user_role,
                    action_type,
                    resource,
                    time.time(),
                    json.dumps(metadata, ensure_ascii=False) if metadata else None,
                ),
            )

    def listar(self, tenant_id: str, limit: int = 50) -> list[dict[str, Any]]:
        limite = max(1, min(int(limit), 500))
        with self._fabrica_conexion() as conexion:
            filas = conexion.execute(
                """
                SELECT * FROM audit_log
                WHERE tenant_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (tenant_id, limite),
            ).fetchall()

        resultado: list[dict[str, Any]] = []
        for fila in filas:
            try:
                metadata = json.loads(fila["metadata"]) if fila["metadata"] else None
            except (TypeError, ValueError):
                metadata = None
            resultado.append(
                {
                    "id": fila["id"],
                    "tenant_id": fila["tenant_id"],
                    "user_id": fila["user_id"],
                    "user_role": fila["user_role"],
                    "action_type": fila["action_type"],
                    "resource": fila["resource"],
                    "timestamp": fila["timestamp"],
                    "metadata": metadata,
                }
            )
        return resultado
