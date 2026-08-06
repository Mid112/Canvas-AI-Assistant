"""Model note: defines persisted support ticket data and relationships shared by services, routers, migrations, and tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.failed_operation import FailedOperation
    from app.models.user import User


class SupportTicket(Base):
    """Admin-side escalation tracking for a FailedOperation row (Feature 12,
    Secure Troubleshooting). One ticket per failed_operation — escalating the
    same failure twice returns the existing ticket rather than creating a
    duplicate (see services/support_tickets.py::create_ticket). Read-only /
    escalate-only: no retry/re-trigger action exists yet, pending the team's
    risk framework for Canvas writes."""

    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'investigating', 'resolved')",
            name="ck_support_tickets_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    failed_operation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("failed_operations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Denormalized from the failed operation at creation time so the ticket
    # list can display the affected user without an extra join.
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String, nullable=False, default="open", index=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    resolved_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Who currently owns resolving this ticket -- distinct from resolved_by
    # (set only once the ticket is actually marked resolved). Nullable: a
    # freshly-escalated ticket starts unclaimed.
    assigned_to: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    failed_operation: Mapped[FailedOperation] = relationship("FailedOperation")
    user: Mapped[User | None] = relationship("User", foreign_keys=[user_id])
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    resolver: Mapped[User | None] = relationship("User", foreign_keys=[resolved_by])
    assignee: Mapped[User | None] = relationship("User", foreign_keys=[assigned_to])
