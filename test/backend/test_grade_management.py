from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.canvas import GradeUpdateRequest, SubmissionStatus
from app.services.grade_management import _build_grade_preview, preview_grade_update, submit_grade_update


def _submission():
    return SimpleNamespace(
        id=99,
        assignment_id=10,
        user_id=42,
        student_name="Coin",
        score=88,
        grade="88",
        status=SubmissionStatus.graded,
        points_possible=100,
    )


def _unsubmitted_submission():
    submission = _submission()
    submission.status = SubmissionStatus.unsubmitted
    submission.grade = None
    submission.score = None
    return submission


def test_feedback_only_preview_is_low_risk_and_keeps_grade_unchanged():
    preview = _build_grade_preview(
        SimpleNamespace(id=7, name="COSC 777"),
        GradeUpdateRequest(
            assignment_id=10,
            user_id=42,
            posted_grade="",
            reason="Work changes. You can do it.",
        ),
        _submission(),
    )

    assert preview.risk_level == "low"
    assert preview.requires_approval is False
    assert preview.rollback_available is False
    assert preview.proposed == {
        "posted_grade": "",
        "reason": "Work changes. You can do it.",
        "warnings": [],
    }
    assert preview.affected_resources[1]["changed_fields"] == ["feedback"]


def test_preview_requires_grade_or_feedback():
    with pytest.raises(HTTPException) as exc:
        _build_grade_preview(
            SimpleNamespace(id=7, name="COSC 777"),
            GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade=""),
            _submission(),
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "Enter a new grade or feedback before previewing."


@pytest.mark.parametrize(
    "posted_grade,detail",
    [
        ("-1", "Grade cannot be negative."),
        ("100000", "Grade is outside the supported range."),
        ("95\nEX", "Grade cannot contain line breaks or control characters."),
        ("<script>", "Grade contains unsupported characters."),
    ],
)
def test_preview_rejects_invalid_grade_payloads(posted_grade, detail):
    with pytest.raises(HTTPException) as exc:
        _build_grade_preview(
            SimpleNamespace(id=7, name="COSC 777"),
            GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade=posted_grade),
            _submission(),
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == detail


def test_preview_allows_bonus_grade_but_returns_server_warning():
    preview = _build_grade_preview(
        SimpleNamespace(id=7, name="COSC 777"),
        GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="110"),
        _submission(),
    )

    assert preview.proposed["posted_grade"] == "110"
    assert preview.proposed["warnings"] == [
        "This grade is above the assignment's 100 possible points; submit only if this is intentional bonus or adjusted grading."
    ]


def test_preview_warns_for_unsubmitted_submission_server_side():
    preview = _build_grade_preview(
        SimpleNamespace(id=7, name="COSC 777"),
        GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="88"),
        _unsubmitted_submission(),
    )

    assert preview.proposed["warnings"] == [
        "This student has no Canvas submission timestamp; only submit if offline, paper, or in-person work should be graded."
    ]


@pytest.mark.asyncio
async def test_grade_preview_authorization_stops_before_canvas_fetch():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1, canvas_connections=[])

    with patch("app.services.grade_management.fetch_submissions", new=AsyncMock()) as mock_fetch:
        with pytest.raises(HTTPException) as exc:
            await preview_grade_update(
                999,
                GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="95"),
                user,
                "https://canvas.ubc.ca",
                db,
            )

    assert exc.value.status_code == 404
    mock_fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_grade_submit_authorization_stops_before_canvas_mutation():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1, canvas_connections=[])

    with (
        patch("app.services.grade_management.fetch_submissions", new=AsyncMock()) as mock_fetch,
        patch("app.services.grade_management.update_submission_grade", new=AsyncMock()) as mock_update,
    ):
        with pytest.raises(HTTPException) as exc:
            await submit_grade_update(
                999,
                GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="95"),
                user,
                "https://canvas.ubc.ca",
                db,
            )

    assert exc.value.status_code == 404
    mock_fetch.assert_not_awaited()
    mock_update.assert_not_awaited()
