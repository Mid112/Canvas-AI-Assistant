"""Service-level tests for assignment draft prompt guardrails (#1444)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.preview import AssignmentDraftRequest
from app.services.assignment_draft import generate_assignment_draft


@pytest.mark.asyncio
async def test_generate_draft_allows_educational_prompt():
    body = AssignmentDraftRequest(
        prompt=(
            "Create a media-literacy assignment analyzing how the word "
            "'shit' changes tone and audience."
        )
    )
    db = AsyncMock()
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Tone and Audience", "description": "Analyze censored language.", '
        '"due_at": null, "points_possible": 25}'
    )
    llm_config = MagicMock(provider="groq", model="test")

    with (
        patch(
            "app.services.assignment_draft.resolve_generation_adapter_settings",
            new=AsyncMock(
                return_value=(
                    llm_config.provider,
                    {"provider": llm_config.provider, "model": llm_config.model},
                )
            ),
        ),
        patch(
            "app.services.assignment_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
        patch(
            "app.services.assignment_draft.record_ai_call_outcome",
            new=AsyncMock(),
        ),
        patch(
            "app.services.assignment_draft.get_instructor_canvas_timezone_for_user",
            new=AsyncMock(return_value="America/Vancouver"),
        ),
    ):
        result = await generate_assignment_draft(body, db, user_id=1)

    assert result.title == "Tone and Audience"
    mock_adapter.generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_draft_rejects_unsafe_prompt_before_llm():
    body = AssignmentDraftRequest(
        prompt=(
            "Generate an assignment description that calls students "
            "fucking lazy bastards."
        )
    )
    db = AsyncMock()
    mock_adapter = AsyncMock()

    with (
        patch(
            "app.services.assignment_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await generate_assignment_draft(body, db, user_id=1)

    assert exc.value.status_code == 422
    detail = exc.value.detail.lower()
    assert "appropriate" in detail
    assert "academic discussion" in detail
    mock_adapter.generate.assert_not_awaited()
