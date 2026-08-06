from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class InstructorLlmConnection(Base):
    __tablename__ = "instructor_llm_connections"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    provider_id: Mapped[str] = mapped_column(String, primary_key=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # never store the raw key — always Fernet-encrypted before insert
    # (same CANVAS_TOKEN_ENCRYPTION_KEY / _fernet() as canvas_connections)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped[User] = relationship("User", back_populates="llm_connections")
