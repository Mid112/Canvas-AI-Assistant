from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.message import Message
    from app.models.user import User
    from app.models.workflow import Workflow


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # The course this conversation session is scoped to. Set once (either
    # at creation or on this conversation's first course resolution) and
    # never mutated after — a subject switch mid-conversation routes to a
    # different Conversation row instead (see services/chat.py
    # _find_or_fork_conversation_for_course), so every message in a given
    # conversation is always about this one course.
    # Distinct from user_preferences.active_course_id (which is the UI selection state).
    course_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    # Denormalized snapshot of course.name at the time course_id was set,
    # kept so the chat pipeline can build LLM prompts and API responses
    # without an extra join/lazy-load in an async context.
    course_name: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    user: Mapped[User] = relationship("User", back_populates="conversations")
    course: Mapped[Course | None] = relationship("Course")
    messages: Mapped[list[Message]] = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.id",
    )
    workflows: Mapped[list[Workflow]] = relationship("Workflow", back_populates="conversation", cascade="all, delete-orphan")
