from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class ResolvedSet(Base):
    """A server-computed recipient set (e.g. "students missing submissions
    for assignment 4"), persisted so the LLM only ever sees a compact
    {count, sample, handle} summary — never the raw per-student list — and
    a later turn (e.g. send_message's recipient_handle) can materialize the
    real recipients back out, scoped to the conversation that created it.
    Mirrors Workflow/ToolCallLog's existing "small dedicated table per
    concern" style rather than overloading either of them.

    query holds enough to deterministically re-run the same resolution
    later (course + assignment); snapshot_recipients is what that query
    actually produced at resolve time, kept in the same row (rather than a
    plain id array) so recipient names survive without a second Canvas
    round-trip."""

    __tablename__ = "resolved_sets"

    handle: Mapped[str] = mapped_column(String, primary_key=True)

    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    kind: Mapped[str] = mapped_column(String, nullable=False)
    query: Mapped[dict] = mapped_column(JSONB, nullable=False)
    snapshot_recipients: Mapped[list] = mapped_column(JSONB, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    conversation: Mapped[Conversation] = relationship("Conversation")
