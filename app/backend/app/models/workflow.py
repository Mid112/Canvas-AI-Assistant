from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.core.database import Base



class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FKs — workflow belongs to both a conversation and a user
    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # What the user asked the AI to do e.g. "send missing submission reminder"
    intent: Mapped[str] = mapped_column(String, nullable=False)

    # The AI-generated Canvas API query — stored as JSONB for fast querying
    generated_query: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Preview of what the workflow would do before the user approves it
    preview_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # pending / approved / rejected — matches CHECK constraint in schema
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="workflows"
    )
    user: Mapped["User"] = relationship("User", back_populates="workflows")
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="workflow"
    )