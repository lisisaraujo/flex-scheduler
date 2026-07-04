from __future__ import annotations

from app.domain.calendar import build_day_overviews
from app.domain.types import (
    TeamMember,
    MemberAvailability,
    SchedulerInput,
    SchedulerMember,
    SchedulerShiftRequest,
)


def build_scheduler_members(
    team_members: list[TeamMember],
    availabilities: list[MemberAvailability],
) -> list[SchedulerMember]:
    availability_dates_by_member = {
        a.member_id: sorted(set(e.date for e in a.entries))
        for a in availabilities
    }
    members_with_availability = set(a.member_id for a in availabilities)

    result = [
        SchedulerMember(
            member_id=m.user_id,
            name=m.name,
            email=m.email,
            active=m.active,
            max_shifts=m.max_shifts,
            preferred_coworker_ids=sorted(set(m.preferred_coworker_ids)),
            availability_dates=availability_dates_by_member.get(m.user_id, []),
        )
        for m in team_members
        if m.user_id in members_with_availability
    ]
    return sorted(result, key=lambda m: m.name)


def build_scheduler_shift_requests(
    month_id: str,
    intake_limit_per_shift: int,
    availabilities: list[MemberAvailability],
) -> list[SchedulerShiftRequest]:
    return [
        SchedulerShiftRequest(
            shift_id=f"{day.date}:{shift.shift_type}",
            date=day.date,
            shift_type=shift.shift_type,
            capacity=shift.capacity,
            candidate_member_ids=list(shift.candidate_ids),
        )
        for day in build_day_overviews(month_id, intake_limit_per_shift, availabilities)
        for shift in day.shifts
    ]


def build_scheduler_input(
    month_id: str,
    intake_limit_per_shift: int,
    availabilities: list[MemberAvailability],
    team_members: list[TeamMember],
) -> SchedulerInput:
    return SchedulerInput(
        month_id=month_id,
        members=build_scheduler_members(team_members, availabilities),
        shift_requests=build_scheduler_shift_requests(month_id, intake_limit_per_shift, availabilities),
    )
