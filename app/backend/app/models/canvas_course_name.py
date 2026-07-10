from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.canvas_connection import CanvasConnection
    from app.models.course import Course


class CanvasCourseName(Base):
    """A small, connection-scoped, write-once index of canvas_course_id ->
    name, used only by the chat/LLM course-resolution pathway
    (services/chat.py). Deliberately separate from Course:

    - Course is keyed on (canvas_course_id, instructor_id) and has no
      notion of *which* Canvas connection a course came from, so an
      instructor connected to two institutions with colliding numeric
      canvas_course_ids can't be disambiguated there. This table is keyed
      by canvas_connection_id instead — the connection's own PK, no token
      decryption needed.
    - Course.name is overwritten in place on every sync (services/canvas.py
      get_courses), which is fine for the dashboard but wrong for an LLM
      mid-conversation: a rename on Canvas between turns would otherwise
      change what a conversation has been calling that course. Rows here
      are inserted once and never updated (see services/canvas.py
      sync_courses_if_stale).
    """

    __tablename__ = "canvas_course_names"
    __table_args__ = (UniqueConstraint("canvas_connection_id", "canvas_course_id", name="uq_connection_canvas_course"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    canvas_connection_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("canvas_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canvas_course_id: Mapped[str] = mapped_column(String, nullable=False)
    # Populated for free from the same Canvas fetch that upserts Course
    # (services/canvas.py get_courses) — lets the chat resolver go straight
    # from a matched name to something dispatcher.py can execute against
    # without an extra query.
    local_course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    canvas_connection: Mapped[CanvasConnection] = relationship("CanvasConnection")
    course: Mapped[Course | None] = relationship("Course")
