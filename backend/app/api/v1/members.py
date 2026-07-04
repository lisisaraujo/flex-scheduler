import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import DbSession, require_team_admin, require_team_context
from app.models.enums import MembershipRole
from app.repositories.auth_repository import (
    list_members_for_team,
    remove_team_member,
    update_member_scheduling,
    update_preferred_coworkers,
)
from app.schemas.auth import SessionUser
from app.schemas.members import UpdatePreferredCoworkersBody, UpdateSchedulingBody

router = APIRouter(prefix="/api/v1/members", tags=["members"])


@router.get("")
async def list_members(
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    members = await list_members_for_team(db, uuid.UUID(user.teamId))
    return {"ok": True, "members": [m.model_dump() for m in members]}


@router.delete("/{user_id}")
async def remove_member(
    user_id: str,
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        await remove_team_member(
            db,
            team_id=uuid.UUID(current_user.teamId),
            target_user_id=uuid.UUID(user_id),
            acting_user_id=uuid.UUID(current_user.userId),
        )
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(403 if msg == "Forbidden" else 400, msg)
    return {"ok": True}


@router.patch("/{user_id}")
async def update_member(
    user_id: str,
    body: dict,
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_context())],
):
    try:
        if current_user.role in (MembershipRole.team_admin, MembershipRole.org_admin):
            parsed = UpdateSchedulingBody(**body)
            await update_member_scheduling(
                db,
                team_id=uuid.UUID(current_user.teamId),
                target_user_id=uuid.UUID(user_id),
                active=parsed.active,
                max_shifts=parsed.maxShifts,
            )
        else:
            if current_user.userId != user_id:
                raise HTTPException(403, "Forbidden")
            parsed = UpdatePreferredCoworkersBody(**body)
            await update_preferred_coworkers(
                db,
                team_id=uuid.UUID(current_user.teamId),
                target_user_id=uuid.UUID(user_id),
                preferred_coworker_ids=parsed.preferredCoworkerIds,
            )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True}
