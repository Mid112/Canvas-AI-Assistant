from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AiCallHealth(Base):
    """One row per user, holding only the outcome of their most recent
    observed AI call (message-draft / assignment-draft generation) — not a
    log/history table. Backs the admin System Health page's per-instructor
    AI usage summary (Feature 9 Phase 2). Written passively wherever a real
    generate() call already happens (services/messages.py,
    services/assignment_draft.py); never triggers an AI call on its own."""

    __tablename__ = "ai_call_health"
    __table_args__ = (
        CheckConstraint("status IN ('ok', 'failed')", name="ck_ai_call_health_status"),
    )

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_called_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
