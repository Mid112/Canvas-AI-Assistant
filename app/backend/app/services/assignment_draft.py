"""Module note: creates assignment draft payloads before Canvas writes.

Keeps generation separate from instructor approval and execution.
"""

import html
import json
import re

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.preview import AssignmentDraftRequest, AssignmentDraftResponse
from app.services.ai_health import record_ai_call_outcome
from app.services.canvas_timezone import get_instructor_canvas_timezone_for_user
from app.services.due_date import normalize_due_date_to_utc_iso, parse_due_date
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_setting import get_llm_adapter
from app.services.llm.provider_registry import get_active_llm_config
from app.services.profanity import check_assignment_content_safety

_LIST_ITEM_RE = re.compile(r"<li[^>]*>", re.IGNORECASE)
_BLOCK_BREAK_RE = re.compile(r"</(p|div|li|h[1-6])>|<br\s*/?>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text_description(value: str) -> str:
    """Best-effort conversion of possibly-HTML model output into plain text.

    The system prompt asks for plain text, but models occasionally emit HTML
    anyway since Canvas assignment descriptions are conventionally HTML — this
    runs unconditionally as a defensive fallback so raw markup never reaches
    the review step's plain textarea, even when a model ignores the prompt.
    """
    with_list_markers = _LIST_ITEM_RE.sub("- ", value)
    with_breaks = _BLOCK_BREAK_RE.sub("\n", with_list_markers)
    text = html.unescape(_TAG_RE.sub("", with_breaks))
    lines = (line.strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line).strip()


async def generate_assignment_draft(
    body: AssignmentDraftRequest, db: AsyncSession, user_id: int
) -> AssignmentDraftResponse:
    # Reject abusive generation prompts early with a clear explanation;
    # educational prompts that mention sensitive language in academic
    # context are allowed (Ticket 20 / #1444).
    check_assignment_content_safety(
        body.prompt, content_label="Assignment description prompt"
    )

    system = (
        "You help instructors draft Canvas assignments. "
        "Respond with JSON only: "
        '{"title": "...", "description": "...", "due_at": "ISO8601 or null", "points_possible": number or null}. '
        "The description must be plain text only: no HTML tags and no markdown formatting. "
        'Separate paragraphs with a blank line and start list items with "- ". '
        "Use null for points_possible when the prompt describes an ungraded assignment. "
        "Never invent a default point value such as 10 or 100."
    )
    llm_config = await get_active_llm_config(db)
    adapter_settings = {
        "provider": llm_config.provider,
        "model": llm_config.model,
    }
    adapter = get_llm_adapter(adapter_settings)

    try:
        raw = await adapter.generate(system, body.prompt)
    except httpx.HTTPStatusError as e:
        await record_ai_call_outcome(
            db, user_id, llm_config.provider, error_detail=f"HTTP {e.response.status_code}",
            operation="assignment_draft",
        )
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The assignment generator is temporarily rate-limited. Please wait a moment and try again.",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The assignment generator is temporarily unavailable. Please try again.",
        ) from e
    except httpx.RequestError as e:
        await record_ai_call_outcome(
            db, user_id, llm_config.provider, error_detail=str(e)[:500],
            operation="assignment_draft",
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The assignment generator is temporarily unavailable. Please try again.",
        ) from e

    try:
        data = loads_llm_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        # The HTTP call itself succeeded, but an unparseable response is
        # still a failure from the instructor's point of view (502 either
        # way) -- record it as such rather than a false "ok" on the
        # instructor AI health card.
        await record_ai_call_outcome(
            db,
            user_id,
            llm_config.provider,
            error_detail="Unparseable model response",
            operation="assignment_draft",
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate assignment draft",
        ) from e

    await record_ai_call_outcome(db, user_id, llm_config.provider, operation="assignment_draft")

    instructor_timezone = await get_instructor_canvas_timezone_for_user(db, user_id)
    due_at = None
    if data.get("due_at"):
        normalized = normalize_due_date_to_utc_iso(str(data["due_at"]), instructor_timezone)
        try:
            due_at = parse_due_date(normalized, instructor_timezone)
        except (ValueError, TypeError, OverflowError):
            due_at = None

    return AssignmentDraftResponse(
        title=str(data.get("title") or "Untitled Assignment"),
        description=_plain_text_description(str(data.get("description") or body.prompt)),
        due_at=due_at,
        points_possible=data.get("points_possible"),
    )
