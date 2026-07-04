from __future__ import annotations
import calendar
from datetime import date

from app.domain.types import (
    AvailabilityEntry,
    DayOverview,
    MemberAvailability,
    ShiftOverview,
    ShiftType,
)


def list_month_dates(month_id: str) -> list[str]:
    year, month = map(int, month_id.split("-"))
    _, days_in_month = calendar.monthrange(year, month)
    return [f"{year:04d}-{month:02d}-{day:02d}" for day in range(1, days_in_month + 1)]


def is_weekend(date_str: str) -> bool:
    d = date.fromisoformat(date_str)
    return d.weekday() >= 5  # 5=Saturday, 6=Sunday


def format_weekday_label(date_str: str) -> str:
    d = date.fromisoformat(date_str)
    return d.strftime("%a %d")


def selectable_shifts(date_str: str) -> list[ShiftType]:
    return ["night", "day"] if is_weekend(date_str) else ["night"]


def get_shift_capacity(date_str: str, shift_type: ShiftType, intake_limit_per_shift: int) -> int:
    if shift_type == "day" and not is_weekend(date_str):
        return 0
    return intake_limit_per_shift


def build_day_overviews(
    month_id: str,
    intake_limit_per_shift: int,
    availabilities: list[MemberAvailability],
) -> list[DayOverview]:
    rosters: dict[str, dict[ShiftType, ShiftOverview]] = {}

    for availability in availabilities:
        for entry in availability.entries:
            shift_map = rosters.setdefault(entry.date, {})
            existing = shift_map.get(entry.shift_type)
            if existing is None:
                existing = ShiftOverview(
                    shift_type=entry.shift_type,
                    capacity=get_shift_capacity(entry.date, entry.shift_type, intake_limit_per_shift),
                    candidate_ids=[],
                    candidate_names=[],
                    is_full=False,
                )
                shift_map[entry.shift_type] = existing

            if availability.member_id not in existing.candidate_ids:
                existing.candidate_ids.append(availability.member_id)
                existing.candidate_names.append(availability.name)

    days: list[DayOverview] = []
    for date_str in list_month_dates(month_id):
        shift_map = rosters.get(date_str, {})
        shifts: list[ShiftOverview] = []
        for shift_type in selectable_shifts(date_str):
            existing = shift_map.get(shift_type)
            if existing is None:
                existing = ShiftOverview(
                    shift_type=shift_type,
                    capacity=get_shift_capacity(date_str, shift_type, intake_limit_per_shift),
                    candidate_ids=[],
                    candidate_names=[],
                    is_full=False,
                )
            sorted_names = sorted(existing.candidate_names)
            shifts.append(ShiftOverview(
                shift_type=existing.shift_type,
                capacity=existing.capacity,
                candidate_ids=existing.candidate_ids,
                candidate_names=sorted_names,
                is_full=existing.capacity > 0 and len(existing.candidate_ids) >= existing.capacity,
            ))
        days.append(DayOverview(
            date=date_str,
            weekday_label=format_weekday_label(date_str),
            weekend=is_weekend(date_str),
            shifts=shifts,
        ))

    return days
