from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK to the user who triggered the action — never deleted
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # Optional FK — not every audit log relates to a workflow
    workflow_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("workflows.id"), nullable=True
    )

    # What happened e.g. "create_assignment", "send_message", "login"
    action: Mapped[str] = mapped_column(String, nullable=False)

    # Any extra context about the action — flexible JSONB field
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Named timestamp (not created_at) to match schema exactly
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="audit_logs")
    workflow: Mapped["Workflow | None"] = relationship(
        "Workflow", back_populates="audit_logs"
    )