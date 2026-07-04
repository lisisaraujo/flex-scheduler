from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Optional

ShiftType = Literal["night", "day"]
MonthStatus = Literal["draft", "open", "closed", "scheduled", "archived"]
SwapRequestStatus = Literal["pending", "accepted", "declined", "cancelled"]


@dataclass
class AvailabilityEntry:
    date: str
    shift_type: ShiftType


@dataclass
class MemberAvailability:
    member_id: str
    name: str
    email: Optional[str]
    entries: list[AvailabilityEntry]
    created_at: int  # Unix ms
    updated_at: int  # Unix ms


@dataclass
class ShiftOverview:
    shift_type: ShiftType
    capacity: int
    candidate_ids: list[str]
    candidate_names: list[str]
    is_full: bool


@dataclass
class DayOverview:
    date: str
    weekday_label: str
    weekend: bool
    shifts: list[ShiftOverview]


@dataclass
class DaySchedule:
    date: str
    weekday_label: str
    weekend: bool
    night: tuple[str | None, str | None]
    day: tuple[str | None, str | None]
    night_ids: tuple[str | None, str | None]
    day_ids: tuple[str | None, str | None]


@dataclass
class ShiftSlotRef:
    date: str
    shift_type: ShiftType
    slot: Literal[0, 1]


@dataclass
class ShiftSwapRequest:
    swap_id: str
    team_id: str
    month_id: str
    status: SwapRequestStatus
    requester_id: str
    requester_name: str
    requestee_id: str
    requestee_name: str
    requester_shift: ShiftSlotRef
    requestee_shift: ShiftSlotRef
    created_at: int  # Unix ms
    updated_at: int  # Unix ms


@dataclass
class SchedulerMember:
    member_id: str
    name: str
    email: Optional[str]
    active: bool
    max_shifts: Optional[int]
    preferred_coworker_ids: list[str]
    availability_dates: list[str]


@dataclass
class SchedulerShiftRequest:
    shift_id: str
    date: str
    shift_type: ShiftType
    capacity: int
    candidate_member_ids: list[str]


@dataclass
class SchedulerInput:
    month_id: str
    members: list[SchedulerMember]
    shift_requests: list[SchedulerShiftRequest]


@dataclass
class TeamMember:
    membership_id: str
    user_id: str
    team_id: str
    role: str
    created_at: int  # Unix ms
    name: str
    email: str
    active: bool
    max_shifts: Optional[int]
    preferred_coworker_ids: list[str]
