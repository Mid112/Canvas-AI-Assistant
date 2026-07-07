from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import (
    create_access_token,
    encrypt_canvas_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.integrations.canvas import validate_token
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.session import Session
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse, UserUpdateRequest


async def register_user(db: AsyncSession, body: RegisterRequest) -> TokenResponse:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="instructor",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id, role=user.role))


async def login_user(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    # Deliberate vague error — don't reveal whether email exists
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    if user.role == "admin":
        return await _issue_admin_token(db, user)

    return TokenResponse(access_token=create_access_token(user.id, role=user.role))


async def admin_login_user(
    db: AsyncSession, email: str, password: str
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )

    return await _issue_admin_token(db, user)


async def _issue_admin_token(db: AsyncSession, user: User) -> TokenResponse:
    token = create_access_token(user.id, role="admin")

    expires_at = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    db.add(Session(user_id=user.id, token_hash=hash_token(token), expires_at=expires_at))
    db.add(AuditLogSession(user_id=user.id, action="admin_login", details={"email": user.email}))
    await db.commit()

    return TokenResponse(access_token=token)


async def logout_admin(db: AsyncSession, token: str, user: User) -> None:
    session = await db.scalar(
        select(Session).where(Session.token_hash == hash_token(token))
    )
    if session:
        await db.delete(session)
    db.add(AuditLogSession(user_id=user.id, action="admin_logout", details={"email": user.email}))
    await db.commit()


async def update_current_user(db: AsyncSession, user: User, body: UserUpdateRequest) -> User:
    if body.email is not None and body.email != user.email:
        existing = await db.scalar(select(User).where(User.email == body.email, User.id != user.id))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        user.email = str(body.email)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Name cannot be empty",
            )
        user.name = name

    await db.commit()

    return await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
        .execution_options(populate_existing=True)
    )


async def delete_current_user(db: AsyncSession, user: User) -> None:
    connections = await db.scalars(select(CanvasConnection).where(CanvasConnection.user_id == user.id))
    for connection in connections:
        await db.delete(connection)
    user.is_active = False
    await db.commit()


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


async def update_canvas_token(db: AsyncSession, user: User, canvas_token: str, canvas_url: str) -> User:
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
