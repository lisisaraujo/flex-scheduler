import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import DbSession, require_team_admin
from app.core.security import create_firebase_user, delete_firebase_user, sign_in_with_firebase_password
from app.repositories.auth_repository import (
    accept_invitation,
    create_invitation,
    get_invitation_by_id,
    list_invitations_for_team,
    resend_invitation,
    revoke_invitation,
)
from app.schemas.auth import SessionUser
from app.schemas.members import AcceptInvitationBody, CreateInvitationBody
from app.services.mailer import send_invitation_email

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


@router.get("")
async def list_invitations(
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_admin())],
):
    invitations = await list_invitations_for_team(db, uuid.UUID(current_user.teamId))
    return {"ok": True, "invitations": [i.model_dump() for i in invitations]}


@router.post("")
async def create(
    body: CreateInvitationBody,
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        invitation = await create_invitation(
            db,
            team_id=uuid.UUID(current_user.teamId),
            team_name=current_user.teamName,
            invited_by_user_id=uuid.UUID(current_user.userId),
            email=body.email,
            role=body.role,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    await send_invitation_email(
        invitation_id=invitation.invitationId,
        email=invitation.email,
        team_name=invitation.teamName,
        role=invitation.role,
        expires_at_ms=invitation.expiresAt,
    )

    return {"ok": True, "invitation": invitation.model_dump(), "delivered": True}


@router.get("/{invitation_id}")
async def get_invitation(invitation_id: str, db: DbSession):
    """Public — no auth needed; used by the accept-invitation page."""
    try:
        invitation = await get_invitation_by_id(db, uuid.UUID(invitation_id))
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {"ok": True, "invitation": invitation.model_dump()}


@router.patch("/{invitation_id}")
async def update_invitation(
    invitation_id: str,
    body: dict,
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_admin())],
):
    action = body.get("action")
    if action != "resend":
        raise HTTPException(400, "Unsupported action")

    try:
        invitation = await resend_invitation(
            db,
            invitation_id=uuid.UUID(invitation_id),
            team_id=uuid.UUID(current_user.teamId),
            invited_by_user_id=uuid.UUID(current_user.userId),
        )
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(403 if msg == "Forbidden" else 400, msg)

    await send_invitation_email(
        invitation_id=invitation.invitationId,
        email=invitation.email,
        team_name=invitation.teamName,
        role=invitation.role,
        expires_at_ms=invitation.expiresAt,
    )

    return {"ok": True, "invitation": invitation.model_dump()}


@router.delete("/{invitation_id}")
async def revoke(
    invitation_id: str,
    db: DbSession,
    current_user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        invitation = await revoke_invitation(
            db,
            invitation_id=uuid.UUID(invitation_id),
            team_id=uuid.UUID(current_user.teamId),
        )
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(403 if msg == "Forbidden" else 400, msg)
    return {"ok": True, "invitation": invitation.model_dump()}


@router.post("/accept")
async def accept(body: AcceptInvitationBody, db: DbSession):
    if len(body.name.strip()) < 2:
        raise HTTPException(400, "Name must be at least 2 characters")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    try:
        invitation = await get_invitation_by_id(db, uuid.UUID(body.invitationId))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    try:
        firebase_uid = create_firebase_user(
            email=invitation.email, password=body.password, display_name=body.name
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    try:
        user = await accept_invitation(
            db,
            invitation_id=uuid.UUID(body.invitationId),
            name=body.name,
            firebase_uid=firebase_uid,
        )
    except ValueError as exc:
        delete_firebase_user(firebase_uid)
        raise HTTPException(400, str(exc))

    try:
        _, id_token, refresh_token = await sign_in_with_firebase_password(invitation.email, body.password)
    except HTTPException:
        raise

    return {"ok": True, "user": user.model_dump(), "token": id_token, "refreshToken": refresh_token}
