from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    encrypt_canvas_token,
    generate_reset_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.integrations.canvas import fetch_self, validate_token
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
from app.services.admin import get_admin_settings
from app.services.sessions import issue_token_for_user, revoke_other_sessions, revoke_session


async def register_user(db: AsyncSession, body: RegisterRequest) -> TokenResponse:
    admin_settings = await get_admin_settings(db)
    if not admin_settings.get("allow_instructor_self_registration", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Instructor self-registration is currently disabled.",
        )

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
    db.add(AuditLogSession(user_id=user.id, action="instructor_registered", details={"email": user.email}))
    token, _ = await issue_token_for_user(db, user)
    return TokenResponse(access_token=token)


async def login_user(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    if not user:
        db.add(AuditLogSession(user_id=None, action="login_failed", details={"email": email, "reason": "unknown_email"}))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        db.add(AuditLogSession(
            user_id=user.id, action="login_failed", details={"email": email, "reason": "account_disabled"}
        ))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    if not verify_password(password, user.hashed_password):
        db.add(AuditLogSession(
            user_id=user.id, action="login_failed", details={"email": email, "reason": "invalid_credentials"}
        ))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Same "admin_login" record admin_login_user (the separate, rate-limited
    # /admin/login endpoint) writes, so the audit trail doesn't depend on
    # which endpoint an admin happens to sign in through. Add it before
    # issue_token_for_user(), whose commit persists both the Session and this
    # audit row atomically.
    action = "admin_login" if user.role == "admin" else "instructor_login"
    db.add(AuditLogSession(user_id=user.id, action=action, details={"email": user.email}))
    token, _ = await issue_token_for_user(db, user)

    return TokenResponse(access_token=token)


async def admin_login_user(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    if not user:
        db.add(AuditLogSession(user_id=None, action="login_failed", details={"email": email, "reason": "unknown_email"}))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.role != "admin":
        db.add(AuditLogSession(
            user_id=user.id, action="login_failed", details={"email": email, "reason": "not_admin"}
        ))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    if not user.is_active:
        db.add(AuditLogSession(
            user_id=user.id, action="login_failed", details={"email": email, "reason": "account_disabled"}
        ))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    if not verify_password(password, user.hashed_password):
        db.add(AuditLogSession(
            user_id=user.id, action="login_failed", details={"email": email, "reason": "invalid_credentials"}
        ))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    db.add(AuditLogSession(user_id=user.id, action="admin_login", details={"email": user.email}))
    token, _ = await issue_token_for_user(db, user)
    return TokenResponse(access_token=token)


async def logout_user(db: AsyncSession, token: str, user: User) -> None:
    db.add(AuditLogSession(user_id=user.id, action="instructor_logout", details={"email": user.email}))
    await revoke_session(db, token)


async def logout_admin(db: AsyncSession, token: str, user: User) -> None:
    db.add(AuditLogSession(user_id=user.id, action="admin_logout", details={"email": user.email}))
    await revoke_session(db, token)


async def update_profile(db: AsyncSession, user: User, body: ProfileUpdateRequest) -> User:
    if body.email is not None and body.email != user.email:
        conflict = await db.scalar(select(User).where(User.email == body.email, User.id != user.id))
        if conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        user.email = str(body.email)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Name cannot be empty")
        user.name = name

    db.add(
        AuditLogSession(
            user_id=user.id,
            action="profile_updated",
            details={"name": user.name, "email": user.email},
        )
    )
    await db.commit()

    refreshed = await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
        .execution_options(populate_existing=True)
    )
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return refreshed


async def delete_account(db: AsyncSession, user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    db.add(AuditLogSession(user_id=user.id, action="account_deleted", details={"email": user.email}))
    user.is_active = False
    await db.execute(delete(CanvasConnection).where(CanvasConnection.user_id == user.id))
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()


async def change_password(
    db: AsyncSession, user: User, body: ChangePasswordRequest, current_token: str
) -> None:
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    user.hashed_password = hash_password(body.new_password)
    db.add(AuditLogSession(user_id=user.id, action="password_changed", details={}))
    # Keep the Settings session that performed the change usable; revoke every
    # other device session so a stolen/old token cannot outlive the password
    # change (mirrors confirm_password_reset, but preserves current — #1480).
    # revoke_other_sessions commits the password update + session deletes together.
    await revoke_other_sessions(db, user, current_token)


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
    db.add(AuditLogSession(user_id=user.id, action="password_reset_requested", details={"email": email}))
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
    session = await db.scalar(select(Session).where(Session.id == session_id, Session.user_id == user.id))
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
    db.add(AuditLogSession(
        user_id=user.id, action="canvas_connection_removed", details={"canvas_url": conn.canvas_url}
    ))
    await db.delete(conn)
    await db.commit()


async def update_canvas_token(db: AsyncSession, user: User, canvas_token: str, canvas_url: str) -> User:
    await validate_token(canvas_token, canvas_url)
    encrypted = encrypt_canvas_token(canvas_token)
    profile = await fetch_self(canvas_token, canvas_url)
    canvas_time_zone = profile.get("time_zone") if isinstance(profile.get("time_zone"), str) else None

    existing = await db.scalar(
        select(CanvasConnection).where(
            CanvasConnection.user_id == user.id,
            CanvasConnection.canvas_url == canvas_url,
        )
    )
    action = "canvas_connection_updated" if existing else "canvas_connection_added"
    if existing:
        existing.encrypted_token = encrypted
        existing.time_zone = canvas_time_zone
    else:
        db.add(
            CanvasConnection(
                user_id=user.id,
                canvas_url=canvas_url,
                encrypted_token=encrypted,
                time_zone=canvas_time_zone,
            )
        )

    db.add(AuditLogSession(user_id=user.id, action=action, details={"canvas_url": canvas_url}))
    await db.commit()

    refreshed = await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
        .execution_options(populate_existing=True)
    )
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return refreshed
