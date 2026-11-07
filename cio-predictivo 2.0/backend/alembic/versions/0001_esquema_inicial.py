"""Esquema inicial de CIO Predictivo 2.0.

Espejo exacto del DDL de ``persistencia/conexion.py::crear_esquema``:
tablas ``users``, ``cbm_records`` y ``audit_log`` con sus índices.

Revision ID: 0001
Revises:
Create Date: 2026-11-07
"""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("nombre", sa.Text, nullable=False),
        sa.Column("rol", sa.Text, nullable=False),
        sa.Column("tenant_id", sa.Text, nullable=False),
        sa.Column("activo", sa.Integer, nullable=False, server_default="1"),
        sa.Column("creado_en", sa.Float, nullable=False),
    )

    op.create_table(
        "cbm_records",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("tenant_id", sa.Text, nullable=False),
        sa.Column("user_id", sa.Text, nullable=False),
        sa.Column("resource", sa.Text, nullable=False),
        sa.Column("action_type", sa.Text, nullable=False),
        sa.Column("payload", sa.Text, nullable=False),
        sa.Column("creado_en", sa.Float, nullable=False),
        sa.Column("actualizado_en", sa.Float, nullable=True),
    )
    op.create_index("idx_cbm_tenant", "cbm_records", ["tenant_id"])
    op.create_index("idx_cbm_resource", "cbm_records", ["tenant_id", "resource"])
    op.create_index("idx_cbm_creado", "cbm_records", ["tenant_id", "creado_en"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Text, nullable=False),
        sa.Column("user_id", sa.Text, nullable=False),
        sa.Column("user_role", sa.Text, nullable=False),
        sa.Column("action_type", sa.Text, nullable=False),
        sa.Column("resource", sa.Text, nullable=False),
        sa.Column("timestamp", sa.Float, nullable=False),
        sa.Column("metadata", sa.Text, nullable=True),
    )
    op.create_index("idx_audit_tenant", "audit_log", ["tenant_id", "timestamp"])


def downgrade() -> None:
    op.drop_index("idx_audit_tenant", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_index("idx_cbm_creado", table_name="cbm_records")
    op.drop_index("idx_cbm_resource", table_name="cbm_records")
    op.drop_index("idx_cbm_tenant", table_name="cbm_records")
    op.drop_table("cbm_records")

    op.drop_table("users")
