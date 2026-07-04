import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import DbSession, get_current_user, require_team_admin, require_team_context
from app.models.enums import MembershipRole
from app.repositories.auth_repository import list_members_for_team
from app.repositories.scheduling_repository import (
    cancel_swap_request,
    create_month,
    create_swap_request,
    delete_month,
    generate_month_schedule,
    get_month_snapshot,
    list_months,
    list_swaps_for_user,
    respond_to_swap_request,
    update_availability,
    update_month_assignments,
    update_month_settings,
)
from app.schemas.auth import SessionUser
from app.schemas.scheduling import (
    CreateMonthBody,
    CreateSwapBody,
    RespondSwapBody,
    UpdateAssignmentsBody,
    UpdateAvailabilityBody,
    UpdateMonthSettingsBody,
)
from app.services.mailer import send_swap_request_email, send_swap_response_email

router = APIRouter(prefix="/api/v1/months", tags=["months"])


def _err(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if msg == "Forbidden":
        return HTTPException(403, msg)
    return HTTPException(400, msg)


# ---------------------------------------------------------------------------
# Month CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_all_months(
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    months = await list_months(db, uuid.UUID(user.teamId))
    return {"ok": True, "months": [m.model_dump() for m in months]}


@router.post("")
async def create(
    body: CreateMonthBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        month = await create_month(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id=body.monthId,
            org_name=body.orgName,
            timezone_str=body.timezone,
            deadline_at_ms=body.deadlineAt,
            intake_limit_per_shift=body.intakeLimitPerShift,
        )
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True, "month": month.model_dump()}


@router.get("/{month_id}")
async def get_snapshot(
    month_id: str,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    try:
        snapshot = await get_month_snapshot(db, uuid.UUID(user.teamId), month_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {"ok": True, **snapshot.model_dump()}


@router.delete("/{month_id}")
async def delete(
    month_id: str,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        await delete_month(db, uuid.UUID(user.teamId), month_id)
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True}


@router.patch("/{month_id}/settings")
async def update_settings(
    month_id: str,
    body: UpdateMonthSettingsBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        await update_month_settings(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            deadline_at_ms=body.deadlineAt,
            intake_limit_per_shift=body.intakeLimitPerShift,
            status=body.status,
        )
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

@router.post("/{month_id}/availability")
async def submit_availability(
    month_id: str,
    body: UpdateAvailabilityBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    if user.role in (MembershipRole.team_admin, MembershipRole.org_admin):
        raise HTTPException(403, "Admins can view the calendar but cannot submit availability.")
    try:
        member_id = await update_availability(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            member_id=uuid.UUID(user.userId),
            member_name=user.name,
            member_email=user.email,
            entries=[{"date": e.date, "shiftType": e.shiftType} for e in body.entries],
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, "memberId": member_id}


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

@router.post("/{month_id}/schedule")
async def generate_schedule(
    month_id: str,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        assignments = await generate_month_schedule(db, uuid.UUID(user.teamId), month_id)
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True, "assignments": [a.model_dump() for a in assignments]}


@router.patch("/{month_id}/schedule")
async def update_schedule(
    month_id: str,
    body: UpdateAssignmentsBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_admin())],
):
    try:
        assignments = await update_month_assignments(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            assignment_slots=[
                {
                    "date": a.date,
                    "weekend": a.weekend,
                    "night": a.night,
                    "day": a.day,
                }
                for a in body.assignments
            ],
        )
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True, "assignments": [a.model_dump() for a in assignments]}


# ---------------------------------------------------------------------------
# Swaps
# ---------------------------------------------------------------------------

@router.get("/{month_id}/swaps")
async def list_swaps(
    month_id: str,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    try:
        swaps = await list_swaps_for_user(
            db, uuid.UUID(user.teamId), month_id, uuid.UUID(user.userId)
        )
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True, "swaps": [s.model_dump() for s in swaps]}


@router.post("/{month_id}/swaps")
async def create_swap(
    month_id: str,
    body: CreateSwapBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    if user.role in (MembershipRole.team_admin, MembershipRole.org_admin):
        raise HTTPException(403, "Admins do not hold shifts and cannot request swaps.")
    try:
        swap = await create_swap_request(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            requester_id=uuid.UUID(user.userId),
            requestee_id=uuid.UUID(body.requesteeId),
            requester_shift=body.requesterShift,
            requestee_shift=body.requesteeShift,
        )
    except ValueError as exc:
        raise _err(exc)

    members = await list_members_for_team(db, uuid.UUID(user.teamId))
    requestee = next((m for m in members if m.userId == body.requesteeId), None)
    if requestee:
        await send_swap_request_email(
            swap_id=swap.swapId,
            month_id=month_id,
            requester_name=user.name,
            requestee_email=requestee.email,
            requester_shift_date=body.requesterShift.date,
            requester_shift_type=body.requesterShift.shiftType,
            requestee_shift_date=body.requesteeShift.date,
            requestee_shift_type=body.requesteeShift.shiftType,
        )

    return {"ok": True, "swap": swap.model_dump()}


@router.post("/{month_id}/swaps/{swap_id}/cancel")
async def cancel_swap(
    month_id: str,
    swap_id: str,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    try:
        swap = await cancel_swap_request(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            swap_id=uuid.UUID(swap_id),
            requester_id=uuid.UUID(user.userId),
        )
    except ValueError as exc:
        raise _err(exc)
    return {"ok": True, "swap": swap.model_dump()}


@router.post("/{month_id}/swaps/{swap_id}/respond")
async def respond_swap(
    month_id: str,
    swap_id: str,
    body: RespondSwapBody,
    db: DbSession,
    user: Annotated[SessionUser, Depends(require_team_context())],
):
    try:
        swap = await respond_to_swap_request(
            db,
            team_id=uuid.UUID(user.teamId),
            month_id_str=month_id,
            swap_id=uuid.UUID(swap_id),
            requestee_id=uuid.UUID(user.userId),
            accept=body.accept,
        )
    except ValueError as exc:
        raise _err(exc)

    members = await list_members_for_team(db, uuid.UUID(user.teamId))
    requester = next((m for m in members if m.userId == swap.requesterId), None)
    if requester:
        await send_swap_response_email(
            month_id=month_id,
            requestee_name=user.name,
            requester_email=requester.email,
            accepted=body.accept,
            requester_shift_date=swap.requesterShift.date,
            requester_shift_type=swap.requesterShift.shiftType,
            requestee_shift_date=swap.requesteeShift.date,
            requestee_shift_type=swap.requesteeShift.shiftType,
        )

    return {"ok": True, "swap": swap.model_dump()}
