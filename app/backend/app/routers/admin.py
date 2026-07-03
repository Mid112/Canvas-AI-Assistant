from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.admin import AdminDashboardResponse, AdminSettingsResponse, AdminSettingsUpdate
from app.services.admin import get_admin_settings, get_dashboard_stats, update_admin_settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def admin_dashboard(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_stats(db)


@router.get("/settings", response_model=AdminSettingsResponse)
async def admin_settings(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return AdminSettingsResponse(settings=await get_admin_settings(db))


@router.patch("/settings", response_model=AdminSettingsResponse)
async def update_settings(
    body: AdminSettingsUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    settings = await update_admin_settings(db, body.settings)
    return AdminSettingsResponse(settings=settings)
