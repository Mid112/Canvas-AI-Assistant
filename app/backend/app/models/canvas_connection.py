"""Model note: defines persisted canvas connection data and relationships shared by services, routers, migrations, and tests."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class CanvasConnection(Base):
    __tablename__ = "canvas_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # CASCADE so connections are cleaned up automatically when the user is deleted
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    canvas_url: Mapped[str] = mapped_column(String, nullable=False)
    # never store the raw token — always Fernet-encrypted before insert
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    # Last time services/canvas.py's sync_courses_if_stale actually hit
    # Canvas for this connection's course list (not just checked the
    # cooldown) — null until the first sync ever runs.
    courses_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set by run_course_sync_sweep (services/canvas.py) whenever the
    # periodic sync fails for this connection (bad/expired token, Canvas
    # outage) — cleared back to null the next time it succeeds. Backs the
    # admin System Health page's per-instructor Canvas connectivity summary
    # (Feature 9 Phase 2) at zero extra Canvas calls, since the sweep
    # already hits every connection on its own ~60s cadence regardless.
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # IANA timezone from Canvas /users/self (e.g. America/Vancouver).
    time_zone: Mapped[str | None] = mapped_column(String, nullable=True)

    # one token per user per school — prevents duplicate rows for the same Canvas URL
    __table_args__ = (UniqueConstraint("user_id", "canvas_url", name="uq_user_canvas_url"),)

    user: Mapped["User"] = relationship("User", back_populates="canvas_connections")
