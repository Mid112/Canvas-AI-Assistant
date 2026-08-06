"""Router note: exposes HTTP endpoints for troubleshoot workflows while delegating business rules to services."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.troubleshoot import DiagnosticsResponse, FailingCanvasConnectionListResponse
from app.services.troubleshoot import get_diagnostics, list_failing_canvas_connections

router = APIRouter(prefix="/admin/troubleshoot", tags=["troubleshoot"])


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def troubleshoot_diagnostics(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_diagnostics(db, request.app.state.started_at)


@router.get(
    "/instructor-canvas-connections",
    response_model=FailingCanvasConnectionListResponse,
)
async def troubleshoot_failing_canvas_connections(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_failing_canvas_connections(db, limit=limit, offset=offset)
