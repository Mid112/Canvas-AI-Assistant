"""Admin-side escalation tracking for failed operations (Feature 12, Secure
Troubleshooting). Read-only/escalate-only: no retry/re-trigger action exists
yet, pending the team's risk framework for Canvas writes."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.failed_operation import FailedOperation
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.support_ticket import (
    SupportTicketCreate,
    SupportTicketListResponse,
    SupportTicketResponse,
    SupportTicketUpdate,
    TicketStatus,
)


def _to_response(row: SupportTicket) -> SupportTicketResponse:
    return SupportTicketResponse(
        id=row.id,
        failed_operation_id=row.failed_operation_id,
        user_id=row.user_id,
        user_name=row.user.name if row.user is not None else None,
        status=row.status,  # type: ignore[arg-type]
        admin_notes=row.admin_notes,
        created_by=row.created_by,
        created_by_email=row.creator.email if row.creator is not None else None,
        resolved_by=row.resolved_by,
        resolved_by_email=row.resolver.email if row.resolver is not None else None,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
    )


def _load_options(query):
    return query.options(
        selectinload(SupportTicket.user),
        selectinload(SupportTicket.creator),
        selectinload(SupportTicket.resolver),
    )


async def create_ticket(
    db: AsyncSession,
    payload: SupportTicketCreate,
    *,
    created_by: User,
) -> SupportTicketResponse:
    """Get-or-create: escalating the same failed operation twice returns the
    existing ticket rather than creating a duplicate (support_tickets.failed_operation_id
    is UNIQUE)."""
    existing = await db.scalar(
        _load_options(select(SupportTicket)).where(
            SupportTicket.failed_operation_id == payload.failed_operation_id
        )
    )
    if existing is not None:
        return _to_response(existing)

    failed_operation = await db.get(FailedOperation, payload.failed_operation_id)
    if failed_operation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failed operation not found.",
        )

    row = SupportTicket(
        failed_operation_id=payload.failed_operation_id,
        user_id=failed_operation.user_id,
        admin_notes=payload.admin_notes,
        created_by=created_by.id,
    )
    db.add(row)
    await db.commit()

    row = await db.scalar(_load_options(select(SupportTicket)).where(SupportTicket.id == row.id))
    assert row is not None
    return _to_response(row)


async def list_tickets(
    db: AsyncSession,
    *,
    ticket_status: TicketStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> SupportTicketListResponse:
    query = _load_options(select(SupportTicket))
    count_query = select(func.count()).select_from(SupportTicket)

    if ticket_status is not None:
        query = query.where(SupportTicket.status == ticket_status)
        count_query = count_query.where(SupportTicket.status == ticket_status)

    total = int(await db.scalar(count_query) or 0)
    rows = await db.scalars(
        query.order_by(desc(SupportTicket.created_at)).offset(offset).limit(limit)
    )
    return SupportTicketListResponse(items=[_to_response(row) for row in rows], total=total)


async def get_ticket(db: AsyncSession, ticket_id: int) -> SupportTicketResponse:
    row = await db.scalar(_load_options(select(SupportTicket)).where(SupportTicket.id == ticket_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    return _to_response(row)


async def get_ticket_for_failed_operation(
    db: AsyncSession, failed_operation_id: int
) -> SupportTicketResponse | None:
    row = await db.scalar(
        _load_options(select(SupportTicket)).where(
            SupportTicket.failed_operation_id == failed_operation_id
        )
    )
    return _to_response(row) if row is not None else None


async def update_ticket(
    db: AsyncSession,
    ticket_id: int,
    payload: SupportTicketUpdate,
    *,
    acting_admin: User,
) -> SupportTicketResponse:
    row = await db.scalar(_load_options(select(SupportTicket)).where(SupportTicket.id == ticket_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    if payload.admin_notes is not None:
        row.admin_notes = payload.admin_notes

    if payload.status is not None and payload.status != row.status:
        row.status = payload.status
        if payload.status == "resolved":
            row.resolved_by = acting_admin.id
            row.resolved_at = datetime.now(UTC)
        else:
            row.resolved_by = None
            row.resolved_at = None

    await db.commit()
    return _to_response(row)
