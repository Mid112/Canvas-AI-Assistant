"""File note: supports the dependencies area of the Canvas workflow assistant."""

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token, hash_token
from app.models.session import Session
from app.models.user import User

bearer = HTTPBearer()


async def _validate_token_session(db: AsyncSession, token: str) -> None:
    session = await db.scalar(
        select(Session).where(
            Session.token_hash == hash_token(token),
            Session.expires_at > datetime.now(UTC),
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")


def require_roles(*roles: str):
    """Build a FastAPI dependency that authenticates the bearer token and enforces
    both role membership and account status. Pass no roles to allow any
    authenticated, active user (used for get_current_user).
    """
    async def _guard(
        credentials: HTTPAuthorizationCredentials = Depends(bearer),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        try:
            user_id, _ = decode_access_token(credentials.credentials)
        except JWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        await _validate_token_session(db, credentials.credentials)

        # selectinload eager-loads canvas_connections here so service layer can access them
        # without hitting the DB again — async SQLAlchemy can't lazy-load inside async context
        user = await db.scalar(
            select(User)
            .where(User.id == int(user_id))
            .options(selectinload(User.canvas_connections))
        )
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

        # Role is enforced from the DB record, not the JWT claim — the claim is
        # only used to look up the user. If it were used for the role check, a
        # token minted before a role change would keep its old privileges until
        # the token expires.
        if roles and user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {' or '.join(roles)}",
            )
        return user

    return _guard


get_current_user = require_roles()
get_instructor_user = require_roles("instructor")


async def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id, _ = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.scalar(
        select(User)
        .where(User.id == int(user_id))
        .options(selectinload(User.canvas_connections))
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Role is enforced from the DB record, not the JWT claim (see require_roles's
    # _guard above for why: a stale token must not keep old privileges). Checked
    # before the session lookup below since non-admins never have a Session row
    # (only minted by the admin login flow) — a non-admin token must fail with
    # 403 "wrong role", not 401 "no session".
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    await _validate_token_session(db, credentials.credentials)
    return user
