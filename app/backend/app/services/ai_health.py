from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_call_health import AiCallHealth


async def record_ai_call_outcome(
    db: AsyncSession,
    user_id: int,
    provider: str,
    error_detail: str | None = None,
) -> None:
    """Passively records the outcome of a real generate() call — never
    triggers an AI call itself, just observes one that already happened.
    One row per user, always the latest known outcome (not a log)."""
    stmt = pg_insert(AiCallHealth).values(
        user_id=user_id,
        provider=provider,
        status="failed" if error_detail else "ok",
        error_detail=error_detail,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={
            "provider": stmt.excluded.provider,
            "status": stmt.excluded.status,
            "error_detail": stmt.excluded.error_detail,
            "last_called_at": func.now(),
        },
    )
    await db.execute(stmt)
    await db.commit()
