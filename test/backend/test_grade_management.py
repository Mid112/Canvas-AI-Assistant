from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.canvas import GradeUpdateRequest, SubmissionStatus
from app.services.grade_management import _build_grade_preview


def _submission():
    return SimpleNamespace(
        id=99,
        assignment_id=10,
        user_id=42,
        student_name="Coin",
        score=88,
        grade="88",
        status=SubmissionStatus.graded,
    )


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
