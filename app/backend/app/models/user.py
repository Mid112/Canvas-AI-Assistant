from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Back-references — needed so SQLAlchemy can resolve
    # relationships defined in the other model files above.
    # These let you do user.courses, user.workflows etc.
    courses: Mapped[list["Course"]] = relationship(
        "Course", back_populates="instructor"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation", back_populates="user"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="user"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user"
    )
    message_templates: Mapped[list["MessageTemplate"]] = relationship(
        "MessageTemplate", back_populates="user"
    )