from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import MembershipRole


class SessionUser(BaseModel):
    """Authenticated user with their active context (org + optional team). Camel-case fields match TS."""

    model_config = ConfigDict(populate_by_name=True)

    userId: str
    name: str
    email: str
    orgId: str
    orgName: str
    teamId: Optional[str]   # None = org-level context (org_admin viewing org dashboard)
    teamName: Optional[str]
    role: MembershipRole


class UserContext(BaseModel):
    """A selectable context returned after login when a user has multiple memberships."""
    type: str  # "org" | "team"
    orgId: str
    orgName: str
    teamId: Optional[str] = None
    teamName: Optional[str] = None
    role: MembershipRole
