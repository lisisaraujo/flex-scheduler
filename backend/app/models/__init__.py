"""SQLAlchemy models. Import every module here so Alembic's autogenerate sees all tables."""

from app.models.base import Base
from app.models.auth import Invitation, Membership, OrgMembership, Organization, Team, User
from app.models.licensing import ApiKey, ApiUsageEvent
from app.models.scheduling import Assignment, Availability, AvailabilityEntry, CalendarMonth, SwapRequest

__all__ = [
    "Base",
    "Organization",
    "OrgMembership",
    "Team",
    "User",
    "Membership",
    "Invitation",
    "CalendarMonth",
    "Availability",
    "AvailabilityEntry",
    "Assignment",
    "SwapRequest",
    "ApiKey",
    "ApiUsageEvent",
]
