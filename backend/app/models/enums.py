import enum


class MembershipRole(str, enum.Enum):
    org_admin = "org_admin"
    team_admin = "team_admin"
    team_member = "team_member"


class InvitationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"
    revoked = "revoked"


class MonthStatus(str, enum.Enum):
    draft = "draft"
    open = "open"
    closed = "closed"
    scheduled = "scheduled"
    archived = "archived"


class ShiftType(str, enum.Enum):
    night = "night"
    day = "day"


class SwapStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    cancelled = "cancelled"
