from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.troubleshoot import DiagnosticsResponse, FailedOperationListResponse
from app.services.troubleshoot import get_diagnostics, list_failed_operations

router = APIRouter(prefix="/admin/troubleshoot", tags=["troubleshoot"])


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def troubleshoot_diagnostics(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_diagnostics(db, request.app.state.started_at)


@router.get("/failed-operations", response_model=FailedOperationListResponse)
async def troubleshoot_failed_operations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_failed_operations(db, limit=limit, offset=offset)
