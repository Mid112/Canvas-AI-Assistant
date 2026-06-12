from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base



class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canvas_submission_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    # FK to the assignment this submission belongs to
    assignment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assignments.id"), nullable=False
    )

    # Canvas student ID — we don't store students as users in our system
    student_canvas_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    student_name: Mapped[str | None] = mapped_column(String, nullable=True)

    # missing / late / submitted — matches CHECK constraint in schema
    status: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationship
    assignment: Mapped["Assignment"] = relationship(
        "Assignment", back_populates="submissions"
    )