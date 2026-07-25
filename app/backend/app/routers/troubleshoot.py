from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.troubleshoot import DiagnosticsResponse
from app.services.troubleshoot import get_diagnostics

router = APIRouter(prefix="/admin/troubleshoot", tags=["troubleshoot"])


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def troubleshoot_diagnostics(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_diagnostics(db, request.app.state.started_at)
