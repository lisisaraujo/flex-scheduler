from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import DbSession, get_current_user
from app.core.security import (
    create_firebase_user,
    delete_firebase_user,
    verify_firebase_id_token,
    sign_in_with_firebase_password,
)
from app.repositories.auth_repository import (
    get_user_contexts,
    register_user,
    resolve_session_user,
)
from app.schemas.auth import SessionUser
from app.schemas.members import LoginBody, RegisterBody

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register")
async def register(body: RegisterBody, db: DbSession):
    """Creates a Firebase user + User record. No org/team is assigned here.
    The super_admin must add this user to an org or team separately.
    Returns token + refreshToken so the caller can store them for the super_admin setup flow.
    """
    body.name = body.name.strip()
    if len(body.name) < 2:
        raise HTTPException(400, "Name must be at least 2 characters")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    try:
        firebase_uid = create_firebase_user(email=body.email, password=body.password, display_name=body.name)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    try:
        user = await register_user(db, name=body.name, email=body.email, firebase_uid=firebase_uid)
    except ValueError as exc:
        delete_firebase_user(firebase_uid)
        raise HTTPException(400, str(exc))

    try:
        _, id_token, refresh_token = await sign_in_with_firebase_password(body.email, body.password)
    except HTTPException:
        raise

    return {
        "ok": True,
        "userId": str(user.id),
        "name": user.name,
        "email": user.email,
        "token": id_token,
        "refreshToken": refresh_token,
    }


@router.post("/login")
async def login(body: LoginBody, db: DbSession):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    try:
        firebase_uid, id_token, refresh_token = await sign_in_with_firebase_password(body.email, body.password)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(401, str(exc))

    user_obj, contexts = await get_user_contexts(db, firebase_uid=firebase_uid)
    if not user_obj:
        raise HTTPException(401, "Account not found. Please register first.")

    base = {
        "ok": True,
        "userId": str(user_obj.id),
        "name": user_obj.name,
        "email": user_obj.email,
        "token": id_token,
        "refreshToken": refresh_token,
    }

    if len(contexts) == 1:
        # Auto-select: return the full SessionUser so the client can set the cookie immediately
        ctx = contexts[0]
        session_user = SessionUser(
            userId=str(user_obj.id),
            name=user_obj.name,
            email=user_obj.email,
            orgId=ctx.orgId,
            orgName=ctx.orgName,
            teamId=ctx.teamId,
            teamName=ctx.teamName,
            role=ctx.role,
        )
        return {**base, "user": session_user.model_dump(), "contexts": [ctx.model_dump()]}

    # Multiple contexts or no context — return the list, frontend shows picker or no-access screen
    return {**base, "user": None, "contexts": [c.model_dump() for c in contexts]}


@router.get("/contexts")
async def list_contexts(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
):
    """Returns all contexts the authenticated user can access. Used by the context picker page."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")

    token = authorization.split(" ", 1)[1].strip()
    decoded = verify_firebase_id_token(token)
    _, contexts = await get_user_contexts(db, firebase_uid=decoded["uid"])
    return {"ok": True, "contexts": [c.model_dump() for c in contexts]}


@router.get("/me")
async def me(user: Annotated[SessionUser, Depends(get_current_user)]) -> dict:
    return {"ok": True, "user": user.model_dump()}
