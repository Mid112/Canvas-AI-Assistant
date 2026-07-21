from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HealthCheck(Base):
    """One row per service per GET /admin/health run (backend/database/canvas/ai).
    Pure audit trail for the system-health dashboard's "Verify monitoring"
    requirement — the dashboard itself only ever reads the latest run, this
    table is not used to render any history/trend UI."""

    __tablename__ = "health_checks"
    __table_args__ = (
        CheckConstraint(
            "service IN ('backend', 'database', 'canvas', 'ai')",
            name="ck_health_checks_service",
        ),
        CheckConstraint(
            "status IN ('healthy', 'degraded', 'down')",
            name="ck_health_checks_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    service: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
    )
