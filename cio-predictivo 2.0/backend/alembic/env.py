"""Entorno de ejecución de Alembic.

Resuelve la URL de SQLite desde ``CIO_DB_PATH`` (con el mismo valor por defecto
que ``persistencia/conexion.py``). Cuando se invoca por código
(``persistencia/migraciones.py``), la URL ya viene inyectada en ``sqlalchemy.url``
y aquí se respeta.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_DIRECTORIO_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ruta_db() -> str:
    return os.getenv(
        "CIO_DB_PATH",
        os.path.join(_DIRECTORIO_BACKEND, "cio_predictivo.db"),
    )


def _url_sqlite() -> str:
    """Devuelve la URL SQLAlchemy; normaliza separadores para SQLite."""
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    return "sqlite:///" + _ruta_db().replace("\\", "/")


config.set_main_option("sqlalchemy.url", _url_sqlite())

target_metadata = None


def run_migrations_offline() -> None:
    """Modo offline: emite SQL sin conexión real."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo online: aplica sobre la base real."""
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Necesario para ALTER TABLE en SQLite (migraciones futuras).
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
