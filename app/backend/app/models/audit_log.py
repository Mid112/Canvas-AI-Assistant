"""Model note: defines persisted audit log data and relationships shared by services, routers, migrations, and tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.user import User
    from app.models.workflow import Workflow


class AuditLog(Base):
    """Records an actual Canvas data mutation performed by a confirmed
    Workflow. Only written on success — a failed attempt isn't a mutation,
    and Workflow.status="failed"/error_detail already fully capture that
    case. before_data is only populated for update_assignment (see
    CanvasWriteResult.previous_data in services/canvas_status.py and its
    wiring in services/chat.py::handle_confirmed_action) — every other
    write action still leaves it null."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Required — every audit row must trace back to the workflow that
    # produced it. Note: this means deleting a conversation would cascade
    # through to its workflows and, from here, to its audit rows too —
    # backwards for a feature whose point is outliving what it describes.
    # No delete-conversation endpoint exists today, so this is dormant;
    # flagging for whoever builds one.
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )

    action: Mapped[str] = mapped_column(String, nullable=False)
    # Mirrors the DB CHECK constraint; grade updates audit Canvas submissions.
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String, nullable=True)
    operation: Mapped[str] = mapped_column(String, nullable=False)  # create | update
    # "failed" is reserved but unreachable this pass — rows are only
    # written after a successful execute_tool call.
    status: Mapped[str] = mapped_column(String, nullable=False, default="success")

    before_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
    )

    user: Mapped[User] = relationship("User", back_populates="audit_logs")
    workflow: Mapped[Workflow] = relationship("Workflow", back_populates="audit_logs")
    course: Mapped[Course | None] = relationship("Course")
