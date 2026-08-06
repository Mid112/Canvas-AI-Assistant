"""Router note: exposes HTTP endpoints for failed operations workflows while delegating business rules to services."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.failed_operations import (
    FailedOperationDetailResponse,
    FailedOperationListResponse,
    FailedOperationSummaryResponse,
)
from app.services.failed_operations import (
    get_failed_operation,
    get_failed_operations_summary,
    list_failed_operations,
)

router = APIRouter(prefix="/admin/failed-operations", tags=["failed-operations"])


@router.get("/summary", response_model=FailedOperationSummaryResponse)
async def get_failed_operations_summary_route(
    hours: int = Query(default=24, ge=1, le=168),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_failed_operations_summary(db, hours=hours)


@router.get("", response_model=FailedOperationListResponse)
async def list_failed_operations_route(
    source: str | None = Query(default=None, pattern="^(canvas|ai)$"),
    operation: str | None = Query(default=None),
    user_id: int | None = Query(default=None, ge=1),
    hours: int | None = Query(default=24, ge=1, le=168),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_failed_operations(
        db,
        source=source,
        operation=operation,
        user_id=user_id,
        hours=hours,
        limit=limit,
        offset=offset,
    )


@router.get("/{failed_operation_id}", response_model=FailedOperationDetailResponse)
async def get_failed_operation_route(
    failed_operation_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_failed_operation(db, failed_operation_id, viewer=current_user)
