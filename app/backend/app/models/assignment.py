from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.submission import Submission


class Assignment(Base):
    __tablename__ = "assignments"
    # canvas_assignment_id is only unique WITHIN a course, not globally — two
    # co-instructors on the same real Canvas course get separate local Course
    # rows (courses is unique per (canvas_course_id, instructor_id), not
    # globally), so each needs its own Assignment row for the same Canvas
    # assignment ID.
    __table_args__ = (UniqueConstraint("canvas_assignment_id", "course_id", name="uq_assignment_per_course"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canvas_assignment_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)
    points_possible: Mapped[float | None] = mapped_column(Float, nullable=True)

    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    course: Mapped[Course] = relationship("Course", back_populates="assignments")
    submissions: Mapped[list[Submission]] = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")
