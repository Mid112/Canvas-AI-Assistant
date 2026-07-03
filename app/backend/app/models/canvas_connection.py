from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class CanvasConnection(Base):
    __tablename__ = "canvas_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # CASCADE so connections are cleaned up automatically when the user is deleted
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    canvas_url: Mapped[str] = mapped_column(String, nullable=False)
    # never store the raw token — always Fernet-encrypted before insert
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # one token per user per school — prevents duplicate rows for the same Canvas URL
    __table_args__ = (UniqueConstraint("user_id", "canvas_url", name="uq_user_canvas_url"),)

    user: Mapped["User"] = relationship("User", back_populates="canvas_connections")
