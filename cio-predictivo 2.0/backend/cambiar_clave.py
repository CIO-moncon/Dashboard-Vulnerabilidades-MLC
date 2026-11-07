"""Cambia la contraseña de un usuario directamente en la base SQLite.

Útil para recuperar el acceso cuando se olvidó la contraseña del administrador
o cuando ya existe una base creada con la contraseña por defecto.

Uso (desde la carpeta backend/):

    python cambiar_clave.py admin@cpf.cl "NuevaClaveSegura123!"

Si no se indica la contraseña, se solicita de forma interactiva.
"""

from __future__ import annotations

import getpass
import os
import sys

try:  # Carga opcional de backend/.env.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

from persistencia import RepositorioUsuarios, inicializar_db
from security import hash_password


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python cambiar_clave.py <email> [nueva_contraseña]")
        return 2

    email = sys.argv[1].strip()
    password = sys.argv[2] if len(sys.argv) >= 3 else getpass.getpass("Nueva contraseña: ")

    if len(password) < 12:
        print("[!] La contraseña debe tener al menos 12 caracteres.")
        return 2

    inicializar_db()
    usuarios = RepositorioUsuarios()
    usuarios.sembrar_admin()
    usuario = usuarios.buscar_por_email(email)
    if not usuario:
        print(f"[!] No existe un usuario con el email '{email}'.")
        return 1

    usuarios.actualizar_password_hash(usuario["id"], hash_password(password))
    print(f"[+] Contraseña actualizada para {usuario['email']} ({usuario['rol']}).")
    print("[i] Los tokens JWT ya emitidos siguen vigentes hasta su expiración.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
