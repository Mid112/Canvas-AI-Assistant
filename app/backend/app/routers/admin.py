"""Router note: exposes HTTP endpoints for admin workflows while delegating business rules to services."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.schemas.admin import (
    AdminCanvasConnectionResponse,
    AdminDashboardResponse,
    AdminSettingsResponse,
    AdminSettingsUpdate,
    AdminUserResponse,
    CreateAdminRequest,
    CreateInstructorRequest,
    InstructorResponse,
    UpdateInstructorRequest,
)
from app.schemas.auth import CanvasTokenRequest
from app.schemas.health import HealthCheckResponse, HealthHistoryResponse, LatestHealthResponse
from app.schemas.llm_provider import LlmProviderConfig, LlmProviderConfigResponse, LlmProviderStatus
from app.services.admin import (
    create_admin_user,
    create_instructor,
    disable_instructor,
    enable_instructor,
    get_admin_settings,
    get_dashboard_stats,
    get_llm_provider_config,
    list_instructor_canvas_connections,
    list_instructors,
    reset_instructor_canvas_token,
    revoke_instructor_access,
    update_admin_settings,
    update_instructor,
    update_llm_provider_config,
)
from app.services.health import get_health_history, get_latest_health_status, run_health_checks
from app.services.llm.provider_registry import get_provider_statuses

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def admin_dashboard(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_stats(db)


@router.get("/health", response_model=HealthCheckResponse)
async def admin_health(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await run_health_checks(db, request.app.state.started_at)


@router.get("/health/latest", response_model=LatestHealthResponse)
async def admin_health_latest(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Cheap: reads persisted state only, triggers no live checks (no
    Canvas ping, no AI generate() call). Meant to be called on every admin
    page load to power the nav badge — use GET /admin/health for a real,
    live check."""
    return await get_latest_health_status(db)


@router.get("/health/history", response_model=HealthHistoryResponse)
async def admin_health_history(
    hours: int = Query(default=24, ge=1, le=168),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_health_history(db, hours=hours)


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
    settings = await update_admin_settings(db, body.settings, current_user)
    return AdminSettingsResponse(settings=settings)


@router.get("/llm/providers", response_model=LlmProviderConfigResponse)
async def llm_provider_settings(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return LlmProviderConfigResponse(
        config=await get_llm_provider_config(db),
        providers=[LlmProviderStatus(**provider) for provider in await get_provider_statuses()],
    )


@router.put("/llm/providers", response_model=LlmProviderConfigResponse)
async def update_llm_provider_settings(
    body: LlmProviderConfig,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    config = await update_llm_provider_config(db, body, current_user)
    return LlmProviderConfigResponse(
        config=config,
        providers=[LlmProviderStatus(**provider) for provider in await get_provider_statuses()],
    )


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    body: CreateAdminRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_admin_user(db, body, current_user)


@router.get("/instructors", response_model=list[InstructorResponse])
async def list_instructor_accounts(
    canvas_status: Literal["failing"] | None = Query(default=None),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_instructors(db, canvas_status=canvas_status)


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


@router.get(
    "/instructors/{instructor_id}/canvas-connections",
    response_model=list[AdminCanvasConnectionResponse],
)
async def list_instructor_canvas_connections_route(
    instructor_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_instructor_canvas_connections(db, instructor_id)


@router.patch(
    "/instructors/{instructor_id}/canvas-token",
    response_model=list[AdminCanvasConnectionResponse],
)
async def reset_instructor_canvas_token_route(
    instructor_id: int,
    body: CanvasTokenRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await reset_instructor_canvas_token(
        db,
        instructor_id,
        canvas_token=body.canvas_token,
        canvas_url=body.canvas_url,
        admin=current_user,
    )
