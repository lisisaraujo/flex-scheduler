from __future__ import annotations
from datetime import date, timedelta

from app.domain.calendar import build_day_overviews
from app.domain.types import (
    DayOverview,
    DaySchedule,
    MemberAvailability,
    SchedulerInput,
    SchedulerMember,
    SchedulerShiftRequest,
    ShiftType,
)


# ---------------------------------------------------------------------------
# Deterministic shuffle (mirrors the TS LCG implementation exactly)
# ---------------------------------------------------------------------------

def _make_seed(s: str) -> int:
    seed = 0
    for ch in s:
        seed = ((seed * 31) + ord(ch)) & 0xFFFFFFFF
    return seed or 1


def _shuffle(items: list, seed_input: str) -> list:
    result = list(items)
    seed = _make_seed(seed_input)
    for i in range(len(result) - 1, 0, -1):
        seed = ((seed * 1664525) + 1013904223) & 0xFFFFFFFF
        j = seed % (i + 1)
        result[i], result[j] = result[j], result[i]
    return result


def _previous_date(date_str: str) -> str:
    d = date.fromisoformat(date_str)
    return (d - timedelta(days=1)).isoformat()


# ---------------------------------------------------------------------------
# Scheduler state
# ---------------------------------------------------------------------------

class _State:
    def __init__(self, members: list[SchedulerMember]) -> None:
        self.name_by_member: dict[str, str] = {m.member_id: m.name for m in members}
        self.member_by_id: dict[str, SchedulerMember] = {m.member_id: m for m in members}
        self.assignments_by_member: dict[str, set[str]] = {}
        self.assignments_by_shift: dict[str, list[str | None]] = {}
        self.count_by_member: dict[str, int] = {m.member_id: 0 for m in members}


def _empty_slots() -> list[str | None]:
    return [None, None]


def _filled_count(slots: list[str | None]) -> int:
    return sum(1 for s in slots if s)


def _assigned_ids_for_shift(state: _State, shift_id: str) -> list[str]:
    return [s for s in state.assignments_by_shift.get(shift_id, _empty_slots()) if s]


def _can_take_shift(member_id: str, date_str: str, shift_type: ShiftType, state: _State) -> bool:
    member = state.member_by_id.get(member_id)
    if not member or not member.active:
        return False
    if member.max_shifts is not None and state.count_by_member.get(member_id, 0) >= member.max_shifts:
        return False
    assigned = state.assignments_by_member.get(member_id, set())
    if f"{date_str}:night" in assigned or f"{date_str}:day" in assigned:
        return False
    if shift_type == "day" and f"{_previous_date(date_str)}:night" in assigned:
        return False
    return True


def _rank_candidates(month_id: str, shift: SchedulerShiftRequest, state: _State) -> list[dict]:
    shuffled = _shuffle(shift.candidate_member_ids, f"{month_id}:{shift.shift_id}:{','.join(shift.candidate_member_ids)}")
    ranked = [
        {"member_id": mid, "count": state.count_by_member.get(mid, 0), "tie": i}
        for i, mid in enumerate(shuffled)
        if mid in state.member_by_id
    ]
    return sorted(ranked, key=lambda c: (c["count"], c["tie"]))


def _assign(state: _State, shift: SchedulerShiftRequest, member_id: str, slot_index: int) -> None:
    slots = state.assignments_by_shift.setdefault(shift.shift_id, _empty_slots())
    slots[slot_index] = member_id
    state.assignments_by_member.setdefault(member_id, set()).add(f"{shift.date}:{shift.shift_type}")
    state.count_by_member[member_id] = state.count_by_member.get(member_id, 0) + 1


def _remove(state: _State, shift_id: str, member_id: str) -> None:
    slots = state.assignments_by_shift.get(shift_id, _empty_slots())
    compacted: list[str | None] = [s for s in slots if s and s != member_id]
    state.assignments_by_shift[shift_id] = [compacted[0] if len(compacted) > 0 else None,
                                             compacted[1] if len(compacted) > 1 else None]
    assigned = state.assignments_by_member.get(member_id, set())
    assigned.discard(shift_id)
    state.count_by_member[member_id] = max(0, state.count_by_member.get(member_id, 1) - 1)


def _preference_score(a: SchedulerMember, b: SchedulerMember) -> int:
    a_prefers_b = b.member_id in a.preferred_coworker_ids
    b_prefers_a = a.member_id in b.preferred_coworker_ids
    if a_prefers_b and b_prefers_a:
        return 2
    if a_prefers_b or b_prefers_a:
        return 1
    return 0


def _choose_best_pair(candidates: list[dict], state: _State) -> tuple[str, str] | None:
    best = None
    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            left, right = candidates[i], candidates[j]
            lm = state.member_by_id.get(left["member_id"])
            rm = state.member_by_id.get(right["member_id"])
            if not lm or not rm:
                continue
            fairness = left["count"] + right["count"]
            pref = _preference_score(lm, rm)
            rank = left["tie"] + right["tie"]
            if best is None:
                best = (left["member_id"], right["member_id"], fairness, pref, rank)
            else:
                _, _, bf, bp, br = best
                if (fairness < bf
                        or (fairness == bf and pref > bp)
                        or (fairness == bf and pref == bp and rank < br)):
                    best = (left["member_id"], right["member_id"], fairness, pref, rank)
    return (best[0], best[1]) if best else None


def _find_best_single(
    month_id: str, shift: SchedulerShiftRequest, state: _State, excluded: set[str]
) -> str | None:
    for c in _rank_candidates(month_id, shift, state):
        if c["member_id"] not in excluded and _can_take_shift(c["member_id"], shift.date, shift.shift_type, state):
            return c["member_id"]
    return None


def _fill_shift_slots(month_id: str, shift: SchedulerShiftRequest, state: _State) -> None:
    ranked = [c for c in _rank_candidates(month_id, shift, state)
              if _can_take_shift(c["member_id"], shift.date, shift.shift_type, state)]

    if not ranked:
        return
    if len(ranked) == 1:
        _assign(state, shift, ranked[0]["member_id"], 0)
        return

    pair = _choose_best_pair(ranked, state)
    if pair:
        _assign(state, shift, pair[0], 0)
        _assign(state, shift, pair[1], 1)
        return

    for idx, c in enumerate(ranked[:2]):
        _assign(state, shift, c["member_id"], idx)


def _try_rebalance(
    month_id: str,
    target: SchedulerShiftRequest,
    candidate_id: str,
    state: _State,
    shift_map: dict[str, SchedulerShiftRequest],
) -> bool:
    assigned_shifts = list(state.assignments_by_member.get(candidate_id, set()))
    target_filled_before = _filled_count(state.assignments_by_shift.get(target.shift_id, _empty_slots()))

    for donor_id in assigned_shifts:
        if donor_id == target.shift_id:
            continue
        donor = shift_map.get(donor_id)
        if not donor:
            continue
        donor_slots = state.assignments_by_shift.get(donor_id, _empty_slots())
        if _filled_count(donor_slots) < 2:
            continue
        donor_slot_index = 0 if donor_slots[0] == candidate_id else 1

        _remove(state, donor_id, candidate_id)

        if _can_take_shift(candidate_id, target.date, target.shift_type, state):
            target_slots = state.assignments_by_shift.get(target.shift_id, _empty_slots())
            slot_index = 0 if target_slots[0] is None else 1
            _assign(state, target, candidate_id, slot_index)

            already_in_donor = set(_assigned_ids_for_shift(state, donor_id))
            already_in_donor.add(candidate_id)
            replacement = _find_best_single(month_id, donor, state, already_in_donor)
            if replacement:
                _assign(state, donor, replacement, donor_slot_index)
                return True
            if target_filled_before == 0:
                return True
            _remove(state, target.shift_id, candidate_id)

        _assign(state, donor, candidate_id, donor_slot_index)

    return False


def _rebalance(month_id: str, scheduler_input: SchedulerInput, state: _State, shift_map: dict) -> None:
    prioritized = sorted(
        scheduler_input.shift_requests,
        key=lambda s: (
            _filled_count(state.assignments_by_shift.get(s.shift_id, _empty_slots())),
            len(s.candidate_member_ids),
            s.shift_id,
        ),
    )

    for target in prioritized:
        while _filled_count(state.assignments_by_shift.get(target.shift_id, _empty_slots())) < 2:
            ranked = _rank_candidates(month_id, target, state)
            improved = any(
                _try_rebalance(month_id, target, c["member_id"], state, shift_map) for c in ranked
            )
            if not improved:
                break


def _build_fallback_input(month_id: str, intake_limit: int, availabilities: list[MemberAvailability]) -> SchedulerInput:
    from app.domain.types import SchedulerInput
    from app.domain.scheduler_input import build_scheduler_shift_requests
    days = build_day_overviews(month_id, intake_limit, availabilities)
    members = [
        SchedulerMember(
            member_id=a.member_id,
            name=a.name,
            email=a.email,
            active=True,
            max_shifts=None,
            preferred_coworker_ids=[],
            availability_dates=sorted(set(e.date for e in a.entries)),
        )
        for a in availabilities
    ]
    return SchedulerInput(
        month_id=month_id,
        members=members,
        shift_requests=build_scheduler_shift_requests(month_id, intake_limit, availabilities),
    )


def generate_schedule(
    month_id: str,
    intake_limit_per_shift: int,
    availabilities: list[MemberAvailability],
    scheduler_input: SchedulerInput | None = None,
) -> list[DaySchedule]:
    if scheduler_input is None:
        scheduler_input = _build_fallback_input(month_id, intake_limit_per_shift, availabilities)

    state = _State(scheduler_input.members)
    shift_map = {s.shift_id: s for s in scheduler_input.shift_requests}
    days = build_day_overviews(month_id, intake_limit_per_shift, availabilities)

    for day in days:
        for shift in day.shifts:
            sr = shift_map.get(f"{day.date}:{shift.shift_type}")
            if sr:
                _fill_shift_slots(month_id, sr, state)

    _rebalance(month_id, scheduler_input, state, shift_map)

    result: list[DaySchedule] = []
    for day in days:
        night_slots = state.assignments_by_shift.get(f"{day.date}:night", _empty_slots())
        day_slots = state.assignments_by_shift.get(f"{day.date}:day", _empty_slots())
        result.append(DaySchedule(
            date=day.date,
            weekday_label=day.weekday_label,
            weekend=day.weekend,
            night=(
                state.name_by_member.get(night_slots[0]) if night_slots[0] else None,
                state.name_by_member.get(night_slots[1]) if night_slots[1] else None,
            ),
            day=(
                state.name_by_member.get(day_slots[0]) if day_slots[0] else None,
                state.name_by_member.get(day_slots[1]) if day_slots[1] else None,
            ),
            night_ids=(night_slots[0], night_slots[1]),
            day_ids=(day_slots[0], day_slots[1]),
        ))

    return result
