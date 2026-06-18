from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.canvas_connection import CanvasConnection
    from app.models.course import Course
    from app.models.conversation import Conversation
    from app.models.workflow import Workflow
    from app.models.audit_log import AuditLog
    from app.models.message_template import MessageTemplate
    from app.models.session import Session


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Nullable — admin accounts have no Canvas login
    canvas_user_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)

    # instructor / ta / admin — enforced by CHECK in SQL schema
    role: Mapped[str] = mapped_column(String, nullable=False, default="instructor")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    canvas_connections: Mapped[list["CanvasConnection"]] = relationship(
        "CanvasConnection", back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )
    courses: Mapped[list["Course"]] = relationship(
        "Course", back_populates="instructor"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation", back_populates="user", cascade="all, delete-orphan"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="user"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user"
    )
    message_templates: Mapped[list["MessageTemplate"]] = relationship(
        "MessageTemplate", back_populates="user", cascade="all, delete-orphan"
    )