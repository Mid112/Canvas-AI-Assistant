from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import hash_password
from app.models.audit_log_session import AuditLogSession
from app.models.user import User


async def seed_admin(db: AsyncSession) -> None:
    """Create the bootstrap admin account from env vars if none exists yet.

    Runs at every startup but is a no-op when either:
    - ADMIN_EMAIL / ADMIN_PASSWORD are not set, or
    - any admin account already exists in the DB.
    """
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return

    existing_admin = await db.scalar(select(User).where(User.role == "admin"))
    if existing_admin:
        return

    user = User(
        name=settings.ADMIN_NAME,
        email=settings.ADMIN_EMAIL,
        hashed_password=hash_password(settings.ADMIN_PASSWORD),
        role="admin",
    )
    db.add(user)
    # flush assigns user.id without committing so AuditLogSession FK is satisfied
    await db.flush()
    db.add(AuditLogSession(
        user_id=user.id,
        action="admin_seeded",
        details={"email": user.email},
    ))
    await db.commit()
