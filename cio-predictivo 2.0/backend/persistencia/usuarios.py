"""Repositorio de usuarios y credenciales (tabla ``users``)."""

from __future__ import annotations

import os
import sqlite3
import time
import uuid
from typing import Any

from persistencia.conexion import (
    ROLES_VALIDOS,
    TENANT_DEFECTO,
    FabricaConexion,
    conexion_db,
)
from security import hash_password


def _fila_usuario(fila: sqlite3.Row | None) -> dict[str, Any] | None:
    if fila is None:
        return None
    return {
        "id": fila["id"],
        "email": fila["email"],
        "password_hash": fila["password_hash"],
        "nombre": fila["nombre"],
        "rol": fila["rol"],
        "tenant_id": fila["tenant_id"],
        "activo": bool(fila["activo"]),
        "creado_en": fila["creado_en"],
    }


def _fila_usuario_publico(fila: sqlite3.Row | None) -> dict[str, Any] | None:
    if fila is None:
        return None
    return {
        "id": fila["id"],
        "email": fila["email"],
        "nombre": fila["nombre"],
        "rol": fila["rol"],
        "tenant_id": fila["tenant_id"],
        "activo": bool(fila["activo"]),
        "creado_en": fila["creado_en"],
    }


class RepositorioUsuarios:
    """Acceso a la tabla ``users``."""

    def __init__(self, fabrica_conexion: FabricaConexion = conexion_db) -> None:
        self._fabrica_conexion = fabrica_conexion

    def sembrar_admin(self) -> None:
        """Crea un administrador inicial si la tabla de usuarios está vacía."""
        with self._fabrica_conexion() as conexion:
            existentes = conexion.execute("SELECT COUNT(*) AS total FROM users").fetchone()
            if existentes and existentes["total"] > 0:
                return

            email = os.getenv("CIO_ADMIN_EMAIL", "admin@cpf.cl").strip().lower()
            password = os.getenv("CIO_ADMIN_PASSWORD", "CambiarEstaClave123!")
            nombre = os.getenv("CIO_ADMIN_NOMBRE", "Administrador CIO")
            tenant_id = os.getenv("CIO_TENANT_ID", TENANT_DEFECTO)

            conexion.execute(
                """
                INSERT INTO users (id, email, password_hash, nombre, rol, tenant_id, activo, creado_en)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    f"usr_{uuid.uuid4().hex[:12]}",
                    email,
                    hash_password(password),
                    nombre,
                    "ADMINISTRADOR",
                    tenant_id,
                    time.time(),
                ),
            )
            print(f"[DB] Usuario administrador inicial creado: {email}")
            if password == "CambiarEstaClave123!":
                print(
                    "[DB] ⚠️  Se usó la contraseña por defecto. Defina CIO_ADMIN_PASSWORD "
                    "antes de exponer el sistema en producción."
                )

    def buscar_por_email(self, email: str) -> dict[str, Any] | None:
        with self._fabrica_conexion() as conexion:
            fila = conexion.execute(
                "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1", (email.strip(),)
            ).fetchone()
        return _fila_usuario(fila)

    def buscar_por_id(self, user_id: str) -> dict[str, Any] | None:
        with self._fabrica_conexion() as conexion:
            fila = conexion.execute(
                "SELECT * FROM users WHERE id = ? LIMIT 1", (user_id,)
            ).fetchone()
        return _fila_usuario(fila)

    def actualizar_password_hash(self, user_id: str, password_hash: str) -> bool:
        """Actualiza el hash de contraseña. Devuelve True si el usuario existía."""
        with self._fabrica_conexion() as conexion:
            cursor = conexion.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (password_hash, user_id),
            )
            return cursor.rowcount > 0

    def listar(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._fabrica_conexion() as conexion:
            filas = conexion.execute(
                "SELECT * FROM users WHERE tenant_id = ? ORDER BY creado_en ASC",
                (tenant_id,),
            ).fetchall()
        return [_fila_usuario_publico(fila) for fila in filas if fila is not None]

    def crear(
        self,
        email: str,
        password_hash: str,
        nombre: str,
        rol: str,
        tenant_id: str,
    ) -> dict[str, Any]:
        if rol not in ROLES_VALIDOS:
            raise ValueError(f"Rol inválido: {rol}")
        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        ahora = time.time()
        with self._fabrica_conexion() as conexion:
            conexion.execute(
                """
                INSERT INTO users (id, email, password_hash, nombre, rol, tenant_id, activo, creado_en)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (user_id, email.strip().lower(), password_hash, nombre, rol, tenant_id, ahora),
            )
        return {
            "id": user_id,
            "email": email.strip().lower(),
            "nombre": nombre,
            "rol": rol,
            "tenant_id": tenant_id,
            "activo": True,
            "creado_en": ahora,
        }

    def actualizar(
        self,
        user_id: str,
        nombre: str | None = None,
        rol: str | None = None,
        activo: bool | None = None,
    ) -> bool:
        campos: list[str] = []
        valores: list[Any] = []
        if nombre is not None:
            campos.append("nombre = ?")
            valores.append(nombre)
        if rol is not None:
            if rol not in ROLES_VALIDOS:
                raise ValueError(f"Rol inválido: {rol}")
            campos.append("rol = ?")
            valores.append(rol)
        if activo is not None:
            campos.append("activo = ?")
            valores.append(1 if activo else 0)
        if not campos:
            return False
        valores.append(user_id)
        with self._fabrica_conexion() as conexion:
            cursor = conexion.execute(f"UPDATE users SET {', '.join(campos)} WHERE id = ?", valores)
            return cursor.rowcount > 0

    def contar_administradores_activos(self, tenant_id: str) -> int:
        with self._fabrica_conexion() as conexion:
            fila = conexion.execute(
                """
                SELECT COUNT(*) AS total FROM users
                WHERE tenant_id = ? AND rol = 'ADMINISTRADOR' AND activo = 1
                """,
                (tenant_id,),
            ).fetchone()
        return int(fila["total"]) if fila else 0
