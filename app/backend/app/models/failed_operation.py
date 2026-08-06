"""Model note: defines persisted failed operation data and relationships shared by services, routers, migrations, and tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.course import Course
    from app.models.tool_call_log import ToolCallLog
    from app.models.user import User
    from app.models.workflow import Workflow


class FailedOperation(Base):
    """Append-only log of Canvas and AI failures for the admin Failed
    Operations dashboard (Feature 11, UR1.6). Written passively wherever
    an instrumented call site already handles the error — never triggers
    a call on its own."""

    __tablename__ = "failed_operations"
    __table_args__ = (
        CheckConstraint("source IN ('canvas', 'ai')", name="ck_failed_operations_source"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    source: Mapped[str] = mapped_column(String, nullable=False)
    operation: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    conversation_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    workflow_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True
    )
    tool_call_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tool_call_logs.id", ondelete="SET NULL"), nullable=True
    )

    provider: Mapped[str | None] = mapped_column(String, nullable=True)
    error_detail: Mapped[str] = mapped_column(Text, nullable=False)
    context_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Plain-language description generated at write time by
    # summarize_failure() — the admin dashboard's default view, so raw
    # error_detail/context_json never render without the explicit,
    # access-logged "view detail" action (see routers/failed_operations.py).
    human_summary: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
    )

    user: Mapped[User | None] = relationship("User")
    course: Mapped[Course | None] = relationship("Course")
    conversation: Mapped[Conversation | None] = relationship("Conversation")
    workflow: Mapped[Workflow | None] = relationship("Workflow")
    tool_call: Mapped[ToolCallLog | None] = relationship("ToolCallLog")
