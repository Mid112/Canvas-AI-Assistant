from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.course import Course


class Student(Base):
    __tablename__ = "students"
    # One enrollment record per (Canvas user, course) — a re-enrolled student updates
    # enrollment_state on the existing row rather than creating a duplicate
    __table_args__ = (UniqueConstraint("canvas_user_id", "course_id", name="uq_student_per_course"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canvas_user_id: Mapped[str] = mapped_column(String, nullable=False)

    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)
    sortable_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # login_id is the institution-issued identifier (typically email); may be absent
    # when the Canvas instance restricts personal info visibility
    login_id: Mapped[str | None] = mapped_column(String, nullable=True)
    enrollment_state: Mapped[str] = mapped_column(String, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    course: Mapped[Course] = relationship("Course", back_populates="students")
