from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.course import Course
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
    assignment_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
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
