from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.admin import CreateAdminRequest


async def create_admin_user(
    db: AsyncSession, body: CreateAdminRequest, created_by: User
) -> User:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    db.add(user)
    await db.flush()
    db.add(AuditLog(
        user_id=created_by.id,
        action="admin_created",
        details={"email": body.email, "new_admin_id": user.id},
    ))
    await db.commit()
    await db.refresh(user)
    return user
