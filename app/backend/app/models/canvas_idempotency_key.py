from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CanvasIdempotencyKey(Base):
    """Caches a successful Canvas write response under a client/workflow key
    so retries after success return the same payload instead of mutating twice
    (Feature Reliability #1189).

    Rows start as ``pending`` (reserve-first claim before the Canvas call) and
    move to ``completed`` once ``response_json`` is stored. Completed rows are
    retained for ``IDEMPOTENCY_RETENTION`` then pruned; abandoned pending claims
    expire after ``PENDING_CLAIM_TTL``.
    """

    __tablename__ = "canvas_idempotency_keys"

    idempotency_key: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation: Mapped[str] = mapped_column(String, nullable=False)
    response_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="completed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
