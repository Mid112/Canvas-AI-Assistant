from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.dependencies import bearer, get_current_user
from app.integrations.canvas import check_token_status
from app.models.session import Session
from app.models.user import User
from app.schemas.auth import (
    CanvasTokenRequest,
    CanvasTokenValidationResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    NotificationSettingsUpdate,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    SecurityStatusResponse,
    SessionResponse,
    TokenResponse,
    UserResponse,
)
from app.services.auth import (
    admin_login_user,
    change_password,
    confirm_password_reset,
    delete_account,
    get_notification_settings,
    list_user_sessions,
    login_user,
    logout_admin,
    logout_user,
    register_user,
    remove_canvas_connection,
    request_password_reset,
    revoke_user_session,
    update_canvas_token,
    update_notification_settings,
    update_profile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await register_user(db, body)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, body.email, body.password)


@router.post("/admin/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def admin_login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    return await admin_login_user(db, body.email, body.password)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "admin":
        await logout_admin(db, credentials.credentials, current_user)
    else:
        await logout_user(db, credentials.credentials, current_user)


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
@limiter.limit("5/minute")
async def password_reset_request(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    # Always 200 with the same acknowledgement shape so callers cannot tell
    # whether the email matched an account. The raw token is a single-use
    # secret that belongs in an out-of-band channel (email) — never on this
    # public response in production. With no SMTP yet, DEBUG/e2e may include
    # the token so local testing can finish confirm without inbox delivery.
    token = await request_password_reset(db, body.email)
    debug_token = token if settings.DEBUG else None
    return PasswordResetRequestResponse(reset_token=debug_token)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def password_reset_confirm(
    request: Request,
    body: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    await confirm_password_reset(db, body)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_profile(db, current_user, body)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_account(db, current_user, body.password)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password_endpoint(
    body: ChangePasswordRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await change_password(db, current_user, body, credentials.credentials)


@router.get("/me/notifications")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_notification_settings(db, current_user)


@router.patch("/me/notifications")
async def update_notifications(
    body: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_notification_settings(db, current_user, body)


@router.get("/me/sessions", response_model=list[SessionResponse])
async def get_sessions(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_user_sessions(db, current_user, credentials.credentials)


@router.delete("/me/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await revoke_user_session(db, current_user, session_id)


@router.get("/me/security", response_model=SecurityStatusResponse)
async def security_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count())
        .select_from(Session)
        .where(Session.user_id == current_user.id, Session.expires_at > datetime.now(UTC))
    )
    return SecurityStatusResponse(two_factor_enabled=False, active_session_count=int(count or 0))


@router.patch("/me/canvas-token", response_model=UserResponse)
async def set_canvas_token(
    body: CanvasTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_canvas_token(db, current_user, body.canvas_token, body.canvas_url)


@router.post("/me/canvas-token/validate", response_model=CanvasTokenValidationResponse)
async def validate_canvas_token(
    body: CanvasTokenRequest,
    current_user: User = Depends(get_current_user),
):
    return CanvasTokenValidationResponse(status=await check_token_status(body.canvas_token, body.canvas_url))


@router.delete("/me/canvas-connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_canvas_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await remove_canvas_connection(db, current_user, connection_id)
