import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MonthStatus, ShiftType, SwapStatus


class CalendarMonth(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "calendar_months"
    __table_args__ = (UniqueConstraint("team_id", "month_id", name="uq_calendar_month_team_month"),)

    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    month_id: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "2026-06"
    org_name: Mapped[str] = mapped_column(String, nullable=False)
    timezone: Mapped[str] = mapped_column(String, nullable=False)
    intake_limit_per_shift: Mapped[int] = mapped_column(Integer, nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[MonthStatus] = mapped_column(Enum(MonthStatus, name="month_status"), nullable=False, default=MonthStatus.draft)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    availabilities: Mapped[list["Availability"]] = relationship(back_populates="calendar_month")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="calendar_month")
    swap_requests: Mapped[list["SwapRequest"]] = relationship(back_populates="calendar_month")


class Availability(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "availabilities"
    __table_args__ = (UniqueConstraint("calendar_month_id", "member_id", name="uq_availability_month_member"),)

    calendar_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_months.id"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    calendar_month: Mapped["CalendarMonth"] = relationship(back_populates="availabilities")
    entries: Mapped[list["AvailabilityEntry"]] = relationship(back_populates="availability", cascade="all, delete-orphan")


class AvailabilityEntry(Base):
    __tablename__ = "availability_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    availability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("availabilities.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_type: Mapped[ShiftType] = mapped_column(Enum(ShiftType, name="shift_type"), nullable=False)

    availability: Mapped["Availability"] = relationship(back_populates="entries")


class Assignment(Base, UUIDPrimaryKeyMixin):
    """One row per scheduled day. Each shift has two slots; an empty slot is NULL."""

    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("calendar_month_id", "date", name="uq_assignment_month_date"),)

    calendar_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_months.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    weekday_label: Mapped[str] = mapped_column(String, nullable=False)
    weekend: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    night_slot_0: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    night_slot_1: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    day_slot_0: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    day_slot_1: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    calendar_month: Mapped["CalendarMonth"] = relationship(back_populates="assignments")


class SwapRequest(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "swap_requests"

    calendar_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_months.id"), nullable=False
    )
    status: Mapped[SwapStatus] = mapped_column(Enum(SwapStatus, name="swap_status"), nullable=False, default=SwapStatus.pending)

    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    requestee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    requester_date: Mapped[date] = mapped_column(Date, nullable=False)
    requester_shift_type: Mapped[ShiftType] = mapped_column(Enum(ShiftType, name="shift_type"), nullable=False)
    requester_slot: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    requestee_date: Mapped[date] = mapped_column(Date, nullable=False)
    requestee_shift_type: Mapped[ShiftType] = mapped_column(Enum(ShiftType, name="shift_type"), nullable=False)
    requestee_slot: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    calendar_month: Mapped["CalendarMonth"] = relationship(back_populates="swap_requests")
