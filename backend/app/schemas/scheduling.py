from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------

class ShiftSlotRefSchema(BaseModel):
    date: str
    shiftType: str
    slot: int


class ShiftOverviewSchema(BaseModel):
    shiftType: str
    capacity: int
    candidateIds: list[str]
    candidateNames: list[str]
    isFull: bool


class DayOverviewSchema(BaseModel):
    date: str
    weekdayLabel: str
    weekend: bool
    shifts: list[ShiftOverviewSchema]


class AvailabilityEntrySchema(BaseModel):
    date: str
    shiftType: str


class MemberAvailabilitySchema(BaseModel):
    memberId: str
    name: str
    email: Optional[str]
    entries: list[AvailabilityEntrySchema]
    createdAt: int
    updatedAt: int


class DayScheduleSchema(BaseModel):
    date: str
    weekdayLabel: str
    weekend: bool
    night: tuple[Optional[str], Optional[str]]
    day: tuple[Optional[str], Optional[str]]
    nightIds: tuple[Optional[str], Optional[str]]
    dayIds: tuple[Optional[str], Optional[str]]


# ---------------------------------------------------------------------------
# Month
# ---------------------------------------------------------------------------

class MonthDocSchema(BaseModel):
    teamId: str
    monthId: str
    orgName: str
    timezone: str
    intakeLimitPerShift: int
    deadlineAt: int  # Unix ms
    status: str
    createdAt: int   # Unix ms
    updatedAt: int   # Unix ms


class MonthSnapshotSchema(BaseModel):
    month: MonthDocSchema
    days: list[DayOverviewSchema]
    availabilities: list[MemberAvailabilitySchema]
    assignments: list[DayScheduleSchema]


# ---------------------------------------------------------------------------
# Swap requests
# ---------------------------------------------------------------------------

class ShiftSwapRequestSchema(BaseModel):
    swapId: str
    teamId: str
    monthId: str
    status: str
    requesterId: str
    requesterName: str
    requesteeId: str
    requesteeName: str
    requesterShift: ShiftSlotRefSchema
    requesteeShift: ShiftSlotRefSchema
    createdAt: int  # Unix ms
    updatedAt: int  # Unix ms


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class CreateMonthBody(BaseModel):
    monthId: str
    orgName: str
    timezone: str
    deadlineAt: int  # Unix ms
    intakeLimitPerShift: int


class UpdateMonthSettingsBody(BaseModel):
    deadlineAt: int  # Unix ms
    intakeLimitPerShift: int
    status: str


class AvailabilityEntryBody(BaseModel):
    date: str
    shiftType: str


class UpdateAvailabilityBody(BaseModel):
    entries: list[AvailabilityEntryBody]


class AssignmentSlotBody(BaseModel):
    date: str
    weekend: bool
    night: tuple[Optional[str], Optional[str]]
    day: tuple[Optional[str], Optional[str]]


class UpdateAssignmentsBody(BaseModel):
    assignments: list[AssignmentSlotBody]


class CreateSwapBody(BaseModel):
    requesteeId: str
    requesterShift: ShiftSlotRefSchema
    requesteeShift: ShiftSlotRefSchema


class RespondSwapBody(BaseModel):
    accept: bool
