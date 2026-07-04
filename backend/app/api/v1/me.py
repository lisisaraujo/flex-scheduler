from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.auth import SessionUser

router = APIRouter(prefix="/api/v1", tags=["me"])


@router.get("/me", response_model=SessionUser)
async def read_current_user(user: Annotated[SessionUser, Depends(get_current_user)]) -> SessionUser:
    """Reference endpoint for the Firebase-Bearer-token auth path used by your own frontend(s)."""
    return user
