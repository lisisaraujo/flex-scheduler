from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class SchedulingProfileSchema(BaseModel):
    active: bool
    maxShifts: Optional[int]
    preferredCoworkerIds: list[str]


class TeamMemberSchema(BaseModel):
    membershipId: str
    userId: str
    teamId: str
    role: str
    createdAt: int  # Unix ms
    name: str
    email: str
    schedulingProfile: SchedulingProfileSchema


class InvitationSchema(BaseModel):
    invitationId: str
    teamId: str
    teamName: str
    email: str
    role: str
    status: str
    invitedByUserId: str
    createdAt: int  # Unix ms
    expiresAt: int  # Unix ms


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class RegisterBody(BaseModel):
    name: str
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class CreateInvitationBody(BaseModel):
    email: str
    role: str = "team_member"


class AcceptInvitationBody(BaseModel):
    invitationId: str
    name: str
    password: str


class UpdateSchedulingBody(BaseModel):
    active: bool
    maxShifts: Optional[int]


class UpdatePreferredCoworkersBody(BaseModel):
    preferredCoworkerIds: list[str]
