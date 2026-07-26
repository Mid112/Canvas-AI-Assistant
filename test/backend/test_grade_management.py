from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.audit_log import AuditLog
from app.models.grade_history import GradeHistory
from app.models.workflow import Workflow
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


def test_feedback_only_preview_is_medium_risk_and_keeps_grade_unchanged():
    # Covers the feedback-only path: a Canvas submission comment should not be
    # treated like a high-risk grade mutation or change the posted grade.
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

    assert preview.risk_level == "medium"
    assert preview.requires_approval is False
    assert preview.rollback_available is False
    assert preview.proposed == {
        "posted_grade": "",
        "reason": "Work changes. You can do it.",
        "warnings": [],
    }
    assert preview.affected_resources[1]["changed_fields"] == ["feedback"]


def test_preview_requires_grade_or_feedback():
    # Covers the shared validation rule for empty previews/submits. The backend
    # rejects "do nothing" payloads instead of relying on the frontend form.
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
    # Covers server-side grade format/range validation for unsafe or malformed
    # posted grades before Canvas is contacted.
    with pytest.raises(HTTPException) as exc:
        _build_grade_preview(
            SimpleNamespace(id=7, name="COSC 777"),
            GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade=posted_grade),
            _submission(),
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == detail


def test_preview_allows_bonus_grade_but_returns_server_warning():
    # Covers the product decision for over-max scores: allow intentional bonus
    # grades, but surface the warning from the backend as part of the preview.
    preview = _build_grade_preview(
        SimpleNamespace(id=7, name="COSC 777"),
        GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="110"),
        _submission(),
    )

    assert preview.proposed["posted_grade"] == "110"
    assert preview.rollback_available is False
    assert "manual correction" in preview.rollback_message
    assert preview.proposed["warnings"] == [
        "This grade is above the assignment's 100 possible points; submit only if this is intentional bonus or adjusted grading."
    ]


def test_preview_warns_for_unsubmitted_submission_server_side():
    # Covers unsubmitted rows on the backend so bulk grade warnings are not only
    # enforced by the Grades tab UI.
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
    # Proves course authorization for grade preview: an instructor who does not
    # own the local course gets a 404 and never reaches the Canvas fetch.
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
    # Proves course authorization for grade submit: unauthorized requests stop
    # before both read-side Canvas fetches and write-side Canvas mutations.
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


@pytest.mark.asyncio
async def test_grade_submit_records_workflow_audit_and_history_in_one_commit():
    # Covers direct Grades tab auditing: successful Canvas writes create a
    # workflow row, grade history row, and admin audit row before one DB commit.
    db = AsyncMock()
    db.add = MagicMock()
    added = []

    def add_row(row):
        added.append(row)

    async def flush_rows():
        for row in added:
            if isinstance(row, Workflow) and row.id is None:
                row.id = 501
            if isinstance(row, GradeHistory) and row.id is None:
                row.id = 601

    db.add.side_effect = add_row
    db.flush = AsyncMock(side_effect=flush_rows)
    user = SimpleNamespace(id=1)
    course = SimpleNamespace(
        id=7,
        name="COSC 777",
        canvas_course_id="77",
        canvas_url="https://canvas.ubc.ca",
    )
    raw_submission = {
        "id": 99,
        "assignment_id": 10,
        "user_id": 42,
        "workflow_state": "graded",
        "score": 95,
        "grade": "95",
        "user": {"name": "Coin"},
    }

    with (
        patch(
            "app.services.grade_management._find_submission",
            new=AsyncMock(return_value=(course, "token", _submission())),
        ),
        patch(
            "app.services.grade_management.update_submission_grade",
            new=AsyncMock(return_value=raw_submission),
        ),
    ):
        result = await submit_grade_update(
            7,
            GradeUpdateRequest(
                assignment_id=10,
                user_id=42,
                posted_grade="95",
                reason="Rubric correction",
            ),
            user,
            "https://canvas.ubc.ca",
            db,
        )

    workflow = next(row for row in added if isinstance(row, Workflow))
    history = next(row for row in added if isinstance(row, GradeHistory))
    audit = next(row for row in added if isinstance(row, AuditLog))
    assert result.history_id == 601
    assert workflow.status == "executed"
    assert workflow.action_name == "update_grade"
    assert history.rollback_available is False
    assert audit.workflow_id == 501
    assert audit.resource_type == "submission"
    assert audit.before_data["student_canvas_id"] == 42
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_grade_submit_rolls_back_when_history_or_audit_commit_fails():
    # Covers the orphan-state guard: if persistence fails after Canvas returns,
    # the pending workflow/history/audit transaction is rolled back and surfaced.
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock(side_effect=RuntimeError("database unavailable"))
    user = SimpleNamespace(id=1)
    course = SimpleNamespace(
        id=7,
        name="COSC 777",
        canvas_course_id="77",
        canvas_url="https://canvas.ubc.ca",
    )
    raw_submission = {
        "id": 99,
        "assignment_id": 10,
        "user_id": 42,
        "workflow_state": "graded",
        "score": 95,
        "grade": "95",
    }

    with (
        patch(
            "app.services.grade_management._find_submission",
            new=AsyncMock(return_value=(course, "token", _submission())),
        ),
        patch(
            "app.services.grade_management.update_submission_grade",
            new=AsyncMock(return_value=raw_submission),
        ),
    ):
        with pytest.raises(RuntimeError, match="database unavailable"):
            await submit_grade_update(
                7,
                GradeUpdateRequest(assignment_id=10, user_id=42, posted_grade="95"),
                user,
                "https://canvas.ubc.ca",
                db,
            )

    db.rollback.assert_awaited_once()
