"""Remove Canvas connections from the isolated e2e database.

E2E onboarding intentionally reuses one valid live Canvas token. The product
must reject that token for a second instructor, so each browser test needs a
fresh connection table while retaining the rest of its database state.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

backend_path = Path(__file__).resolve().parents[2] / "app" / "backend"
sys.path.insert(0, str(backend_path))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_path / ".env")

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.models.canvas_connection import CanvasConnection  # noqa: E402
from app.models.user import User  # noqa: E402

LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}


def assert_safe_database_url(database_url: str) -> None:
    parsed = urlparse(database_url)
    if parsed.hostname in LOCAL_DB_HOSTS:
        return
    if os.environ.get("ALLOW_E2E_DB_MUTATION") == "true":
        return
    raise RuntimeError(
        "Refusing to clear Canvas connections from a non-local database. "
        "Set ALLOW_E2E_DB_MUTATION=true only for an intentional e2e database."
    )


async def reset_canvas_connections() -> None:
    assert_safe_database_url(settings.DATABASE_URL)
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            # E2E users are deliberately namespaced by the helpers (for
            # example, e2e_inst_* and e2e_return_canvas_*). Do not clear real
            # local instructors' connections when running e2e.
            e2e_users = select(User.id).where(User.email.like("e2e_%@example.com"))
            await db.execute(
                delete(CanvasConnection).where(CanvasConnection.user_id.in_(e2e_users))
            )
            await db.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(reset_canvas_connections())
