import html
import json
import re
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.secret_redaction import safe_exception_text
from app.schemas.preview import AssignmentDraftRequest, AssignmentDraftResponse
from app.services.ai_health import record_ai_call_outcome
from app.services.canvas_timezone import get_instructor_canvas_timezone_for_user
from app.services.due_date import normalize_due_date_to_utc_iso, parse_due_date
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_connections import resolve_generation_adapter_settings
from app.services.llm.llm_setting import get_llm_adapter
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


ASSIGNMENT_DRAFT_SYSTEM_PROMPT = (
    "You help instructors draft Canvas assignments. "
    "Respond with JSON only: "
    '{"title": "...", "description": "...", "due_at": "ISO8601 or null", "points_possible": number or null}. '
    "The description must be plain text only: no HTML tags and no markdown formatting. "
    'Separate paragraphs with a blank line and start list items with "- ". '
    "Use null for points_possible when the prompt describes an ungraded assignment. "
    "Never invent a default point value such as 10 or 100."
)

# The describe step and a chat turn ask for different things, and the
# difference only shows up on an empty request.
#
# The describe step is reached by an instructor who typed a description and
# pressed a button: there is always something to work from, and returning
# nothing would be a broken feature. A chat turn can carry no subject matter
# at all — "can you create an assignment?" — and the shared prompt above,
# having never been told otherwise, answered it with a title of "New
# Assignment" over three invented tasks about "the assigned reading". That
# reached the preview looking like a finished draft of an assignment nobody
# had described.
#
# So: produce nothing rather than something fake. An empty draft lands the
# instructor on the describe step, which is where a request with no
# description belongs.
_NOTHING_TO_DRAFT_FROM = (
    "If the request does not say what the assignment is about — "
    '"create an assignment" and nothing more — return {"title": "", '
    '"description": ""}. Do not invent a topic, a placeholder title such as '
    '"New Assignment", or filler tasks such as "review the assigned reading". '
    "Returning empty is correct and expected here; a made-up draft is not, "
    "because it looks finished and gets published."
)

CHAT_ASSIGNMENT_DRAFT_SYSTEM_PROMPT = (
    f"{ASSIGNMENT_DRAFT_SYSTEM_PROMPT} {_NOTHING_TO_DRAFT_FROM}"
)


async def draft_assignment_content(prompt: str, *, adapter: Any) -> tuple[str, str]:
    """A title and description written from the instructor's own words.

    The same generator the create page's describe step uses, reachable from
    a chat turn. Chat used to have no way to call it: it collected fields by
    interrogation instead, asking "What should the assignment description
    say?" about a request that had already said it.

    Reads the whole request at once rather than one field at a time, which
    is the point — "an assignment called September 11th due next Friday"
    only parses if something decides which phrase is the name and which is
    the date, and that decision is exactly what a field-by-field question
    cannot make.

    Never raises, and never fabricates: on any failure — and on a request
    that names no subject matter at all — both values come back empty and the
    caller keeps whatever it already had. An assignment with a thin
    description is a nuisance the instructor fixes in the form; an assignment
    whose description was invented wholesale is worse, because it looks
    finished.
    """
    try:
        raw = await adapter.generate(CHAT_ASSIGNMENT_DRAFT_SYSTEM_PROMPT, prompt)
        data = loads_llm_json(raw)
    except Exception:
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    title = str(data.get("title") or "").strip()
    description = _plain_text_description(str(data.get("description") or "")).strip()
    return title, description


async def generate_assignment_draft(
    body: AssignmentDraftRequest, db: AsyncSession, user_id: int
) -> AssignmentDraftResponse:
    # Reject abusive generation prompts early with a clear explanation;
    # educational prompts that mention sensitive language in academic
    # context are allowed (Ticket 20 / #1444).
    check_assignment_content_safety(
        body.prompt, content_label="Assignment description prompt"
    )

    system = ASSIGNMENT_DRAFT_SYSTEM_PROMPT
    # Same resolution as a chat turn: the instructor's chosen provider, with
    # their stored key decrypted and attached. Building settings straight from
    # the deployment config here meant the generator ran on the admin's
    # provider with no credentials at all.
    try:
        provider, adapter_settings = await resolve_generation_adapter_settings(
            db,
            user_id,
            body.model_settings.model_dump(exclude_none=True)
            if body.model_settings
            else None,
        )
    except (KeyError, ValueError) as e:
        # Not connected, or a key the provider has since rejected. That is the
        # instructor's setup to fix, and build_adapter_settings already words
        # it for them — a 502 would blame the generator for it instead.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=safe_exception_text(e),
        ) from e
    adapter = get_llm_adapter(adapter_settings)

    try:
        raw = await adapter.generate(system, body.prompt)
    except httpx.HTTPStatusError as e:
        await record_ai_call_outcome(
            db, user_id, provider, error_detail=f"HTTP {e.response.status_code}",
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
            db, user_id, provider, error_detail=str(e)[:500],
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
            provider,
            error_detail="Unparseable model response",
            operation="assignment_draft",
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate assignment draft",
        ) from e

    await record_ai_call_outcome(db, user_id, provider, operation="assignment_draft")

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
