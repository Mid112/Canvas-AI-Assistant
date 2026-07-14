"""Idempotently ensure the Playwright e2e admin exists.

The backend seeder only creates an admin when the table has zero admins.
Local DBs that already have pytest-created admins never get
admin@example.com — this script upserts those credentials.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

backend_path = Path(__file__).resolve().parents[2] / "app" / "backend"
sys.path.insert(0, str(backend_path))

from dotenv import load_dotenv

load_dotenv(backend_path / ".env")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.models.user import User

EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "AdminPass123!")
NAME = os.environ.get("ADMIN_NAME", "Administrator")


async def ensure_admin() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            user = await db.scalar(select(User).where(User.email == EMAIL))
            if user is None:
                db.add(
                    User(
                        name=NAME,
                        email=EMAIL,
                        hashed_password=hash_password(PASSWORD),
                        role="admin",
                        is_active=True,
                    )
                )
            else:
                user.role = "admin"
                user.is_active = True
                user.hashed_password = hash_password(PASSWORD)
                user.name = NAME
            await db.commit()
            print(f"Ensured e2e admin: {EMAIL}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(ensure_admin())
