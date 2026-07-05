from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.admin import (
    AdminDashboardResponse,
    AdminSettingsResponse,
    AdminSettingsUpdate,
    AdminUserResponse,
    CreateAdminRequest,
    CreateInstructorRequest,
    InstructorResponse,
    UpdateInstructorRequest,
)
from app.services.admin import (
    create_admin_user,
    create_instructor,
    disable_instructor,
    enable_instructor,
    get_admin_settings,
    get_dashboard_stats,
    list_instructors,
    revoke_instructor_access,
    update_admin_settings,
    update_instructor,
)

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


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    body: CreateAdminRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_user(db, body, current_user)


@router.get("/instructors", response_model=list[InstructorResponse])
async def list_instructor_accounts(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_instructors(db)


@router.post("/instructors", response_model=InstructorResponse, status_code=status.HTTP_201_CREATED)
async def create_instructor_account(
    body: CreateInstructorRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_instructor(db, body, current_user)


@router.patch("/instructors/{instructor_id}", response_model=InstructorResponse)
async def update_instructor_account(
    instructor_id: int,
    body: UpdateInstructorRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_instructor(db, instructor_id, body, current_user)


@router.post("/instructors/{instructor_id}/enable", response_model=InstructorResponse)
async def enable_instructor_account(
    instructor_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await enable_instructor(db, instructor_id, current_user)


@router.post("/instructors/{instructor_id}/disable", response_model=InstructorResponse)
async def disable_instructor_account(
    instructor_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await disable_instructor(db, instructor_id, current_user)


@router.delete("/instructors/{instructor_id}/access", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_instructor_canvas_access(
    instructor_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await revoke_instructor_access(db, instructor_id, current_user)
