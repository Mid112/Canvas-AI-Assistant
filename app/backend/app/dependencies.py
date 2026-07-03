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


async def _load_user(db: AsyncSession, user_id: str) -> User:
    user = await db.scalar(
        select(User)
        .where(User.id == int(user_id))
        .options(selectinload(User.canvas_connections))
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def _validate_token_session(db: AsyncSession, token: str) -> None:
    session = await db.scalar(
        select(Session).where(
            Session.token_hash == hash_token(token),
            Session.expires_at > datetime.now(UTC),
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id, _role = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    await _validate_token_session(db, credentials.credentials)
    return await _load_user(db, user_id)


async def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id, role = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    await _validate_token_session(db, credentials.credentials)
    return await _load_user(db, user_id)
