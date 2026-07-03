from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.integrations.canvas import check_token_status
from app.models.user import User
from app.schemas.auth import (
    CanvasTokenRequest,
    CanvasTokenValidationResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth import login_user, register_user, remove_canvas_connection, update_canvas_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Pass full body so service can access name and role
    return await register_user(db, body)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, body.email, body.password)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


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
