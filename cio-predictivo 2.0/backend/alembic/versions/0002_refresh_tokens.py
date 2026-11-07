"""Tokens de refresco.

Agrega la tabla ``refresh_tokens`` para sesiones largas con revocación real.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("token_hash", sa.Text, nullable=False, unique=True),
        sa.Column("user_id", sa.Text, nullable=False),
        sa.Column("tenant_id", sa.Text, nullable=False),
        sa.Column("expira_en", sa.Float, nullable=False),
        sa.Column("revocado_en", sa.Float, nullable=True),
        sa.Column("creado_en", sa.Float, nullable=False),
    )
    op.create_index("idx_refresh_user", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_refresh_user", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
