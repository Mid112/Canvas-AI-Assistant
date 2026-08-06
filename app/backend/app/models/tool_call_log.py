"""Model note: defines persisted tool call log data and relationships shared by services, routers, migrations, and tests."""

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
    from app.models.message import Message
    from app.models.user import User


class ToolCallLog(Base):
    """Tracks the pending/executing/executed/failed lifecycle of a single
    Canvas-reading call (fetch_courses, fetch_assignments, fetch_students,
    fetch_submissions), including internal sub-calls the app makes on the
    user's behalf without a separate turn (e.g. the fetch_assignments call
    inside fetch_submissions' assignment-resolution chain — see
    _run_fetch_submissions_chain in services/chat.py).

    Deliberately separate from Workflow: Workflow exists for the
    preview -> confirm replay-safety state machine (its preview_message_id
    is tied 1:1 to a specific assistant message the user reviews and acts
    on). Reads now execute immediately with no review step, and an internal
    sub-call in a chain never produces any assistant message of its own at
    all — neither fits Workflow's message-FK-shaped schema. This table is
    a plain call log with no confirm semantics."""

    __tablename__ = "tool_call_logs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'executing', 'executed', 'failed')",
            name="ck_tool_call_logs_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The user message whose turn produced this call. A fetch_submissions
    # chain's internal fetch_assignments call and its final fetch_submissions
    # call share the same triggering_message_id, grouping a chain's rows.
    triggering_message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )

    action_name: Mapped[str] = mapped_column(String, nullable=False)
    # The actual resolved action dict executed, e.g.
    # {"action": "fetch_assignments", "local_course_id": 42}.
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False)

    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    conversation: Mapped[Conversation] = relationship("Conversation")
    user: Mapped[User] = relationship("User")
    course: Mapped[Course | None] = relationship("Course")
    triggering_message: Mapped[Message] = relationship("Message")
