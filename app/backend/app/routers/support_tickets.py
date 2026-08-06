from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.support_ticket import (
    AssignableAdmin,
    SupportTicketCreate,
    SupportTicketListResponse,
    SupportTicketResponse,
    SupportTicketUpdate,
    TicketStatus,
)
from app.services.support_tickets import (
    create_ticket,
    get_ticket,
    get_ticket_for_failed_operation,
    list_assignable_admins,
    list_tickets,
    update_ticket,
)

router = APIRouter(prefix="/admin/support-tickets", tags=["support-tickets"])


@router.get("/assignable-admins", response_model=list[AssignableAdmin])
async def list_assignable_admins_route(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_assignable_admins(db)


@router.post("", response_model=SupportTicketResponse)
async def create_ticket_route(
    payload: SupportTicketCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_ticket(db, payload, created_by=current_user)


@router.get("", response_model=SupportTicketListResponse)
async def list_tickets_route(
    status: TicketStatus | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_tickets(db, ticket_status=status, limit=limit, offset=offset)


@router.get("/by-failed-operation/{failed_operation_id}", response_model=SupportTicketResponse | None)
async def get_ticket_for_failed_operation_route(
    failed_operation_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ticket_for_failed_operation(db, failed_operation_id)


@router.get("/{ticket_id}", response_model=SupportTicketResponse)
async def get_ticket_route(
    ticket_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ticket(db, ticket_id)


@router.patch("/{ticket_id}", response_model=SupportTicketResponse)
async def update_ticket_route(
    ticket_id: int,
    payload: SupportTicketUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_ticket(db, ticket_id, payload, acting_admin=current_user)
