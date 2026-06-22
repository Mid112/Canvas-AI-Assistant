from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.conversation import Conversation
    from app.models.user import User


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    intent: Mapped[str] = mapped_column(String, nullable=False)
    generated_query: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    preview_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    conversation: Mapped[Conversation] = relationship(
        "Conversation", back_populates="workflows"
    )
    user: Mapped[User] = relationship("User", back_populates="workflows")
    audit_logs: Mapped[list[AuditLog]] = relationship(
        "AuditLog", back_populates="workflow"
    )
