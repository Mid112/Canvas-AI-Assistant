from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import (
    create_access_token,
    encrypt_canvas_token,
    generate_reset_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.integrations.canvas import validate_token
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.password_reset_token import PasswordResetToken
from app.models.session import Session
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.auth import (
    ChangePasswordRequest,
    NotificationSettingsUpdate,
    PasswordResetConfirmRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.sessions import issue_token_for_user, revoke_session


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
    await db.flush()
    token, _ = await issue_token_for_user(db, user)
    return TokenResponse(access_token=token)


async def login_user(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    token, _ = await issue_token_for_user(db, user)
    return TokenResponse(access_token=token)


async def admin_login_user(
    db: AsyncSession, email: str, password: str
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    token = create_access_token(user.id, role="admin")

    expires_at = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    db.add(Session(user_id=user.id, token_hash=hash_token(token), expires_at=expires_at))
    db.add(AuditLogSession(user_id=user.id, action="admin_login", details={"email": user.email}))
    await db.commit()

    return TokenResponse(access_token=token)


async def logout_user(db: AsyncSession, token: str) -> None:
    await revoke_session(db, token)


async def logout_admin(db: AsyncSession, token: str, user: User) -> None:
    session = await db.scalar(
        select(Session).where(Session.token_hash == hash_token(token))
    )
    if session:
        await db.delete(session)
    db.add(AuditLogSession(user_id=user.id, action="admin_logout", details={"email": user.email}))
    await db.commit()


async def update_profile(db: AsyncSession, user: User, body: ProfileUpdateRequest) -> User:
    if body.email is not None and body.email != user.email:
        conflict = await db.scalar(select(User).where(User.email == body.email, User.id != user.id))
        if conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        user.email = body.email
    if body.name is not None:
        user.name = body.name

    db.add(
        AuditLogSession(
            user_id=user.id,
            action="profile_updated",
            details={"name": user.name, "email": user.email},
        )
    )
    await db.commit()
    await db.refresh(user)
    return user


async def delete_account(db: AsyncSession, user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    db.add(AuditLogSession(user_id=user.id, action="account_deleted", details={"email": user.email}))
    await db.delete(user)
    await db.commit()


async def change_password(db: AsyncSession, user: User, body: ChangePasswordRequest) -> None:
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    user.hashed_password = hash_password(body.new_password)
    db.add(AuditLogSession(user_id=user.id, action="password_changed", details={}))
    await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> str | None:
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        return None

    raw_token = generate_reset_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    await db.commit()
    return raw_token


async def confirm_password_reset(db: AsyncSession, body: PasswordResetConfirmRequest) -> None:
    token_row = await db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(body.token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(UTC),
        )
    )
    if not token_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user = await db.get(User, token_row.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user.hashed_password = hash_password(body.new_password)
    token_row.used_at = datetime.now(UTC)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    db.add(AuditLogSession(user_id=user.id, action="password_reset", details={}))
    await db.commit()


async def get_notification_settings(db: AsyncSession, user: User) -> dict:
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    return pref.notification_settings if pref else {}


async def update_notification_settings(
    db: AsyncSession, user: User, body: NotificationSettingsUpdate
) -> dict:
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if not pref:
        pref = UserPreference(user_id=user.id, notification_settings=body.settings)
        db.add(pref)
    else:
        pref.notification_settings = body.settings
        pref.updated_at = datetime.now(UTC)

    await db.commit()
    return pref.notification_settings


async def list_user_sessions(db: AsyncSession, user: User, current_token: str) -> list[dict]:
    current_hash = hash_token(current_token)
    rows = await db.scalars(
        select(Session)
        .where(Session.user_id == user.id, Session.expires_at > datetime.now(UTC))
        .order_by(desc(Session.created_at))
    )
    return [
        {
            "id": s.id,
            "created_at": s.created_at,
            "expires_at": s.expires_at,
            "is_current": s.token_hash == current_hash,
        }
        for s in rows
    ]


async def revoke_user_session(db: AsyncSession, user: User, session_id: int) -> None:
    session = await db.scalar(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await db.delete(session)
    await db.commit()


async def remove_canvas_connection(db: AsyncSession, user: User, connection_id: int) -> None:
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

    return await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
        .execution_options(populate_existing=True)
    )
