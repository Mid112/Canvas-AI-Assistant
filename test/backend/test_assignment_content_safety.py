"""Unit tests for assignment-scoped content safety (#1444)."""

import pytest
from fastapi import HTTPException

from app.services.profanity import (
    check_assignment_content_safety,
    text_contains_unsafe_assignment_content,
)


@pytest.mark.parametrize(
    "text",
    [
        "Create a recursion assignment covering base cases and recursive calls.",
        "Draft an assignment on workplace communication that contrasts "
        "professional language with profanity.",
        "Write an English assignment that asks students to discuss a censored "
        "quote containing the word 'shit'.",
        "Create a media-literacy assignment analyzing how the word 'fuck' "
        "changes tone and audience.",
        "Discuss the term shit in archival workplace communication samples.",
    ],
)
def test_educational_assignment_text_is_allowed(text):
    assert text_contains_unsafe_assignment_content(text) is False
    check_assignment_content_safety(text, content_label="Assignment description")


@pytest.mark.parametrize(
    "text",
    [
        "Complete this fucking worksheet.",
        "You are all lazy bastards — rewrite the lab.",
        "This assignment is for shitty students only.",
        # Educational keyword elsewhere must not greenlight abuse (#1524 P1).
        "Complete this fucking worksheet analyzing recursion.",
        "Analyze recursion, then call students lazy bastards.",
    ],
)
def test_abusive_assignment_text_is_rejected(text):
    assert text_contains_unsafe_assignment_content(text) is True
    with pytest.raises(HTTPException) as exc:
        check_assignment_content_safety(text, content_label="Assignment description")
    assert exc.value.status_code == 422
    detail = exc.value.detail.lower()
    assert "appropriate" in detail
    assert "academic discussion" in detail
