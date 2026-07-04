"""Multi-tenant SaaS architecture: organizations, org_memberships, teams (was companies).

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-21

Changes:
  - Creates `organizations` table
  - Creates `org_memberships` table (org-level admins)
  - Renames `companies` → `teams`, adds `org_id` FK
  - Updates `membership_role` enum: admin→team_admin, user→team_member, adds org_admin
  - Renames `company_id` → `team_id` in memberships, invitations, calendar_months
  - Updates unique constraints to match new column names
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Create `organizations`
    # ------------------------------------------------------------------
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ------------------------------------------------------------------
    # 2. Create `org_memberships`
    # ------------------------------------------------------------------
    op.create_table(
        "org_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("org_id", "user_id", name="uq_org_membership_org_user"),
    )

    # ------------------------------------------------------------------
    # 3. Rename `companies` → `teams` and add `org_id` column
    # ------------------------------------------------------------------
    op.rename_table("companies", "teams")

    # org_id nullable initially (no existing rows to violate), then NOT NULL
    op.add_column("teams", sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_teams_org_id", "teams", "organizations", ["org_id"], ["id"])

    # For any existing data: create a default org per team and link them
    bind.execute(sa.text("""
        INSERT INTO organizations (id, name, created_at)
        SELECT gen_random_uuid(), name, created_at FROM teams
        WHERE id NOT IN (SELECT DISTINCT id FROM teams WHERE org_id IS NOT NULL)
    """))
    bind.execute(sa.text("""
        UPDATE teams t
        SET org_id = (
            SELECT o.id FROM organizations o
            WHERE o.name = t.name
            LIMIT 1
        )
        WHERE org_id IS NULL
    """))

    op.alter_column("teams", "org_id", nullable=False)

    # ------------------------------------------------------------------
    # 4. Update `membership_role` enum values
    # ------------------------------------------------------------------
    # Create new enum type
    bind.execute(sa.text(
        "CREATE TYPE membership_role_new AS ENUM ('org_admin', 'team_admin', 'team_member')"
    ))

    # Update memberships.role
    bind.execute(sa.text("""
        ALTER TABLE memberships
        ALTER COLUMN role TYPE membership_role_new
        USING (CASE role::text
            WHEN 'admin' THEN 'team_admin'
            WHEN 'user'  THEN 'team_member'
            ELSE 'team_member'
        END)::membership_role_new
    """))

    # Update invitations.role
    bind.execute(sa.text("""
        ALTER TABLE invitations
        ALTER COLUMN role TYPE membership_role_new
        USING (CASE role::text
            WHEN 'admin' THEN 'team_admin'
            WHEN 'user'  THEN 'team_member'
            ELSE 'team_member'
        END)::membership_role_new
    """))

    # Drop old enum, rename new
    bind.execute(sa.text("DROP TYPE membership_role"))
    bind.execute(sa.text("ALTER TYPE membership_role_new RENAME TO membership_role"))

    # ------------------------------------------------------------------
    # 5. Rename `company_id` → `team_id` in memberships
    # ------------------------------------------------------------------
    op.drop_constraint("uq_membership_user_company", "memberships", type_="unique")
    op.drop_constraint("memberships_company_id_fkey", "memberships", type_="foreignkey")
    op.alter_column("memberships", "company_id", new_column_name="team_id")
    op.create_foreign_key("fk_memberships_team_id", "memberships", "teams", ["team_id"], ["id"])
    op.create_unique_constraint("uq_membership_user_team", "memberships", ["user_id", "team_id"])

    # ------------------------------------------------------------------
    # 6. Rename `company_id` → `team_id` in invitations
    # ------------------------------------------------------------------
    op.drop_constraint("invitations_company_id_fkey", "invitations", type_="foreignkey")
    op.alter_column("invitations", "company_id", new_column_name="team_id")
    op.create_foreign_key("fk_invitations_team_id", "invitations", "teams", ["team_id"], ["id"])

    # ------------------------------------------------------------------
    # 7. Rename `company_id` → `team_id` in calendar_months
    # ------------------------------------------------------------------
    op.drop_constraint("uq_calendar_month_company_month", "calendar_months", type_="unique")
    op.drop_constraint("calendar_months_company_id_fkey", "calendar_months", type_="foreignkey")
    op.alter_column("calendar_months", "company_id", new_column_name="team_id")
    op.create_foreign_key("fk_calendar_months_team_id", "calendar_months", "teams", ["team_id"], ["id"])
    op.create_unique_constraint("uq_calendar_month_team_month", "calendar_months", ["team_id", "month_id"])


def downgrade() -> None:
    # Reverse calendar_months
    op.drop_constraint("uq_calendar_month_team_month", "calendar_months", type_="unique")
    op.drop_constraint("fk_calendar_months_team_id", "calendar_months", type_="foreignkey")
    op.alter_column("calendar_months", "team_id", new_column_name="company_id")
    op.create_foreign_key("calendar_months_company_id_fkey", "calendar_months", "companies", ["company_id"], ["id"])
    op.create_unique_constraint("uq_calendar_month_company_month", "calendar_months", ["company_id", "month_id"])

    # Reverse invitations
    op.drop_constraint("fk_invitations_team_id", "invitations", type_="foreignkey")
    op.alter_column("invitations", "team_id", new_column_name="company_id")
    op.create_foreign_key("invitations_company_id_fkey", "invitations", "companies", ["company_id"], ["id"])

    # Reverse memberships
    op.drop_constraint("uq_membership_user_team", "memberships", type_="unique")
    op.drop_constraint("fk_memberships_team_id", "memberships", type_="foreignkey")
    op.alter_column("memberships", "team_id", new_column_name="company_id")
    op.create_foreign_key("memberships_company_id_fkey", "memberships", "companies", ["company_id"], ["id"])
    op.create_unique_constraint("uq_membership_user_company", "memberships", ["user_id", "company_id"])

    # Reverse enum
    bind = op.get_bind()
    bind.execute(sa.text(
        "CREATE TYPE membership_role_old AS ENUM ('admin', 'user')"
    ))
    bind.execute(sa.text("""
        ALTER TABLE memberships ALTER COLUMN role TYPE membership_role_old
        USING (CASE role::text WHEN 'team_admin' THEN 'admin' ELSE 'user' END)::membership_role_old
    """))
    bind.execute(sa.text("""
        ALTER TABLE invitations ALTER COLUMN role TYPE membership_role_old
        USING (CASE role::text WHEN 'team_admin' THEN 'admin' ELSE 'user' END)::membership_role_old
    """))
    bind.execute(sa.text("DROP TYPE membership_role"))
    bind.execute(sa.text("ALTER TYPE membership_role_old RENAME TO membership_role"))

    # Reverse teams → companies (drop org_id first)
    op.drop_constraint("fk_teams_org_id", "teams", type_="foreignkey")
    op.drop_column("teams", "org_id")
    op.rename_table("teams", "companies")

    # Drop new tables
    op.drop_table("org_memberships")
    op.drop_table("organizations")
