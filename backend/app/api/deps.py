import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import hash_api_key, verify_firebase_id_token
from app.models import ApiKey, ApiUsageEvent
from app.models.enums import MembershipRole
from app.repositories.auth_repository import resolve_session_user, resolve_session_user_with_team
from app.schemas.auth import SessionUser

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
    x_team_id: Annotated[str | None, Header()] = None,
) -> SessionUser:
    """Resolves the authenticated user and their active context.

    If X-Team-Id is set (sent by the Next.js frontend from the session cookie), validates
    that the user is either a direct team member or an org admin for that team's org.
    Without X-Team-Id, falls back to the user's first available context (org, then team).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = authorization.split(" ", 1)[1].strip()
    decoded = verify_firebase_id_token(token)
    firebase_uid: str = decoded["uid"]

    if x_team_id:
        try:
            team_uuid = uuid.UUID(x_team_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Team-Id")
        user = await resolve_session_user_with_team(db, firebase_uid, team_uuid)
        if user is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this team")
        return user

    user = await resolve_session_user(db, firebase_uid)
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization or team membership found")
    return user


def require_team_context():
    """Requires the request to have a team context (X-Team-Id set and valid)."""
    async def _check(user: Annotated[SessionUser, Depends(get_current_user)]) -> SessionUser:
        if not user.teamId:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This operation requires a team context")
        return user
    return _check


def require_team_admin():
    """Requires team_admin or org_admin role in a team context."""
    async def _check(user: Annotated[SessionUser, Depends(get_current_user)]) -> SessionUser:
        if not user.teamId:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This operation requires a team context")
        if user.role not in (MembershipRole.team_admin, MembershipRole.org_admin):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team admin access required")
        return user
    return _check


def require_org_admin():
    """Requires org_admin role (either in org context or team context)."""
    async def _check(user: Annotated[SessionUser, Depends(get_current_user)]) -> SessionUser:
        if user.role != MembershipRole.org_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org admin access required")
        return user
    return _check


def require_super_admin():
    """Authenticates super_admin operations via X-Super-Admin-Secret header only — no Firebase token."""
    def _check(x_super_admin_secret: Annotated[str | None, Header()] = None) -> None:
        expected = get_settings().super_admin_secret
        if not expected or x_super_admin_secret != expected:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return _check


def require_role(*roles: MembershipRole):
    async def _check(user: Annotated[SessionUser, Depends(get_current_user)]) -> SessionUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user
    return _check


async def get_api_key_client(
    db: DbSession,
    x_api_key: Annotated[str | None, Header()] = None,
) -> ApiKey:
    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key required")

    key_hash = hash_api_key(x_api_key)
    api_key = (await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))).scalar_one_or_none()

    if api_key is None or api_key.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")

    return api_key


async def record_api_usage(db: AsyncSession, api_key: ApiKey, endpoint: str, status_code: int) -> None:
    db.add(
        ApiUsageEvent(
            api_key_id=api_key.id,
            endpoint=endpoint,
            status_code=status_code,
            occurred_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
