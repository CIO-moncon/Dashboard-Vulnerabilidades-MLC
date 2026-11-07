"""Utilidades de seguridad: hash de contraseñas y tokens JWT.

No se usan dependencias de hashing externas: PBKDF2-SHA256 viene en la
biblioteca estándar y es adecuado para credenciales de una aplicación
industrial on-premise. El token JWT sí requiere PyJWT.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Any

import jwt

PBKDF2_ITERACIONES = 260_000
ALGORITMO_JWT = "HS256"
DURACION_TOKEN_HORAS = int(os.getenv("CIO_TOKEN_HORAS", "8"))
DURACION_REFRESH_HORAS = int(os.getenv("CIO_REFRESH_HORAS", "720"))

SECRET_KEY = os.getenv("CIO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    # Fallback de desarrollo: en producción SIEMPRE definir CIO_SECRET_KEY.
    SECRET_KEY = secrets.token_urlsafe(48)
    print(
        "[SECURITY] ⚠️  CIO_SECRET_KEY no está definida. Se generó una clave temporal; "
        "los tokens se invalidarán al reiniciar. Configure la variable en producción."
    )


def hash_password(password: str) -> str:
    """Genera un hash PBKDF2-SHA256 con sal aleatoria."""
    if not password:
        raise ValueError("La contraseña no puede estar vacía.")

    salt = secrets.token_bytes(16)
    derivada = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERACIONES)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERACIONES,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(derivada).decode("ascii"),
    )


def verificar_password(password: str, almacenado: str) -> bool:
    """Compara una contraseña contra un hash PBKDF2 almacenado."""
    try:
        algoritmo, iteraciones_txt, salt_b64, hash_b64 = almacenado.split("$", 3)
        if algoritmo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        esperado = base64.b64decode(hash_b64)
        calculado = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iteraciones_txt)
        )
        return hmac.compare_digest(calculado, esperado)
    except (ValueError, TypeError):
        return False


def crear_token(
    user_id: str,
    email: str,
    rol: str,
    tenant_id: str,
    horas: int | None = None,
) -> tuple[str, int]:
    """Crea un JWT firmado y devuelve (token, segundos_de_vigencia)."""
    duracion = horas if horas is not None else DURACION_TOKEN_HORAS
    ahora = int(time.time())
    expira = ahora + duracion * 3600

    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "rol": rol,
        "tenant_id": tenant_id,
        "iat": ahora,
        "exp": expira,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITMO_JWT)
    return token, duracion * 3600


def decodificar_token(token: str) -> dict[str, Any]:
    """Valida firma y expiración. Lanza jwt.InvalidTokenError si es inválido."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITMO_JWT])


def generar_token_opaco(num_bytes: int = 48) -> str:
    """Genera un token opaco criptográficamente seguro (para refresh tokens)."""
    return secrets.token_urlsafe(num_bytes)


def hash_token(token: str) -> str:
    """Hash SHA-256 determinista de un token opaco.

    A diferencia de las contraseñas (baja entropía), un refresh token tiene
    384 bits de entropía, por lo que un hash rápido y determinista es suficiente
    y permite usarlo como clave de búsqueda en la base de datos.
    """
    if not token:
        raise ValueError("El token no puede estar vacío.")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
