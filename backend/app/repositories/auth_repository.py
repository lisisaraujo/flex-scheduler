from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invitation, Membership, OrgMembership, Organization, Team, User
from app.models.enums import InvitationStatus, MembershipRole
from app.schemas.auth import SessionUser, UserContext
from app.schemas.members import InvitationSchema, SchedulingProfileSchema, TeamMemberSchema


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _dt_to_ms(dt: datetime | None) -> int:
    if dt is None:
        return 0
    return int(dt.timestamp() * 1000)


# ---------------------------------------------------------------------------
# Context resolution
# ---------------------------------------------------------------------------

async def get_user_contexts(db: AsyncSession, firebase_uid: str) -> tuple[User | None, list[UserContext]]:
    """Returns the user and all contexts they can access (org-level and team-level)."""
    user = (await db.execute(select(User).where(User.firebase_uid == firebase_uid))).scalar_one_or_none()
    if not user:
        return None, []

    contexts: list[UserContext] = []

    # Org-admin memberships
    org_stmt = (
        select(OrgMembership, Organization)
        .join(Organization, Organization.id == OrgMembership.org_id)
        .where(OrgMembership.user_id == user.id)
        .order_by(Organization.name)
    )
    for om, org in (await db.execute(org_stmt)).all():
        contexts.append(UserContext(
            type="org",
            orgId=str(org.id),
            orgName=org.name,
            role=MembershipRole.org_admin,
        ))

    # Team memberships
    team_stmt = (
        select(Membership, Team, Organization)
        .join(Team, Team.id == Membership.team_id)
        .join(Organization, Organization.id == Team.org_id)
        .where(Membership.user_id == user.id)
        .order_by(Organization.name, Team.name)
    )
    for m, team, org in (await db.execute(team_stmt)).all():
        contexts.append(UserContext(
            type="team",
            orgId=str(org.id),
            orgName=org.name,
            teamId=str(team.id),
            teamName=team.name,
            role=m.role,
        ))

    return user, contexts


async def resolve_session_user(
    db: AsyncSession,
    firebase_uid: str,
    team_id: uuid.UUID | None = None,
) -> SessionUser | None:
    """Resolves a full SessionUser for the given Firebase UID and optional team context.

    If team_id is provided, validates the user is a member of that team (or is an org admin
    for the org that owns the team). If team_id is None, uses the first available context.
    """
    user = (await db.execute(select(User).where(User.firebase_uid == firebase_uid))).scalar_one_or_none()
    if not user:
        return None

    if team_id is not None:
        return await _resolve_team_context(db, user, team_id)

    # Auto-pick: prefer org context, then first team
    org_stmt = (
        select(OrgMembership, Organization)
        .join(Organization, Organization.id == OrgMembership.org_id)
        .where(OrgMembership.user_id == user.id)
        .limit(1)
    )
    row = (await db.execute(org_stmt)).first()
    if row:
        om, org = row
        return SessionUser(
            userId=str(user.id), name=user.name, email=user.email,
            orgId=str(org.id), orgName=org.name,
            teamId=None, teamName=None,
            role=MembershipRole.org_admin,
        )

    team_stmt = (
        select(Membership, Team, Organization)
        .join(Team, Team.id == Membership.team_id)
        .join(Organization, Organization.id == Team.org_id)
        .where(Membership.user_id == user.id)
        .limit(1)
    )
    row = (await db.execute(team_stmt)).first()
    if row:
        m, team, org = row
        return SessionUser(
            userId=str(user.id), name=user.name, email=user.email,
            orgId=str(org.id), orgName=org.name,
            teamId=str(team.id), teamName=team.name,
            role=m.role,
        )

    return None


async def resolve_session_user_with_team(
    db: AsyncSession,
    firebase_uid: str,
    team_id: uuid.UUID,
) -> SessionUser | None:
    """Validates the user can access the given team (member OR org admin of the owning org)."""
    user = (await db.execute(select(User).where(User.firebase_uid == firebase_uid))).scalar_one_or_none()
    if not user:
        return None
    return await _resolve_team_context(db, user, team_id)


async def _resolve_team_context(db: AsyncSession, user: User, team_id: uuid.UUID) -> SessionUser | None:
    team_stmt = (
        select(Team, Organization)
        .join(Organization, Organization.id == Team.org_id)
        .where(Team.id == team_id)
    )
    row = (await db.execute(team_stmt)).first()
    if not row:
        return None
    team, org = row

    # Check direct team membership first
    membership = (
        await db.execute(
            select(Membership).where(
                and_(Membership.user_id == user.id, Membership.team_id == team_id)
            )
        )
    ).scalar_one_or_none()
    if membership:
        return SessionUser(
            userId=str(user.id), name=user.name, email=user.email,
            orgId=str(org.id), orgName=org.name,
            teamId=str(team.id), teamName=team.name,
            role=membership.role,
        )

    # Check org admin membership for the owning org
    org_membership = (
        await db.execute(
            select(OrgMembership).where(
                and_(OrgMembership.user_id == user.id, OrgMembership.org_id == org.id)
            )
        )
    ).scalar_one_or_none()
    if org_membership:
        return SessionUser(
            userId=str(user.id), name=user.name, email=user.email,
            orgId=str(org.id), orgName=org.name,
            teamId=str(team.id), teamName=team.name,
            role=MembershipRole.org_admin,
        )

    return None


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

async def register_user(
    db: AsyncSession,
    name: str,
    email: str,
    firebase_uid: str,
) -> User:
    """Creates a User record. No org/team is created — user gets access via super_admin or invitation."""
    name = name.strip()
    email = email.strip().lower()

    if len(name) < 2:
        raise ValueError("Name must be at least 2 characters")

    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise ValueError("An account with this email already exists")

    now = datetime.now(timezone.utc)
    user = User(firebase_uid=firebase_uid, name=name, email=email, created_at=now)
    db.add(user)
    await db.commit()
    return user


# ---------------------------------------------------------------------------
# Team members
# ---------------------------------------------------------------------------

async def list_members_for_team(db: AsyncSession, team_id: uuid.UUID) -> list[TeamMemberSchema]:
    stmt = (
        select(User, Membership)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.team_id == team_id)
        .order_by(Membership.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        TeamMemberSchema(
            membershipId=str(m.id),
            userId=str(u.id),
            teamId=str(m.team_id),
            role=m.role,
            createdAt=_dt_to_ms(m.created_at),
            name=u.name,
            email=u.email,
            schedulingProfile=SchedulingProfileSchema(
                active=m.active,
                maxShifts=m.max_shifts,
                preferredCoworkerIds=[str(uid) for uid in (m.preferred_coworker_ids or [])],
            ),
        )
        for u, m in rows
    ]


async def remove_team_member(
    db: AsyncSession,
    team_id: uuid.UUID,
    target_user_id: uuid.UUID,
    acting_user_id: uuid.UUID,
) -> None:
    if target_user_id == acting_user_id:
        raise ValueError("You cannot remove your own account")

    membership = (
        await db.execute(
            select(Membership).where(
                and_(Membership.user_id == target_user_id, Membership.team_id == team_id)
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise ValueError("Member not found")

    if membership.role == MembershipRole.team_admin:
        admin_count = len(
            (await db.execute(
                select(Membership).where(
                    and_(Membership.team_id == team_id, Membership.role == MembershipRole.team_admin)
                )
            )).scalars().all()
        )
        if admin_count <= 1:
            raise ValueError("You cannot remove the last team admin")

    await db.delete(membership)

    remaining = (await db.execute(select(Membership).where(Membership.user_id == target_user_id))).scalars().all()
    org_memberships = (await db.execute(select(OrgMembership).where(OrgMembership.user_id == target_user_id))).scalars().all()
    if not remaining and not org_memberships:
        user = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one_or_none()
        if user:
            await db.delete(user)

    await db.commit()


async def update_member_scheduling(
    db: AsyncSession,
    team_id: uuid.UUID,
    target_user_id: uuid.UUID,
    active: bool,
    max_shifts: int | None,
) -> None:
    if max_shifts is not None and not (0 <= max_shifts <= 31):
        raise ValueError("maxShifts must be between 0 and 31")

    membership = (
        await db.execute(
            select(Membership).where(
                and_(Membership.user_id == target_user_id, Membership.team_id == team_id)
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise ValueError("Member not found")

    membership.active = active
    membership.max_shifts = max_shifts
    await db.commit()


async def update_preferred_coworkers(
    db: AsyncSession,
    team_id: uuid.UUID,
    target_user_id: uuid.UUID,
    preferred_coworker_ids: list[str],
) -> None:
    candidate_uuids = list({uuid.UUID(uid) for uid in preferred_coworker_ids if uid.strip()})
    candidate_uuids = [u for u in candidate_uuids if u != target_user_id]

    if candidate_uuids:
        valid_rows = (
            await db.execute(
                select(Membership.user_id).where(
                    and_(Membership.team_id == team_id, Membership.user_id.in_(candidate_uuids))
                )
            )
        ).scalars().all()
        valid_set = set(valid_rows)
        invalid = [str(u) for u in candidate_uuids if u not in valid_set]
        if invalid:
            raise ValueError("One or more preferred coworkers are not members of this team")

    membership = (
        await db.execute(
            select(Membership).where(
                and_(Membership.user_id == target_user_id, Membership.team_id == team_id)
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise ValueError("Member not found")

    membership.preferred_coworker_ids = candidate_uuids
    await db.commit()


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

async def create_invitation(
    db: AsyncSession,
    team_id: uuid.UUID,
    team_name: str,
    invited_by_user_id: uuid.UUID,
    email: str,
    role: str = "team_member",
) -> InvitationSchema:
    email = email.strip().lower()

    existing_user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        raise ValueError("A user with this email already exists")

    pending = (
        await db.execute(
            select(Invitation).where(
                and_(
                    Invitation.team_id == team_id,
                    Invitation.email == email,
                    Invitation.status == InvitationStatus.pending,
                )
            )
        )
    ).scalar_one_or_none()
    if pending:
        raise ValueError("A pending invitation already exists for this email")

    now = datetime.now(timezone.utc)
    invitation = Invitation(
        team_id=team_id,
        email=email,
        role=MembershipRole(role),
        status=InvitationStatus.pending,
        invited_by_user_id=invited_by_user_id,
        created_at=now,
        expires_at=now + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()

    return _invitation_to_schema(invitation, team_name)


async def get_invitation_by_id(db: AsyncSession, invitation_id: uuid.UUID) -> InvitationSchema:
    stmt = (
        select(Invitation, Team.name.label("team_name"))
        .join(Team, Team.id == Invitation.team_id)
        .where(Invitation.id == invitation_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise ValueError("Invitation not found")

    invitation, team_name = row
    invitation = await _expire_if_needed(db, invitation)
    return _invitation_to_schema(invitation, team_name)


async def list_invitations_for_team(db: AsyncSession, team_id: uuid.UUID) -> list[InvitationSchema]:
    stmt = (
        select(Invitation, Team.name.label("team_name"))
        .join(Team, Team.id == Invitation.team_id)
        .where(Invitation.team_id == team_id)
        .order_by(Invitation.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    result = []
    for inv, team_name in rows:
        inv = await _expire_if_needed(db, inv)
        result.append(_invitation_to_schema(inv, team_name))
    await db.commit()
    return result


async def revoke_invitation(
    db: AsyncSession, invitation_id: uuid.UUID, team_id: uuid.UUID
) -> InvitationSchema:
    stmt = (
        select(Invitation, Team.name.label("team_name"))
        .join(Team, Team.id == Invitation.team_id)
        .where(Invitation.id == invitation_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise ValueError("Invitation not found")
    invitation, team_name = row

    if str(invitation.team_id) != str(team_id):
        raise ValueError("Forbidden")
    if invitation.status == InvitationStatus.accepted:
        raise ValueError("Accepted invitations cannot be revoked")
    if invitation.status != InvitationStatus.revoked:
        invitation.status = InvitationStatus.revoked
        await db.commit()

    return _invitation_to_schema(invitation, team_name)


async def resend_invitation(
    db: AsyncSession,
    invitation_id: uuid.UUID,
    team_id: uuid.UUID,
    invited_by_user_id: uuid.UUID,
) -> InvitationSchema:
    stmt = (
        select(Invitation, Team.name.label("team_name"))
        .join(Team, Team.id == Invitation.team_id)
        .where(Invitation.id == invitation_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise ValueError("Invitation not found")
    invitation, team_name = row

    if str(invitation.team_id) != str(team_id):
        raise ValueError("Forbidden")
    if invitation.status == InvitationStatus.accepted:
        raise ValueError("Accepted invitations cannot be resent")

    now = datetime.now(timezone.utc)
    invitation.status = InvitationStatus.pending
    invitation.invited_by_user_id = invited_by_user_id
    invitation.created_at = now
    invitation.expires_at = now + timedelta(days=7)
    await db.commit()

    return _invitation_to_schema(invitation, team_name)


async def accept_invitation(
    db: AsyncSession,
    invitation_id: uuid.UUID,
    name: str,
    firebase_uid: str,
) -> SessionUser:
    stmt = (
        select(Invitation, Team, Organization)
        .join(Team, Team.id == Invitation.team_id)
        .join(Organization, Organization.id == Team.org_id)
        .where(Invitation.id == invitation_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise ValueError("Invitation not found")
    invitation, team, org = row

    if invitation.status != InvitationStatus.pending:
        raise ValueError("This invitation is no longer active")
    if datetime.now(timezone.utc) > invitation.expires_at:
        invitation.status = InvitationStatus.expired
        await db.commit()
        raise ValueError("This invitation has expired")

    existing = (await db.execute(select(User).where(User.email == invitation.email))).scalar_one_or_none()
    if existing:
        raise ValueError("A user with this email already exists")

    name = name.strip()
    if len(name) < 2:
        raise ValueError("Name must be at least 2 characters")

    now = datetime.now(timezone.utc)
    user = User(firebase_uid=firebase_uid, name=name, email=invitation.email, created_at=now)
    db.add(user)
    await db.flush()

    membership = Membership(
        user_id=user.id,
        team_id=invitation.team_id,
        role=invitation.role,
        created_at=now,
        active=True,
        max_shifts=None,
        preferred_coworker_ids=[],
    )
    db.add(membership)
    invitation.status = InvitationStatus.accepted
    await db.commit()

    return SessionUser(
        userId=str(user.id), name=user.name, email=user.email,
        orgId=str(org.id), orgName=org.name,
        teamId=str(team.id), teamName=team.name,
        role=invitation.role,
    )


# ---------------------------------------------------------------------------
# Super admin helpers
# ---------------------------------------------------------------------------

async def create_organization(db: AsyncSession, name: str, admin_user_id: uuid.UUID | None = None) -> Organization:
    now = datetime.now(timezone.utc)
    org = Organization(name=name.strip(), created_at=now)
    db.add(org)
    await db.flush()

    if admin_user_id:
        om = OrgMembership(org_id=org.id, user_id=admin_user_id, created_at=now)
        db.add(om)

    await db.commit()
    return org


async def create_team(db: AsyncSession, org_id: uuid.UUID, name: str) -> Team:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise ValueError("Organization not found")

    now = datetime.now(timezone.utc)
    team = Team(org_id=org_id, name=name.strip(), created_at=now)
    db.add(team)
    await db.commit()
    return team


async def assign_org_admin(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    existing = (
        await db.execute(
            select(OrgMembership).where(
                and_(OrgMembership.org_id == org_id, OrgMembership.user_id == user_id)
            )
        )
    ).scalar_one_or_none()
    if existing:
        return  # already an org admin

    om = OrgMembership(org_id=org_id, user_id=user_id, created_at=datetime.now(timezone.utc))
    db.add(om)
    await db.commit()


async def list_organizations(db: AsyncSession) -> list[dict]:
    orgs = (await db.execute(select(Organization).order_by(Organization.name))).scalars().all()
    result = []
    for org in orgs:
        teams = (await db.execute(select(Team).where(Team.org_id == org.id).order_by(Team.name))).scalars().all()
        result.append({
            "orgId": str(org.id),
            "orgName": org.name,
            "createdAt": _dt_to_ms(org.created_at),
            "teams": [{"teamId": str(t.id), "teamName": t.name, "createdAt": _dt_to_ms(t.created_at)} for t in teams],
        })
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _expire_if_needed(db: AsyncSession, invitation: Invitation) -> Invitation:
    if invitation.status == InvitationStatus.pending and datetime.now(timezone.utc) > invitation.expires_at:
        invitation.status = InvitationStatus.expired
    return invitation


def _invitation_to_schema(invitation: Invitation, team_name: str) -> InvitationSchema:
    return InvitationSchema(
        invitationId=str(invitation.id),
        teamId=str(invitation.team_id),
        teamName=team_name,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        invitedByUserId=str(invitation.invited_by_user_id),
        createdAt=_dt_to_ms(invitation.created_at),
        expiresAt=_dt_to_ms(invitation.expires_at),
    )
