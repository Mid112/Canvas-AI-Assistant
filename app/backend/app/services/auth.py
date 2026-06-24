from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    create_access_token,
    encrypt_canvas_token,
    hash_password,
    verify_password,
)
from app.integrations.canvas import validate_token
from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse


async def register_user(
    db: AsyncSession, body: RegisterRequest
) -> TokenResponse:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="instructor",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


async def login_user(
    db: AsyncSession, email: str, password: str
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    # Deliberate vague error — don't reveal whether email exists
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )

    return TokenResponse(access_token=create_access_token(user.id))


async def remove_canvas_connection(db: AsyncSession, user: User, connection_id: int) -> None:
    # filter by both id AND user_id so a user can't delete someone else's connection
    conn = await db.scalar(
        select(CanvasConnection).where(
            CanvasConnection.id == connection_id,
            CanvasConnection.user_id == user.id,
        )
    )
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas connection not found")
    await db.delete(conn)
    await db.commit()


async def update_canvas_token(
    db: AsyncSession, user: User, canvas_token: str, canvas_url: str
) -> User:
    await validate_token(canvas_token, canvas_url)
    encrypted = encrypt_canvas_token(canvas_token)

    # upsert: update the token if this school is already connected, otherwise insert a new row
    existing = await db.scalar(
        select(CanvasConnection).where(
            CanvasConnection.user_id == user.id,
            CanvasConnection.canvas_url == canvas_url,
        )
    )
    if existing:
        existing.encrypted_token = encrypted
    else:
        db.add(CanvasConnection(user_id=user.id, canvas_url=canvas_url, encrypted_token=encrypted))

    await db.commit()

    # populate_existing=True forces SQLAlchemy to re-fetch instead of returning the cached user
    # from the identity map (which still has the old empty canvas_connections list)
    return await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
        .execution_options(populate_existing=True)
    )
