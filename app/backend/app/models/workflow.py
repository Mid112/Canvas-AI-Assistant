from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.conversation import Conversation
    from app.models.course import Course
    from app.models.user import User


class Workflow(Base):
    """Tracks the lifecycle of a single LLM-proposed action, from preview
    through confirmation/cancellation. `messages` remains the chat
    transcript; this table is the action-lifecycle state machine that
    `handle_confirmed_action` uses to guarantee an action executes at
    most once, no matter how many times its pending_message_id is
    replayed."""

    __tablename__ = "workflows"

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

    # The user message that originally started this preview chain — stays
    # pinned across any number of "modify" revisions, so it always answers
    # "what did the user originally ask for" even after the proposed_action
    # itself has changed several times.
    source_user_message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    # The assistant message holding the current intent_preview. Unique —
    # this is the join key handle_confirmed_action looks the workflow up by.
    preview_message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    result_message_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )

    action_name: Mapped[str] = mapped_column(String, nullable=False)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_action: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # pending -> executing -> executed | failed
    #         -> cancelled | superseded
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    conversation: Mapped[Conversation] = relationship("Conversation", back_populates="workflows")
    user: Mapped[User] = relationship("User", back_populates="workflows")
    course: Mapped[Course | None] = relationship("Course")
    audit_logs: Mapped[list[AuditLog]] = relationship("AuditLog", back_populates="workflow")
