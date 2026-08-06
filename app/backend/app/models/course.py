"""Model note: defines persisted course data and relationships shared by services, routers, migrations, and tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.student import Student
    from app.models.user import User


class Course(Base):
    __tablename__ = "courses"
    # Composite unique: same Canvas course ID can exist once per instructor per
    # Canvas instance (co-instructors allowed; multi-institution instructors
    # keep separate rows when numeric IDs collide across hosts).
    __table_args__ = (
        UniqueConstraint(
            "canvas_course_id",
            "instructor_id",
            "canvas_url",
            name="uq_course_per_instructor",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canvas_course_id: Mapped[str] = mapped_column(String, nullable=False)
    # Which Canvas instance this course belongs to — needed to fetch assignments/submissions
    canvas_url: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    term: Mapped[str | None] = mapped_column(String, nullable=True)
    # Canvas's course state (e.g. "available", "unpublished", "completed") — persisted
    # so set_active_course can reject non-selectable courses without a live Canvas call.
    workflow_state: Mapped[str] = mapped_column(String, nullable=False, default="available", server_default="available")
    # Canvas's course_code (e.g. "COSC 111") and enrollment count — cached locally
    # so get_cached_courses() can render a full course card without a live Canvas call.
    course_code: Mapped[str | None] = mapped_column(String, nullable=True)
    total_students: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # When this row was last written from a real Canvas response (get_courses()).
    # NULL for rows that predate this column and were never re-synced — lets
    # set_active_course distinguish "we've verified this state against Canvas"
    # from "this is just the migration's backfilled default."
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    instructor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    instructor: Mapped[User] = relationship("User", back_populates="courses")
    assignments: Mapped[list[Assignment]] = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    students: Mapped[list[Student]] = relationship("Student", back_populates="course", cascade="all, delete-orphan")
