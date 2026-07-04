from __future__ import annotations
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.domain.assignment import generate_schedule
from app.domain.calendar import build_day_overviews, format_weekday_label, is_weekend, selectable_shifts
from app.domain.scheduler_input import build_scheduler_input
from app.domain.swap import apply_swap, is_same_slot, validate_swap_proposal
from app.domain.types import (
    AvailabilityEntry,
    TeamMember,
    DaySchedule,
    MemberAvailability,
    ShiftSlotRef,
)
from app.models import (
    Assignment,
    Availability,
    AvailabilityEntry as AvailabilityEntryModel,
    CalendarMonth,
    SwapRequest,
    User,
)
from app.models.enums import MonthStatus, ShiftType, SwapStatus
from app.repositories.auth_repository import list_members_for_team
from app.schemas.scheduling import (
    AvailabilityEntrySchema,
    DayOverviewSchema,
    DayScheduleSchema,
    MemberAvailabilitySchema,
    MonthDocSchema,
    MonthSnapshotSchema,
    ShiftOverviewSchema,
    ShiftSlotRefSchema,
    ShiftSwapRequestSchema,
)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _dt_to_ms(dt: datetime | None) -> int:
    return int(dt.timestamp() * 1000) if dt else 0


def _ms_to_dt(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


# ---------------------------------------------------------------------------
# Months
# ---------------------------------------------------------------------------

async def list_months(db: AsyncSession, team_id: uuid.UUID) -> list[MonthDocSchema]:
    stmt = select(CalendarMonth).where(CalendarMonth.team_id == team_id)
    months = (await db.execute(stmt)).scalars().all()

    status_order = {"draft": 0, "open": 1, "closed": 2, "scheduled": 3, "archived": 4}
    sorted_months = sorted(
        months,
        key=lambda m: ([-ord(c) for c in m.month_id], status_order.get(m.status, 0)),
    )
    return [_month_to_schema(m) for m in sorted_months]


async def create_month(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id: str,
    org_name: str,
    timezone_str: str,
    deadline_at_ms: int,
    intake_limit_per_shift: int,
) -> MonthDocSchema:
    month_id = month_id.strip()
    import re
    if not re.fullmatch(r"\d{4}-\d{2}", month_id):
        raise ValueError("monthId must use yyyy-mm format")

    existing = (
        await db.execute(
            select(CalendarMonth).where(
                and_(CalendarMonth.team_id == team_id, CalendarMonth.month_id == month_id)
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise ValueError(f"Month {month_id} already exists")

    now = datetime.now(timezone.utc)
    month = CalendarMonth(
        team_id=team_id,
        month_id=month_id,
        org_name=org_name.strip(),
        timezone=timezone_str.strip() or "Europe/Berlin",
        deadline_at=_ms_to_dt(deadline_at_ms),
        intake_limit_per_shift=intake_limit_per_shift,
        status=MonthStatus.open,
        created_at=now,
        updated_at=now,
    )
    db.add(month)
    await db.commit()
    return _month_to_schema(month)


async def get_month_snapshot(
    db: AsyncSession, team_id: uuid.UUID, month_id_str: str
) -> MonthSnapshotSchema:
    month = await _require_month(db, team_id, month_id_str)
    availabilities = await _load_availabilities(db, month.id)
    assignments = await _load_assignments(db, month.id)
    days = build_day_overviews(month.month_id, month.intake_limit_per_shift, availabilities)

    return MonthSnapshotSchema(
        month=_month_to_schema(month),
        days=[_day_overview_to_schema(d) for d in days],
        availabilities=[_availability_to_schema(a) for a in availabilities],
        assignments=[_day_schedule_to_schema(a) for a in assignments],
    )


async def update_month_settings(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    deadline_at_ms: int,
    intake_limit_per_shift: int,
    status: str,
) -> None:
    month = await _require_month(db, team_id, month_id_str)
    if month.status == MonthStatus.scheduled and status != MonthStatus.scheduled:
        await db.execute(delete(Assignment).where(Assignment.calendar_month_id == month.id))

    month.deadline_at = _ms_to_dt(deadline_at_ms)
    month.intake_limit_per_shift = intake_limit_per_shift
    month.status = MonthStatus(status)
    month.updated_at = datetime.now(timezone.utc)
    await db.commit()


async def delete_month(db: AsyncSession, team_id: uuid.UUID, month_id_str: str) -> None:
    month = await _require_month(db, team_id, month_id_str)
    if month.status not in (MonthStatus.draft, MonthStatus.archived):
        raise ValueError("Only draft or archived months can be deleted permanently")

    avails = (
        await db.execute(select(Availability.id).where(Availability.calendar_month_id == month.id))
    ).scalars().all()
    if avails:
        await db.execute(
            delete(AvailabilityEntryModel).where(AvailabilityEntryModel.availability_id.in_(avails))
        )
    await db.execute(delete(Availability).where(Availability.calendar_month_id == month.id))
    await db.execute(delete(Assignment).where(Assignment.calendar_month_id == month.id))
    await db.delete(month)
    await db.commit()


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

async def update_availability(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    member_id: uuid.UUID,
    member_name: str,
    member_email: str | None,
    entries: list[dict],
) -> str:
    if len(member_name.strip()) < 2:
        raise ValueError("Name must be at least 2 characters")

    _validate_entries(entries, month_id_str)
    month = await _require_month(db, team_id, month_id_str)

    if month.status != MonthStatus.open:
        raise ValueError("This month is not open for availability")
    if datetime.now(timezone.utc) > month.deadline_at:
        raise ValueError("The intake deadline has passed")

    all_avails = await _load_availabilities(db, month.id)
    counts: dict[str, int] = {}
    for a in all_avails:
        if a.member_id == str(member_id):
            continue
        for e in a.entries:
            key = f"{e.date}:{e.shift_type}"
            counts[key] = counts.get(key, 0) + 1

    for entry in entries:
        key = f"{entry['date']}:{entry['shiftType']}"
        if counts.get(key, 0) >= month.intake_limit_per_shift:
            raise ValueError(f"The {entry['shiftType']} shift on {entry['date']} is already full")

    existing_avail = (
        await db.execute(
            select(Availability).where(
                and_(Availability.calendar_month_id == month.id, Availability.member_id == member_id)
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing_avail:
        await db.execute(
            delete(AvailabilityEntryModel).where(
                AvailabilityEntryModel.availability_id == existing_avail.id
            )
        )
        existing_avail.updated_at = now
        avail = existing_avail
    else:
        avail = Availability(
            calendar_month_id=month.id,
            member_id=member_id,
            created_at=now,
            updated_at=now,
        )
        db.add(avail)
        await db.flush()

    for entry in entries:
        db.add(AvailabilityEntryModel(
            availability_id=avail.id,
            date=date.fromisoformat(entry["date"]),
            shift_type=ShiftType(entry["shiftType"]),
        ))

    await db.commit()
    return str(member_id)


# ---------------------------------------------------------------------------
# Schedule generation & editing
# ---------------------------------------------------------------------------

async def generate_month_schedule(
    db: AsyncSession, team_id: uuid.UUID, month_id_str: str
) -> list[DayScheduleSchema]:
    month = await _require_month(db, team_id, month_id_str)
    if month.status not in (MonthStatus.open, MonthStatus.closed, MonthStatus.scheduled):
        raise ValueError("Only open, closed, or scheduled months can generate a schedule")

    availabilities = await _load_availabilities(db, month.id)
    members_schema = await list_members_for_team(db, team_id)
    team_members = [
        TeamMember(
            membership_id=m.membershipId,
            user_id=m.userId,
            team_id=m.teamId,
            role=m.role,
            created_at=m.createdAt,
            name=m.name,
            email=m.email,
            active=m.schedulingProfile.active,
            max_shifts=m.schedulingProfile.maxShifts,
            preferred_coworker_ids=m.schedulingProfile.preferredCoworkerIds,
        )
        for m in members_schema
    ]

    scheduler_input = build_scheduler_input(
        month_id=month.month_id,
        intake_limit_per_shift=month.intake_limit_per_shift,
        availabilities=availabilities,
        team_members=team_members,
    )
    assignments = generate_schedule(
        month_id=month.month_id,
        intake_limit_per_shift=month.intake_limit_per_shift,
        availabilities=availabilities,
        scheduler_input=scheduler_input,
    )

    await _save_assignments(db, month.id, team_id, assignments)
    month.status = MonthStatus.scheduled
    month.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return [_day_schedule_to_schema(a) for a in assignments]


async def update_month_assignments(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    assignment_slots: list[dict],
) -> list[DayScheduleSchema]:
    month = await _require_month(db, team_id, month_id_str)
    availabilities = await _load_availabilities(db, month.id)
    members_schema = await list_members_for_team(db, team_id)
    team_members = [
        TeamMember(
            membership_id=m.membershipId,
            user_id=m.userId,
            team_id=m.teamId,
            role=m.role,
            created_at=m.createdAt,
            name=m.name,
            email=m.email,
            active=m.schedulingProfile.active,
            max_shifts=m.schedulingProfile.maxShifts,
            preferred_coworker_ids=m.schedulingProfile.preferredCoworkerIds,
        )
        for m in members_schema
    ]

    name_by_id = {m.userId: m.name for m in members_schema}

    _validate_edited_assignments(assignment_slots, availabilities, team_members)

    day_overviews = {d.date: d for d in build_day_overviews(
        month.month_id, month.intake_limit_per_shift, availabilities
    )}

    normalized: list[DaySchedule] = []
    for slot in sorted(assignment_slots, key=lambda s: s["date"]):
        day = day_overviews.get(slot["date"])
        weekday_label = day.weekday_label if day else format_weekday_label(slot["date"])
        n0, n1 = slot["night"]
        d0, d1 = slot["day"]
        normalized.append(DaySchedule(
            date=slot["date"],
            weekday_label=weekday_label,
            weekend=slot["weekend"],
            night=(name_by_id.get(n0) if n0 else None, name_by_id.get(n1) if n1 else None),
            day=(name_by_id.get(d0) if d0 else None, name_by_id.get(d1) if d1 else None),
            night_ids=(n0, n1),
            day_ids=(d0, d1),
        ))

    await _save_assignments(db, month.id, team_id, normalized)
    month.status = MonthStatus.scheduled
    month.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return [_day_schedule_to_schema(a) for a in normalized]


# ---------------------------------------------------------------------------
# Swaps
# ---------------------------------------------------------------------------

async def list_swaps_for_user(
    db: AsyncSession, team_id: uuid.UUID, month_id_str: str, user_id: uuid.UUID
) -> list[ShiftSwapRequestSchema]:
    month = await _require_month(db, team_id, month_id_str)

    Requester = aliased(User)
    Requestee = aliased(User)
    stmt = (
        select(SwapRequest, Requester.name.label("requester_name"), Requestee.name.label("requestee_name"))
        .join(Requester, SwapRequest.requester_id == Requester.id)
        .join(Requestee, SwapRequest.requestee_id == Requestee.id)
        .where(
            and_(
                SwapRequest.calendar_month_id == month.id,
                or_(SwapRequest.requester_id == user_id, SwapRequest.requestee_id == user_id),
            )
        )
        .order_by(SwapRequest.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    seen: dict[str, ShiftSwapRequestSchema] = {}
    for swap, req_name, ree_name in rows:
        key = str(swap.id)
        if key not in seen:
            seen[key] = _swap_to_schema(swap, req_name, ree_name, month.month_id, str(team_id))
    return list(seen.values())


async def create_swap_request(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    requester_id: uuid.UUID,
    requestee_id: uuid.UUID,
    requester_shift: ShiftSlotRefSchema,
    requestee_shift: ShiftSlotRefSchema,
) -> ShiftSwapRequestSchema:
    month = await _require_month(db, team_id, month_id_str)
    if month.status != MonthStatus.scheduled:
        raise ValueError("Swaps can only be requested once the schedule has been published")

    members = await list_members_for_team(db, team_id)
    member_by_id = {m.userId: m for m in members}
    requester = member_by_id.get(str(requester_id))
    requestee = member_by_id.get(str(requestee_id))

    if not requester or not requester.schedulingProfile.active:
        raise ValueError("You must be an active member to request a swap")
    if not requestee or not requestee.schedulingProfile.active:
        raise ValueError("The selected teammate is not an active member")

    assignments = await _load_assignments(db, month.id)
    req_slot = ShiftSlotRef(
        date=requester_shift.date,
        shift_type=requester_shift.shiftType,
        slot=requester_shift.slot,
    )
    ree_slot = ShiftSlotRef(
        date=requestee_shift.date,
        shift_type=requestee_shift.shiftType,
        slot=requestee_shift.slot,
    )
    validate_swap_proposal(assignments, str(requester_id), str(requestee_id), req_slot, ree_slot)

    existing_pending = (
        await db.execute(
            select(SwapRequest).where(
                and_(
                    SwapRequest.calendar_month_id == month.id,
                    SwapRequest.requester_id == requester_id,
                    SwapRequest.requestee_id == requestee_id,
                    SwapRequest.status == SwapStatus.pending,
                )
            )
        )
    ).scalars().all()

    for ex in existing_pending:
        ex_req = ShiftSlotRef(date=ex.requester_date.isoformat(), shift_type=ex.requester_shift_type, slot=ex.requester_slot)
        ex_ree = ShiftSlotRef(date=ex.requestee_date.isoformat(), shift_type=ex.requestee_shift_type, slot=ex.requestee_slot)
        if is_same_slot(ex_req, req_slot) and is_same_slot(ex_ree, ree_slot):
            raise ValueError("You already have a pending swap request for these shifts with this teammate")

    now = datetime.now(timezone.utc)
    swap = SwapRequest(
        calendar_month_id=month.id,
        status=SwapStatus.pending,
        requester_id=requester_id,
        requestee_id=requestee_id,
        requester_date=date.fromisoformat(requester_shift.date),
        requester_shift_type=ShiftType(requester_shift.shiftType),
        requester_slot=requester_shift.slot,
        requestee_date=date.fromisoformat(requestee_shift.date),
        requestee_shift_type=ShiftType(requestee_shift.shiftType),
        requestee_slot=requestee_shift.slot,
        created_at=now,
        updated_at=now,
    )
    db.add(swap)
    await db.commit()

    return _swap_to_schema(swap, requester.name, requestee.name, month.month_id, str(team_id))


async def cancel_swap_request(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    swap_id: uuid.UUID,
    requester_id: uuid.UUID,
) -> ShiftSwapRequestSchema:
    month = await _require_month(db, team_id, month_id_str)
    swap, req_name, ree_name = await _load_swap_with_names(db, swap_id, month.id)

    if str(swap.requester_id) != str(requester_id):
        raise ValueError("Forbidden")
    if swap.status != SwapStatus.pending:
        raise ValueError("This swap request is no longer pending")

    swap.status = SwapStatus.cancelled
    swap.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _swap_to_schema(swap, req_name, ree_name, month.month_id, str(team_id))


async def respond_to_swap_request(
    db: AsyncSession,
    team_id: uuid.UUID,
    month_id_str: str,
    swap_id: uuid.UUID,
    requestee_id: uuid.UUID,
    accept: bool,
) -> ShiftSwapRequestSchema:
    month = await _require_month(db, team_id, month_id_str)
    swap, req_name, ree_name = await _load_swap_with_names(db, swap_id, month.id)

    if str(swap.requestee_id) != str(requestee_id):
        raise ValueError("Forbidden")
    if swap.status != SwapStatus.pending:
        raise ValueError("This swap request is no longer pending")

    now = datetime.now(timezone.utc)
    if not accept:
        swap.status = SwapStatus.declined
        swap.updated_at = now
        await db.commit()
        return _swap_to_schema(swap, req_name, ree_name, month.month_id, str(team_id))

    if month.status != MonthStatus.scheduled:
        raise ValueError("This month no longer has a published schedule")

    assignments = await _load_assignments(db, month.id)
    req_slot = ShiftSlotRef(
        date=swap.requester_date.isoformat(),
        shift_type=swap.requester_shift_type,
        slot=swap.requester_slot,
    )
    ree_slot = ShiftSlotRef(
        date=swap.requestee_date.isoformat(),
        shift_type=swap.requestee_shift_type,
        slot=swap.requestee_slot,
    )
    validate_swap_proposal(
        assignments, str(swap.requester_id), str(swap.requestee_id), req_slot, ree_slot, int(now.timestamp() * 1000)
    )

    swapped = apply_swap(assignments, req_slot, ree_slot)
    touched = {swap.requester_date.isoformat(), swap.requestee_date.isoformat()}

    user_by_id = await _user_map(db, team_id)
    for row in swapped:
        if row.date in touched:
            await _upsert_assignment(db, month.id, team_id, row, user_by_id)

    swap.status = SwapStatus.accepted
    swap.updated_at = now
    await db.commit()
    return _swap_to_schema(swap, req_name, ree_name, month.month_id, str(team_id))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _require_month(db: AsyncSession, team_id: uuid.UUID, month_id_str: str) -> CalendarMonth:
    month = (
        await db.execute(
            select(CalendarMonth).where(
                and_(CalendarMonth.team_id == team_id, CalendarMonth.month_id == month_id_str)
            )
        )
    ).scalar_one_or_none()
    if not month:
        raise ValueError(f"Month {month_id_str} not found")
    return month


async def _load_availabilities(db: AsyncSession, calendar_month_id: uuid.UUID) -> list[MemberAvailability]:
    avail_rows = (
        await db.execute(
            select(Availability, User.name, User.email)
            .join(User, User.id == Availability.member_id)
            .where(Availability.calendar_month_id == calendar_month_id)
        )
    ).all()

    if not avail_rows:
        return []

    avail_ids = [row.Availability.id for row in avail_rows]
    entry_rows = (
        await db.execute(
            select(AvailabilityEntryModel)
            .where(AvailabilityEntryModel.availability_id.in_(avail_ids))
            .order_by(AvailabilityEntryModel.date)
        )
    ).scalars().all()

    entries_by_avail: dict[uuid.UUID, list[AvailabilityEntry]] = {}
    for e in entry_rows:
        entries_by_avail.setdefault(e.availability_id, []).append(
            AvailabilityEntry(date=e.date.isoformat(), shift_type=e.shift_type)
        )

    result = []
    for row in avail_rows:
        avail = row.Availability
        result.append(MemberAvailability(
            member_id=str(avail.member_id),
            name=row.name,
            email=row.email,
            entries=entries_by_avail.get(avail.id, []),
            created_at=_dt_to_ms(avail.created_at),
            updated_at=_dt_to_ms(avail.updated_at),
        ))
    return result


async def _load_assignments(db: AsyncSession, calendar_month_id: uuid.UUID) -> list[DaySchedule]:
    N0 = aliased(User)
    N1 = aliased(User)
    D0 = aliased(User)
    D1 = aliased(User)

    stmt = (
        select(
            Assignment,
            N0.name.label("n0_name"),
            N1.name.label("n1_name"),
            D0.name.label("d0_name"),
            D1.name.label("d1_name"),
        )
        .outerjoin(N0, Assignment.night_slot_0 == N0.id)
        .outerjoin(N1, Assignment.night_slot_1 == N1.id)
        .outerjoin(D0, Assignment.day_slot_0 == D0.id)
        .outerjoin(D1, Assignment.day_slot_1 == D1.id)
        .where(Assignment.calendar_month_id == calendar_month_id)
        .order_by(Assignment.date)
    )
    rows = (await db.execute(stmt)).all()

    return [
        DaySchedule(
            date=row.Assignment.date.isoformat(),
            weekday_label=row.Assignment.weekday_label,
            weekend=row.Assignment.weekend,
            night=(row.n0_name, row.n1_name),
            day=(row.d0_name, row.d1_name),
            night_ids=(
                str(row.Assignment.night_slot_0) if row.Assignment.night_slot_0 else None,
                str(row.Assignment.night_slot_1) if row.Assignment.night_slot_1 else None,
            ),
            day_ids=(
                str(row.Assignment.day_slot_0) if row.Assignment.day_slot_0 else None,
                str(row.Assignment.day_slot_1) if row.Assignment.day_slot_1 else None,
            ),
        )
        for row in rows
    ]


async def _save_assignments(
    db: AsyncSession,
    calendar_month_id: uuid.UUID,
    team_id: uuid.UUID,
    schedules: list[DaySchedule],
) -> None:
    await db.execute(delete(Assignment).where(Assignment.calendar_month_id == calendar_month_id))
    for row in schedules:
        db.add(Assignment(
            calendar_month_id=calendar_month_id,
            date=date.fromisoformat(row.date),
            weekday_label=row.weekday_label,
            weekend=row.weekend,
            night_slot_0=uuid.UUID(row.night_ids[0]) if row.night_ids[0] else None,
            night_slot_1=uuid.UUID(row.night_ids[1]) if row.night_ids[1] else None,
            day_slot_0=uuid.UUID(row.day_ids[0]) if row.day_ids[0] else None,
            day_slot_1=uuid.UUID(row.day_ids[1]) if row.day_ids[1] else None,
        ))


async def _upsert_assignment(
    db: AsyncSession,
    calendar_month_id: uuid.UUID,
    team_id: uuid.UUID,
    row: DaySchedule,
    user_by_id: dict[str, uuid.UUID],
) -> None:
    existing = (
        await db.execute(
            select(Assignment).where(
                and_(
                    Assignment.calendar_month_id == calendar_month_id,
                    Assignment.date == date.fromisoformat(row.date),
                )
            )
        )
    ).scalar_one_or_none()

    n0 = uuid.UUID(row.night_ids[0]) if row.night_ids[0] else None
    n1 = uuid.UUID(row.night_ids[1]) if row.night_ids[1] else None
    d0 = uuid.UUID(row.day_ids[0]) if row.day_ids[0] else None
    d1 = uuid.UUID(row.day_ids[1]) if row.day_ids[1] else None

    if existing:
        existing.night_slot_0 = n0
        existing.night_slot_1 = n1
        existing.day_slot_0 = d0
        existing.day_slot_1 = d1
    else:
        db.add(Assignment(
            calendar_month_id=calendar_month_id,
            date=date.fromisoformat(row.date),
            weekday_label=row.weekday_label,
            weekend=row.weekend,
            night_slot_0=n0,
            night_slot_1=n1,
            day_slot_0=d0,
            day_slot_1=d1,
        ))


async def _user_map(db: AsyncSession, team_id: uuid.UUID) -> dict[str, uuid.UUID]:
    from app.models import Membership
    rows = (
        await db.execute(
            select(User.id, User.name)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.team_id == team_id)
        )
    ).all()
    return {str(row.id): row.id for row in rows}


async def _load_swap_with_names(
    db: AsyncSession, swap_id: uuid.UUID, calendar_month_id: uuid.UUID
) -> tuple[SwapRequest, str, str]:
    Requester = aliased(User)
    Requestee = aliased(User)
    row = (
        await db.execute(
            select(SwapRequest, Requester.name.label("req_name"), Requestee.name.label("ree_name"))
            .join(Requester, SwapRequest.requester_id == Requester.id)
            .join(Requestee, SwapRequest.requestee_id == Requestee.id)
            .where(and_(SwapRequest.id == swap_id, SwapRequest.calendar_month_id == calendar_month_id))
        )
    ).first()
    if not row:
        raise ValueError("Swap request not found")
    return row.SwapRequest, row.req_name, row.ree_name


def _validate_entries(entries: list[dict], month_id_str: str) -> None:
    import re
    seen: set[str] = set()
    for entry in entries:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["date"]):
            raise ValueError(f"Invalid date: {entry['date']}")
        allowed = selectable_shifts(entry["date"])
        if entry["shiftType"] not in allowed:
            raise ValueError(f"Shift {entry['shiftType']} is not allowed for {entry['date']}")
        if entry["date"] in seen:
            raise ValueError(f"Only one shift can be selected per day: {entry['date']}")
        seen.add(entry["date"])


def _validate_edited_assignments(
    slots: list[dict],
    availabilities: list[MemberAvailability],
    team_members: list[TeamMember],
) -> None:
    member_by_id = {m.user_id: m for m in team_members}
    avail_by_shift: dict[str, set[str]] = {}
    for a in availabilities:
        for e in a.entries:
            avail_by_shift.setdefault(f"{e.date}:{e.shift_type}", set()).add(a.member_id)

    assignments_by_member: dict[str, set[str]] = {}
    count_by_member: dict[str, int] = {}

    def validate_slot(member_id: str | None, d: str, shift_type: str) -> None:
        if not member_id:
            return
        m = member_by_id.get(member_id)
        if not m:
            raise ValueError(f"Unknown member selected for {d} {shift_type}")
        if not m.active:
            raise ValueError(f"{m.name} is inactive and cannot be assigned")
        available = avail_by_shift.get(f"{d}:{shift_type}", set())
        if member_id not in available:
            raise ValueError(f"{m.name} did not submit availability for {d} {shift_type}")
        assigned = assignments_by_member.get(member_id, set())
        if f"{d}:night" in assigned or f"{d}:day" in assigned:
            raise ValueError(f"{m.name} cannot be assigned twice on {d}")
        prev = (date.fromisoformat(d) - timedelta(days=1)).isoformat()
        if shift_type == "day" and f"{prev}:night" in assigned:
            raise ValueError(f"{m.name} cannot work a day shift on {d} after a night shift the previous day")
        next_count = count_by_member.get(member_id, 0) + 1
        if m.max_shifts is not None and next_count > m.max_shifts:
            raise ValueError(f"{m.name} exceeds their max shifts")
        assignments_by_member.setdefault(member_id, set()).add(f"{d}:{shift_type}")
        count_by_member[member_id] = next_count

    for slot in sorted(slots, key=lambda s: s["date"]):
        n0, n1 = slot["night"]
        d0, d1 = slot["day"]
        validate_slot(n0, slot["date"], "night")
        validate_slot(n1, slot["date"], "night")
        if slot["weekend"]:
            validate_slot(d0, slot["date"], "day")
            validate_slot(d1, slot["date"], "day")


# ---------------------------------------------------------------------------
# Schema conversion helpers
# ---------------------------------------------------------------------------

def _month_to_schema(m: CalendarMonth) -> MonthDocSchema:
    return MonthDocSchema(
        teamId=str(m.team_id),
        monthId=m.month_id,
        orgName=m.org_name,
        timezone=m.timezone,
        intakeLimitPerShift=m.intake_limit_per_shift,
        deadlineAt=_dt_to_ms(m.deadline_at),
        status=m.status,
        createdAt=_dt_to_ms(m.created_at),
        updatedAt=_dt_to_ms(m.updated_at),
    )


def _day_overview_to_schema(d) -> DayOverviewSchema:
    return DayOverviewSchema(
        date=d.date,
        weekdayLabel=d.weekday_label,
        weekend=d.weekend,
        shifts=[
            ShiftOverviewSchema(
                shiftType=s.shift_type,
                capacity=s.capacity,
                candidateIds=s.candidate_ids,
                candidateNames=s.candidate_names,
                isFull=s.is_full,
            )
            for s in d.shifts
        ],
    )


def _availability_to_schema(a: MemberAvailability) -> MemberAvailabilitySchema:
    return MemberAvailabilitySchema(
        memberId=a.member_id,
        name=a.name,
        email=a.email,
        entries=[AvailabilityEntrySchema(date=e.date, shiftType=e.shift_type) for e in a.entries],
        createdAt=a.created_at,
        updatedAt=a.updated_at,
    )


def _day_schedule_to_schema(a: DaySchedule) -> DayScheduleSchema:
    return DayScheduleSchema(
        date=a.date,
        weekdayLabel=a.weekday_label,
        weekend=a.weekend,
        night=a.night,
        day=a.day,
        nightIds=a.night_ids,
        dayIds=a.day_ids,
    )


def _swap_to_schema(
    swap: SwapRequest, req_name: str, ree_name: str, month_id_str: str, team_id_str: str
) -> ShiftSwapRequestSchema:
    return ShiftSwapRequestSchema(
        swapId=str(swap.id),
        teamId=team_id_str,
        monthId=month_id_str,
        status=swap.status,
        requesterId=str(swap.requester_id),
        requesterName=req_name,
        requesteeId=str(swap.requestee_id),
        requesteeName=ree_name,
        requesterShift=ShiftSlotRefSchema(
            date=swap.requester_date.isoformat(),
            shiftType=swap.requester_shift_type,
            slot=swap.requester_slot,
        ),
        requesteeShift=ShiftSlotRefSchema(
            date=swap.requestee_date.isoformat(),
            shiftType=swap.requestee_shift_type,
            slot=swap.requestee_slot,
        ),
        createdAt=_dt_to_ms(swap.created_at),
        updatedAt=_dt_to_ms(swap.updated_at),
    )
