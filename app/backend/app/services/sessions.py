from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token_with_expiry, hash_token
from app.models.session import Session
from app.models.user import User


async def create_user_session(db: AsyncSession, user: User, token: str, expires_at: datetime) -> Session:
    session = Session(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    return session


async def issue_token_for_user(db: AsyncSession, user: User) -> tuple[str, datetime]:
    token, expires_at = create_access_token_with_expiry(user.id, role=user.role)
    await create_user_session(db, user, token, expires_at)
    await db.commit()
    return token, expires_at


async def validate_session(db: AsyncSession, token: str) -> bool:
    session = await db.scalar(
        select(Session).where(
            Session.token_hash == hash_token(token),
            Session.expires_at > datetime.now(UTC),
        )
    )
    return session is not None


async def revoke_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    await db.commit()


async def revoke_other_sessions(db: AsyncSession, user: User, current_token: str) -> int:
    current_hash = hash_token(current_token)
    result = await db.execute(
        delete(Session).where(
            Session.user_id == user.id,
            Session.token_hash != current_hash,
        )
    )
    await db.commit()
    return result.rowcount or 0
