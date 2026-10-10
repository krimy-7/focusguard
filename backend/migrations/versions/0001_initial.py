"""initial v1 schema: profiles, goals, contexts, daily_totals, deleted_users

Revision ID: 0001
Revises:
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("tz", sa.String(64), nullable=False, server_default="Asia/Kathmandu"),
        sa.Column("settings", JSONType, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("updated_at", TS, nullable=False),
    )
    op.create_table(
        "goals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("done_at", TS, nullable=True),
    )
    op.create_index("ix_goals_user_day", "goals", ["user_id", "day"])
    op.create_table(
        "contexts",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("confidence", sa.String(16), nullable=False),
        sa.Column("started_at", TS, nullable=False),
        sa.Column("ended_at", TS, nullable=True),
        sa.Column("last_active_at", TS, nullable=False),
        sa.Column("sites", JSONType, nullable=False),
        sa.Column("updated_at", TS, nullable=False),
    )
    op.create_index("ix_contexts_user_last_active", "contexts", ["user_id", "last_active_at"])
    op.create_table(
        "daily_totals",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("device_id", sa.String(64), primary_key=True),
        sa.Column("focus_s", sa.Integer(), nullable=False),
        sa.Column("nudges", sa.Integer(), nullable=False),
        sa.Column("self_returns", sa.Integer(), nullable=False),
        sa.Column("recoveries", sa.Integer(), nullable=False),
        sa.Column("snoozes", sa.Integer(), nullable=False),
        sa.Column("breaks", sa.Integer(), nullable=False),
        sa.Column("longest_detour_s", sa.Integer(), nullable=False),
        sa.Column("updated_at", TS, nullable=False),
    )
    op.create_table(
        "deleted_users",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("deleted_at", TS, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("deleted_users")
    op.drop_table("daily_totals")
    op.drop_index("ix_contexts_user_last_active", table_name="contexts")
    op.drop_table("contexts")
    op.drop_index("ix_goals_user_day", table_name="goals")
    op.drop_table("goals")
    op.drop_table("profiles")
