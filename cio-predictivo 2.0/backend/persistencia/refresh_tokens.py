"""Repositorio de tokens de refresco (tabla ``refresh_tokens``).

Solo se almacena el hash PBKDF2 del token, nunca el valor en claro. Esto permite
revocar sesiones (logout, cambio de contraseña) de forma real.
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from typing import Any

from persistencia.conexion import FabricaConexion, conexion_db


def _fila(fila: sqlite3.Row | None) -> dict[str, Any] | None:
    if fila is None:
        return None
    return {
        "id": fila["id"],
        "token_hash": fila["token_hash"],
        "user_id": fila["user_id"],
        "tenant_id": fila["tenant_id"],
        "expira_en": fila["expira_en"],
        "revocado_en": fila["revocado_en"],
        "creado_en": fila["creado_en"],
    }


class RepositorioRefreshTokens:
    """Acceso a la tabla ``refresh_tokens``."""

    def __init__(self, fabrica_conexion: FabricaConexion = conexion_db) -> None:
        self._fabrica_conexion = fabrica_conexion

    def crear(
        self,
        token_hash: str,
        user_id: str,
        tenant_id: str,
        expira_en: float,
    ) -> dict[str, Any]:
        """Registra un nuevo refresh token (hasheado) y devuelve su registro."""
        token_id = f"rft_{uuid.uuid4().hex[:16]}"
        ahora = time.time()
        with self._fabrica_conexion() as conexion:
            conexion.execute(
                """
                INSERT INTO refresh_tokens
                    (id, token_hash, user_id, tenant_id, expira_en, revocado_en, creado_en)
                VALUES (?, ?, ?, ?, ?, NULL, ?)
                """,
                (token_id, token_hash, user_id, tenant_id, expira_en, ahora),
            )
        return {
            "id": token_id,
            "token_hash": token_hash,
            "user_id": user_id,
            "tenant_id": tenant_id,
            "expira_en": expira_en,
            "revocado_en": None,
            "creado_en": ahora,
        }

    def buscar_por_hash(self, token_hash: str) -> dict[str, Any] | None:
        with self._fabrica_conexion() as conexion:
            fila = conexion.execute(
                "SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1",
                (token_hash,),
            ).fetchone()
        return _fila(fila)

    def revocar(self, token_id: str) -> bool:
        """Marca un token como revocado. Devuelve True si estaba vigente."""
        with self._fabrica_conexion() as conexion:
            cursor = conexion.execute(
                "UPDATE refresh_tokens SET revocado_en = ? WHERE id = ? AND revocado_en IS NULL",
                (time.time(), token_id),
            )
            return cursor.rowcount > 0

    def revocar_todos_usuario(self, user_id: str) -> int:
        """Revoca todos los tokens vigentes de un usuario. Devuelve cuántos revocó."""
        with self._fabrica_conexion() as conexion:
            cursor = conexion.execute(
                "UPDATE refresh_tokens SET revocado_en = ? WHERE user_id = ? AND revocado_en IS NULL",
                (time.time(), user_id),
            )
            return cursor.rowcount

    def eliminar_expirados(self, ahora: float | None = None) -> int:
        """Borra tokens cuya vigencia ya venció. Devuelve cuántos eliminó."""
        referencia = ahora if ahora is not None else time.time()
        with self._fabrica_conexion() as conexion:
            cursor = conexion.execute(
                "DELETE FROM refresh_tokens WHERE expira_en < ?",
                (referencia,),
            )
            return cursor.rowcount
