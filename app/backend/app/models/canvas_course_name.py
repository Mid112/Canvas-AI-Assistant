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
    """A connection-scoped alias index of canvas_course_id -> observed names,
    used only by the chat/LLM course-resolution pathway
    (services/chat.py). Deliberately separate from Course:

    - Course is keyed on (canvas_course_id, instructor_id, canvas_url), so
      multi-institution collisions are already scoped by host there; this
      table is still keyed by canvas_connection_id instead — the
      connection's own PK, no token decryption needed.
    - Course.name and Course.course_code are the canonical prompt-facing
      values. This table accumulates historical aliases so names an
      instructor used earlier in a conversation can still resolve after a
      Canvas rename. last_seen_at identifies the alias observed by the
      most recent sync, but prompts still display Course.name.
    """

    __tablename__ = "canvas_course_names"
    __table_args__ = (
        UniqueConstraint(
            "canvas_connection_id",
            "canvas_course_id",
            "name",
            name="uq_connection_canvas_course_name",
        ),
    )

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
    # Canvas's own workflow_state at insert time ("available", "unpublished",
    # "completed") — lets _match_course_name (services/chat.py) narrow a
    # duplicate-name match (same course code across multiple terms) to the
    # still-active offering instead of giving up outright. Nullable: rows
    # written before this column existed have no value, treated as "not
    # known to be completed" rather than excluded.
    workflow_state: Mapped[str | None] = mapped_column(String, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    canvas_connection: Mapped[CanvasConnection] = relationship("CanvasConnection")
    course: Mapped[Course | None] = relationship("Course")
