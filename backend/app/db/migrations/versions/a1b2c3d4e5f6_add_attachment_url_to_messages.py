"""add attachment_url to messages

Revision ID: a1b2c3d4e5f6
Revises: 5ba3c7771db7
Create Date: 2026-05-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '5ba3c7771db7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('attachment_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'attachment_url')
