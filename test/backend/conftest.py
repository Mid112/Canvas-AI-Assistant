import asyncio
import sys
import uuid
from pathlib import Path

import pytest
from dotenv import load_dotenv

backend_path = Path(__file__).parent.parent.parent / "app" / "backend"
sys.path.insert(0, str(backend_path))

# Load app/backend/.env so DATABASE_URL and other settings are correct
# regardless of which directory pytest is run from
load_dotenv(backend_path / ".env")

# ---------------------------------------------------------------------------
# Shared fixtures (available to all test modules)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def admin_credentials():
    """Create a fresh admin user directly in the DB and return its credentials.

    Using scope="module" means each test module gets its own isolated admin,
    so tests in different modules don't share or pollute each other's sessions.
    """
    from app.core.database import AsyncSessionLocal
    from app.core.security import hash_password
    from app.models.user import User

    email = f"admin_{uuid.uuid4()}@test.com"
    password = "AdminTestPass123!"

    async def _create():
        async with AsyncSessionLocal() as db:
            db.add(User(
                name="Test Administrator",
                email=email,
                hashed_password=hash_password(password),
                role="admin",
            ))
            await db.commit()

    # asyncio.run() fails when pytest-asyncio (asyncio_mode=auto) has already
    # set a running event loop for the session. Use a dedicated loop instead.
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_create())
    finally:
        loop.close()
    return {"email": email, "password": password}
