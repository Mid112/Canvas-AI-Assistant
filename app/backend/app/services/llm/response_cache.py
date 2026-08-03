from __future__ import annotations

import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_response_cache import LlmResponseCache

logger = logging.getLogger(__name__)

# Conservative indicators that a request may contain personal, credential, or
# student-specific information. This is a best-effort defense-in-depth filter —
# paraphrasing can bypass it — so caching also requires a fresh conversation
# with no course/pending context, and cache keys remain per-user. Do not treat
# these patterns as the sole safeguard against storing sensitive content.
_SENSITIVE_PATTERNS = (
    re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b(?:password|token|api[\s_-]?key|secret|credential)\b", re.I),
    re.compile(r"\b(?:students?|grades?|scores?|submissions?|missing|late)\b", re.I),
    re.compile(r"\b\d{7,}\b"),
)


def is_safe_cache_candidate(
    message: str,
    *,
    has_history: bool,
    local_course_id: int | None,
    conversation_course_id: int | None,
    pending_message_id: int | None,
) -> bool:
    if has_history or local_course_id or conversation_course_id or pending_message_id:
        return False
    stripped = message.strip()
    if not stripped or len(stripped) > 500:
        return False
    return not any(pattern.search(stripped) for pattern in _SENSITIVE_PATTERNS)


def is_safe_cache_response(response: str) -> bool:
    stripped = response.strip()
    if not stripped or len(stripped) > 8_000:
        return False
    return not any(pattern.search(stripped) for pattern in _SENSITIVE_PATTERNS)


def build_cache_key(
    *,
    user_id: int,
    provider: str,
    model: str,
    system_prompt: str,
    llm_message: str,
) -> str:
    payload = "\0".join([str(user_id), provider, model, system_prompt, llm_message.strip()])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_cached_response(
    db: AsyncSession,
    *,
    cache_key: str,
    user_id: int,
) -> str | None:
    now = datetime.now(UTC)
    row = await db.scalar(
        select(LlmResponseCache).where(
            LlmResponseCache.cache_key == cache_key,
            LlmResponseCache.user_id == user_id,
        )
    )
    if row is None:
        return None
    if row.expires_at <= now:
        await db.delete(row)
        await db.flush()
        return None
    logger.info("llm_cache outcome=hit provider=%s", row.provider)
    return row.response


async def store_cached_response(
    db: AsyncSession,
    *,
    user_id: int,
    cache_key: str,
    provider: str,
    model: str,
    response: str,
    ttl_seconds: int,
) -> None:
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=ttl_seconds)
    statement = (
        insert(LlmResponseCache)
        .values(
            user_id=user_id,
            cache_key=cache_key,
            provider=provider,
            model=model,
            response=response,
            created_at=now,
            expires_at=expires_at,
        )
        # Prefer column inference over a named constraint so this works when the
        # table was created from db/init (UNIQUE without CONSTRAINT name) or from
        # SQLAlchemy metadata (named uq_llm_response_cache_key).
        .on_conflict_do_update(
            index_elements=["cache_key"],
            set_={
                "provider": provider,
                "model": model,
                "response": response,
                "created_at": now,
                "expires_at": expires_at,
            },
        )
    )
    await db.execute(statement)
    logger.info("llm_cache outcome=stored provider=%s", provider)


async def delete_expired_cache_entries(db: AsyncSession) -> int:
    result = await db.execute(delete(LlmResponseCache).where(LlmResponseCache.expires_at <= datetime.now(UTC)))
    return cast(CursorResult, result).rowcount or 0
