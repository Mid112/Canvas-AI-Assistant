"""Idempotently seed stable local demo logins.

App users are only `admin` / `instructor` (no student login role). This
script upserts:

  admin@example.com      / AdminPass123!       (admin)
  instructor@example.com / InstructorPass123!  (instructor)
  student1@example.com   / StudentPass123!     (instructor — demo login #1)
  student2@example.com   / StudentPass123!     (instructor — demo login #2)

Safe for local Postgres only (same guard as ensure_admin.py).
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

backend_path = Path(__file__).resolve().parents[2] / "app" / "backend"
sys.path.insert(0, str(backend_path))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_path / ".env")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402

from ensure_admin import assert_safe_database_url  # noqa: E402

# (email, password, name, role)
DEMO_USERS: tuple[tuple[str, str, str, str], ...] = (
    (
        os.environ.get("ADMIN_EMAIL", "admin@example.com"),
        os.environ.get("ADMIN_PASSWORD", "AdminPass123!"),
        os.environ.get("ADMIN_NAME", "Administrator"),
        "admin",
    ),
    (
        os.environ.get("INSTRUCTOR_EMAIL", "instructor@example.com"),
        os.environ.get("INSTRUCTOR_PASSWORD", "InstructorPass123!"),
        os.environ.get("INSTRUCTOR_NAME", "Demo Instructor"),
        "instructor",
    ),
    (
        os.environ.get("STUDENT1_EMAIL", "student1@example.com"),
        os.environ.get("STUDENT1_PASSWORD", "StudentPass123!"),
        os.environ.get("STUDENT1_NAME", "Demo Student One"),
        "instructor",
    ),
    (
        os.environ.get("STUDENT2_EMAIL", "student2@example.com"),
        os.environ.get("STUDENT2_PASSWORD", "StudentPass123!"),
        os.environ.get("STUDENT2_NAME", "Demo Student Two"),
        "instructor",
    ),
)


async def ensure_demo_users() -> None:
    assert_safe_database_url(settings.DATABASE_URL)
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            for email, password, name, role in DEMO_USERS:
                user = await db.scalar(select(User).where(User.email == email))
                if user is None:
                    db.add(
                        User(
                            name=name,
                            email=email,
                            hashed_password=hash_password(password),
                            role=role,
                            is_active=True,
                        )
                    )
                else:
                    user.name = name
                    user.hashed_password = hash_password(password)
                    user.role = role
                    user.is_active = True
                print(f"Ensured {role} login: {email}")
            await db.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(ensure_demo_users())
