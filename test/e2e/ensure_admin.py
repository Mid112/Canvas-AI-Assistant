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
from urllib.parse import urlparse

backend_path = Path(__file__).resolve().parents[2] / "app" / "backend"
sys.path.insert(0, str(backend_path))

# Imports below need the backend path/env setup first, because this helper runs
# from the Playwright package rather than the backend package root.
from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_path / ".env")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402

EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "AdminPass123!")
NAME = os.environ.get("ADMIN_NAME", "Administrator")
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}


def assert_safe_database_url(database_url: str) -> None:
    """Prevent the e2e admin helper from mutating a non-local DB by accident."""
    parsed = urlparse(database_url)
    if parsed.hostname in LOCAL_DB_HOSTS:
        return

    if os.environ.get("ALLOW_E2E_DB_MUTATION") == "true":
        return

    raise RuntimeError(
        "Refusing to seed e2e admin into a non-local database. "
        "Set ALLOW_E2E_DB_MUTATION=true only for an intentional e2e database."
    )


async def ensure_admin() -> None:
    assert_safe_database_url(settings.DATABASE_URL)
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
