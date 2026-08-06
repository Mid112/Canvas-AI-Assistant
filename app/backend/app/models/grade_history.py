"""Model note: defines persisted grade history data and relationships shared by services, routers, migrations, and tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.course import Course
    from app.models.student import Student
    from app.models.user import User


class GradeHistory(Base):
    __tablename__ = "grade_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_assignment_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignment_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    student_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    student_canvas_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    previous_grade: Mapped[str | None] = mapped_column(String, nullable=True)
    new_grade: Mapped[str] = mapped_column(String, nullable=False)
    previous_score: Mapped[float | None] = mapped_column(nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String, nullable=False, default="high")
    rollback_available: Mapped[bool] = mapped_column(default=True, nullable=False)
    canvas_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
    )

    user: Mapped[User] = relationship("User")
    course: Mapped[Course] = relationship("Course")
    assignment: Mapped[Assignment | None] = relationship("Assignment")
    student: Mapped[Student | None] = relationship("Student")
