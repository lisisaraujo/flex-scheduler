from __future__ import annotations
from datetime import datetime, timezone

from app.domain.types import DaySchedule, ShiftSlotRef


def _slot_ids(row: DaySchedule, shift_type: str) -> tuple[str | None, str | None]:
    return row.night_ids if shift_type == "night" else row.day_ids


def _slot_names(row: DaySchedule, shift_type: str) -> tuple[str | None, str | None]:
    return row.night if shift_type == "night" else row.day


def is_same_slot(left: ShiftSlotRef, right: ShiftSlotRef) -> bool:
    return left.date == right.date and left.shift_type == right.shift_type and left.slot == right.slot


def find_assigned_member_id(assignments: list[DaySchedule], ref: ShiftSlotRef) -> str | None:
    for row in assignments:
        if row.date == ref.date:
            ids = _slot_ids(row, ref.shift_type)
            return ids[ref.slot]
    return None


def validate_swap_proposal(
    assignments: list[DaySchedule],
    requester_id: str,
    requestee_id: str,
    requester_shift: ShiftSlotRef,
    requestee_shift: ShiftSlotRef,
    now_ms: int | None = None,
) -> None:
    if requester_id == requestee_id:
        raise ValueError("You cannot propose a swap with yourself")

    if is_same_slot(requester_shift, requestee_shift):
        raise ValueError("Choose two different shifts to swap")

    now = datetime.fromtimestamp((now_ms or int(datetime.now(timezone.utc).timestamp() * 1000)) / 1000, tz=timezone.utc)
    today = now.date().isoformat()

    for ref in (requester_shift, requestee_shift):
        if ref.date < today:
            raise ValueError(f"Cannot propose a swap for {ref.date} because that date has already passed")

    if find_assigned_member_id(assignments, requester_shift) != requester_id:
        raise ValueError("You are not assigned to the shift you want to give up")

    if find_assigned_member_id(assignments, requestee_shift) != requestee_id:
        raise ValueError("The selected teammate is not assigned to that shift")


def _with_slot_value(
    row: DaySchedule,
    ref: ShiftSlotRef,
    new_id: str | None,
    new_name: str | None,
) -> DaySchedule:
    ids = list(_slot_ids(row, ref.shift_type))
    names = list(_slot_names(row, ref.shift_type))
    ids[ref.slot] = new_id
    names[ref.slot] = new_name
    id_pair: tuple[str | None, str | None] = (ids[0], ids[1])
    name_pair: tuple[str | None, str | None] = (names[0], names[1])

    if ref.shift_type == "night":
        return DaySchedule(row.date, row.weekday_label, row.weekend, name_pair, row.day, id_pair, row.day_ids)
    else:
        return DaySchedule(row.date, row.weekday_label, row.weekend, row.night, name_pair, row.night_ids, id_pair)


def apply_swap(
    assignments: list[DaySchedule],
    requester_shift: ShiftSlotRef,
    requestee_shift: ShiftSlotRef,
) -> list[DaySchedule]:
    requester_row = next((r for r in assignments if r.date == requester_shift.date), None)
    requestee_row = next((r for r in assignments if r.date == requestee_shift.date), None)

    if not requester_row or not requestee_row:
        raise ValueError("The shifts being swapped no longer exist in the schedule")

    requester_id = _slot_ids(requester_row, requester_shift.shift_type)[requester_shift.slot]
    requester_name = _slot_names(requester_row, requester_shift.shift_type)[requester_shift.slot]
    requestee_id = _slot_ids(requestee_row, requestee_shift.shift_type)[requestee_shift.slot]
    requestee_name = _slot_names(requestee_row, requestee_shift.shift_type)[requestee_shift.slot]

    result: list[DaySchedule] = []
    for row in assignments:
        next_row = row
        if row.date == requester_shift.date:
            next_row = _with_slot_value(next_row, requester_shift, requestee_id, requestee_name)
        if row.date == requestee_shift.date:
            next_row = _with_slot_value(next_row, requestee_shift, requester_id, requester_name)
        result.append(next_row)

    return result
