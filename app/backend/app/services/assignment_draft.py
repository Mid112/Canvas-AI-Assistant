import html
import json
import re
from datetime import datetime

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.preview import AssignmentDraftRequest, AssignmentDraftResponse
from app.services.llm.json_extraction import extract_json_object
from app.services.llm.llm_setting import get_llm_adapter

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


async def generate_assignment_draft(body: AssignmentDraftRequest) -> AssignmentDraftResponse:
    system = (
        "You help instructors draft Canvas assignments. "
        "Respond with JSON only: "
        '{"title": "...", "description": "...", "due_at": "ISO8601 or null", "points_possible": number or null}. '
        "The description must be plain text only: no HTML tags and no markdown formatting. "
        'Separate paragraphs with a blank line and start list items with "- ".'
    )
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})

    try:
        raw = await adapter.generate(system, body.prompt)
    except httpx.HTTPStatusError as e:
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
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The assignment generator is temporarily unavailable. Please try again.",
        ) from e

    try:
        data = json.loads(extract_json_object(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate assignment draft",
        ) from e

    due_at = None
    if data.get("due_at"):
        try:
            due_at = datetime.fromisoformat(str(data["due_at"]).replace("Z", "+00:00"))
        except ValueError:
            due_at = None

    return AssignmentDraftResponse(
        title=str(data.get("title") or "Untitled Assignment"),
        description=_plain_text_description(str(data.get("description") or body.prompt)),
        due_at=due_at,
        points_possible=data.get("points_possible"),
    )
