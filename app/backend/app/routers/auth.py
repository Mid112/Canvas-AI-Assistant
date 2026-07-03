from fastapi import APIRouter, Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.limiter import limiter
from app.dependencies import bearer, get_admin_user, get_current_user
from app.integrations.canvas import check_token_status
from app.models.user import User
from app.schemas.auth import (
    CanvasTokenRequest,
    CanvasTokenValidationResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth import (
    admin_login_user,
    delete_current_user,
    login_user,
    logout_admin,
    register_user,
    remove_canvas_connection,
    update_canvas_token,
    update_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Pass full body so service can access name and role
    return await register_user(db, body)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, body.email, body.password)


@router.post("/admin/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def admin_login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    return await admin_login_user(db, body.email, body.password)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await logout_admin(db, credentials.credentials, current_user)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_current_user(db, current_user, body)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_current_user(db, current_user)


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
