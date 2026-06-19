from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.user import User


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canvas_course_id: Mapped[str] = mapped_column(
        String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    term: Mapped[str | None] = mapped_column(String, nullable=True)

    instructor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    instructor: Mapped[User] = relationship("User", back_populates="courses")
    assignments: Mapped[list[Assignment]] = relationship(
        "Assignment", back_populates="course", cascade="all, delete-orphan"
    )
