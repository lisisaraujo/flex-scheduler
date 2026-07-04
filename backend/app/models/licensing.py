import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class ApiKey(Base, UUIDPrimaryKeyMixin):
    """An external integration partner's credential for the licensee-facing API.

    Only the hash is stored — the raw key is shown to the partner once, at creation time.
    """

    __tablename__ = "api_keys"

    client_name: Mapped[str] = mapped_column(String, nullable=False)
    key_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    usage_events: Mapped[list["ApiUsageEvent"]] = relationship(back_populates="api_key")


class ApiUsageEvent(Base):
    """Append-only request ledger — feeds rate limiting and royalty/usage reporting."""

    __tablename__ = "api_usage_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    api_key_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=False)
    endpoint: Mapped[str] = mapped_column(String, nullable=False)
    status_code: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    api_key: Mapped["ApiKey"] = relationship(back_populates="usage_events")
