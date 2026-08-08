from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deferred_assistant_request import DeferredAssistantRequest
from app.models.user import User
from app.services.canvas_assistant_gate import user_has_canvas_credentials


async def defer_assistant_request(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: int | None,
    message: str,
    proposed_action: dict | None = None,
) -> DeferredAssistantRequest:
    row = DeferredAssistantRequest(
        user_id=user.id,
        conversation_id=conversation_id,
        message=message,
        proposed_action=proposed_action,
        status="deferred",
    )
    db.add(row)
    await db.flush()
    return row


async def list_deferred_assistant_requests(
    db: AsyncSession,
    user: User,
) -> list[DeferredAssistantRequest]:
    rows = await db.scalars(
        select(DeferredAssistantRequest)
        .where(
            DeferredAssistantRequest.user_id == user.id,
            DeferredAssistantRequest.status == "deferred",
        )
        .order_by(DeferredAssistantRequest.created_at.desc())
    )
    return list(rows)


async def get_deferred_request_for_resume(
    db: AsyncSession,
    user: User,
    deferred_id: int,
) -> DeferredAssistantRequest:
    """Validate ownership/Canvas and return the queued request without consuming it.

    Status stays ``deferred`` until chat successfully replays the message via
    ``mark_deferred_request_resumed``. That way a failed or abandoned resume
    leaves the request recoverable in the queue.
    """
    if not user_has_canvas_credentials(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Connect Canvas before resuming a deferred assistant request.",
        )
    row = await db.get(DeferredAssistantRequest, deferred_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deferred request not found.",
        )
    if row.status != "deferred":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deferred request was already resumed or cancelled.",
        )
    return row


async def mark_deferred_request_resumed(
    db: AsyncSession,
    user: User,
    deferred_id: int,
) -> DeferredAssistantRequest:
    row = await get_deferred_request_for_resume(db, user, deferred_id)
    row.status = "resumed"
    row.resumed_at = datetime.now(UTC)
    await db.flush()
    return row


async def cancel_deferred_request(
    db: AsyncSession,
    user: User,
    deferred_id: int,
) -> DeferredAssistantRequest:
    row = await db.get(DeferredAssistantRequest, deferred_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deferred request not found.",
        )
    if row.status != "deferred":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deferred request was already resumed or cancelled.",
        )
    row.status = "cancelled"
    row.resumed_at = datetime.now(UTC)
    await db.flush()
    return row
