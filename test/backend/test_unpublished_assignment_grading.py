"""Grading an unpublished assignment: refused up front, and named correctly.

Two defects reported together from one session. Canvas will not accept a grade
or a submission comment on an unpublished assignment, but nothing checked that
before the write — the instructor filled in a grade, confirmed a preview, and
only then saw an error. Worse, Canvas reports that refusal as a 401, which was
mapped unconditionally to "Invalid Canvas API token", so the message told them
to reconnect a token that was working perfectly.

Deliberately DB-free: both fixes are pure decisions (which HTTP error a Canvas
response means, and whether a mirrored assignment may be written to), so they
are driven directly rather than through the endpoint stack.
"""
import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.integrations.canvas import _raise_for_canvas_error
from app.services.canvas import require_published_assignment, require_writable_course

CANVAS_URL = "https://canvas.example.edu"


def _canvas_401(payload: dict | None = None, text: str = "") -> httpx.Response:
    request = httpx.Request("PUT", f"{CANVAS_URL}/api/v1/courses/1/assignments/2/submissions/3")
    if payload is not None:
        return httpx.Response(401, json=payload, request=request)
    return httpx.Response(401, text=text, request=request)


class _FakeDb:
    """Stands in for the session: require_published_assignment does one read."""

    def __init__(self, row):
        self._row = row

    async def scalar(self, _stmt):
        return self._row


# ---------------------------------------------------------------------------
# Which kind of 401 was it?
# ---------------------------------------------------------------------------


# The reported symptom. This is the body Canvas returns when a valid token
# grades an unpublished assignment; calling it a token problem sends the
# instructor to Settings to fix something that is not broken.
@pytest.mark.requirement("FR2.6")
def test_permission_401_is_not_reported_as_an_invalid_token():
    response = _canvas_401(
        {
            "status": "unauthorized",
            "errors": [{"message": "user not authorized to perform that action"}],
        }
    )

    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(response)

    assert excinfo.value.status_code == 403
    assert "Invalid Canvas API token" not in excinfo.value.detail
    assert "not authorized to perform that action" in excinfo.value.detail


# The other half still has to work: troubleshoot.py and failed_operations.py
# both classify a token problem by this exact prefix to offer the reconnect
# path, so a genuinely bad token must keep the wording.
@pytest.mark.requirement("FR1.8")
def test_genuine_token_401_still_says_invalid_token():
    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(_canvas_401({"errors": [{"message": "Invalid access token."}]}))

    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "Invalid Canvas API token"


# A proxy that swallows the body leaves nothing to classify. Of the two
# guesses, "your token was rejected" points at something checkable.
@pytest.mark.requirement("FR1.8")
def test_401_with_no_usable_body_stays_a_token_error():
    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(_canvas_401(None, text=""))

    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "Invalid Canvas API token"


# ---------------------------------------------------------------------------
# The pre-write guard
# ---------------------------------------------------------------------------

_COURSE = SimpleNamespace(id=1, workflow_state="available")


# Named, actionable, and raised before any Canvas call — so there is no
# partial state to reason about and nothing was typed for nothing.
@pytest.mark.requirement("FR2.6")
def test_unpublished_assignment_is_refused_and_named():
    db = _FakeDb(SimpleNamespace(published=False, title="Draft Lab"))

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(require_published_assignment(db, _COURSE, 4242))

    assert excinfo.value.status_code == 400
    assert "Draft Lab" in excinfo.value.detail
    assert "unpublished" in excinfo.value.detail
    assert "Invalid Canvas API token" not in excinfo.value.detail


@pytest.mark.requirement("FR2.6")
def test_published_assignment_is_allowed_through():
    db = _FakeDb(SimpleNamespace(published=True, title="Real Lab"))

    asyncio.run(require_published_assignment(db, _COURSE, 1))


# The mirror is a cache. A just-created assignment may not be in it yet, and
# blocking on a cache miss would refuse writes Canvas would have accepted.
@pytest.mark.requirement("FR2.6")
def test_assignment_missing_from_the_local_mirror_is_allowed():
    asyncio.run(require_published_assignment(_FakeDb(None), _COURSE, 999))


# An unpublished course is a draft, not a finished one. "This course has
# concluded" described the opposite situation and hid the one-click fix.
@pytest.mark.requirement("FR2.6")
def test_unpublished_course_is_not_described_as_concluded():
    with pytest.raises(HTTPException) as excinfo:
        require_writable_course(SimpleNamespace(id=1, workflow_state="unpublished"))

    assert "unpublished" in excinfo.value.detail
    assert "concluded" not in excinfo.value.detail


@pytest.mark.requirement("FR2.6")
def test_concluded_course_keeps_its_own_wording():
    with pytest.raises(HTTPException) as excinfo:
        require_writable_course(SimpleNamespace(id=1, workflow_state="completed"))

    assert "concluded" in excinfo.value.detail
