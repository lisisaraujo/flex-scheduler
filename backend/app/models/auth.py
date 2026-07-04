import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import InvitationStatus, MembershipRole


class Organization(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    teams: Mapped[list["Team"]] = relationship(back_populates="org")
    org_memberships: Mapped[list["OrgMembership"]] = relationship(back_populates="org")


class OrgMembership(Base, UUIDPrimaryKeyMixin):
    """Tracks which users are org-level admins."""
    __tablename__ = "org_memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_org_membership_org_user"),)

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    org: Mapped["Organization"] = relationship(back_populates="org_memberships")
    user: Mapped["User"] = relationship(back_populates="org_memberships")


class Team(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "teams"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    org: Mapped["Organization"] = relationship(back_populates="teams")
    memberships: Mapped[list["Membership"]] = relationship(back_populates="team")
    invitations: Mapped[list["Invitation"]] = relationship(back_populates="team")


class User(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "users"

    firebase_uid: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")
    org_memberships: Mapped[list["OrgMembership"]] = relationship(back_populates="user")


class Membership(Base, UUIDPrimaryKeyMixin):
    """Team-level membership (team_admin or team_member)."""
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "team_id", name="uq_membership_user_team"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_shifts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_coworker_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )

    user: Mapped["User"] = relationship(back_populates="memberships")
    team: Mapped["Team"] = relationship(back_populates="memberships")


class Invitation(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "invitations"

    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="invitation_status"), nullable=False, default=InvitationStatus.pending
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    team: Mapped["Team"] = relationship(back_populates="invitations")
