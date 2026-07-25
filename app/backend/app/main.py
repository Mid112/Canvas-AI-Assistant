import asyncio
import contextlib
import logging
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401 — registers all models with Base
from app.config import settings
from app.core.database import AsyncSessionLocal, Base, engine
from app.core.limiter import limiter
from app.core.migrations import run_pending_migrations
from app.core.seeder import seed_admin
from app.routers import (
    admin,
    audit,
    auth,
    canvas,
    chat,
    failed_operations,
    history,
    llm,
    message_templates,
    messages,
    troubleshoot,
)
from app.services.canvas import run_course_sync_sweep

logger = logging.getLogger(__name__)


async def _course_sync_loop() -> None:
    """Keeps canvas_course_names fresh in the background, independent of
    any request — see services/canvas.py's sync_courses_if_stale for why
    the chat pipeline never does this inline. Runs its own DB session per
    tick (the request-scoped session from get_db doesn't outlive a
    request, and this loop outlives all of them) and ticks at
    CANVAS_COURSE_SYNC_COOLDOWN_SECONDS — the same window
    sync_courses_if_stale's own per-connection cooldown uses, so most
    ticks do real Canvas work for whichever connections are actually due.
    One sweep failing outright (e.g. the DB is briefly unreachable) is
    logged and retried next tick, not fatal to the loop.

    Also deletes expired LLM response-cache rows so the table does not
    grow unbounded when keys are never looked up again.
    """
    from app.services.llm.response_cache import delete_expired_cache_entries

    while True:
        try:
            async with AsyncSessionLocal() as db:
                await run_course_sync_sweep(db)
                deleted = await delete_expired_cache_entries(db)
                if deleted:
                    await db.commit()
                    logger.info("llm_cache outcome=expired_cleanup deleted=%s", deleted)
                else:
                    await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("course sync sweep tick failed", exc_info=True)
        await asyncio.sleep(settings.CANVAS_COURSE_SYNC_COOLDOWN_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup if they don't exist. Must run before
    # run_pending_migrations below: on a genuinely fresh database (no
    # tables at all) an ALTER TABLE ... ADD COLUMN IF NOT EXISTS migration
    # fails outright because the table itself doesn't exist yet. Running
    # create_all() first means every current model's columns (including
    # ones later migrations also add, e.g. assignments.published) are
    # already present on a fresh table, so those migrations become no-ops.
    app.state.started_at = time.monotonic()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Catches an existing database up on any schema change
    # Base.metadata.create_all() above can't handle on its own — it only
    # creates missing tables, never ALTERs an existing one (see
    # core/migrations.py for what it deliberately never touches).
    await run_pending_migrations(engine)
    async with AsyncSessionLocal() as db:
        await seed_admin(db)
    # The periodic sweep races TestClient request handling (shared event
    # loop) and makes fetch_courses call-count assertions flaky — e.g.
    # test_sync_courses_if_stale_respects_cooldown. Tests that need a
    # sweep call run_course_sync_sweep directly.
    sync_task = (
        None
        if "pytest" in sys.modules
        else asyncio.create_task(_course_sync_loop())
    )
    yield
    # Clean up DB connections and the background sync loop on shutdown
    if sync_task is not None:
        sync_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sync_task
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(canvas.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)
app.include_router(chat.router, prefix=settings.API_V1_PREFIX)
app.include_router(llm.router, prefix=settings.API_V1_PREFIX)
app.include_router(messages.router, prefix=settings.API_V1_PREFIX)
app.include_router(history.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit.admin_router, prefix=settings.API_V1_PREFIX)
app.include_router(failed_operations.router, prefix=settings.API_V1_PREFIX)
app.include_router(message_templates.router, prefix=settings.API_V1_PREFIX)
app.include_router(troubleshoot.router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["root"])
async def root() -> dict[str, str]:
    return {"message": f"{settings.PROJECT_NAME} is running."}


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
