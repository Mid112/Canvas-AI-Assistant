"""Integration tests for the feedback workflow (#1116–#1119)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.student import StudentResponse
from integration_helpers import CANVAS_URL, register_with_canvas


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client
    app.state.limiter.enabled = True


def _feedback_payload(**overrides):
    payload = {
        "assignment_id": 44,
        "student_id": 77,
        "assignment_name": "Recursion Homework",
        "student_name": "Alex Chen",
        "new_grade": "85",
        "feedback": "Strong work on the base case explanation.",
    }
    payload.update(overrides)
    return payload


def _enrolled_student(local_course_id: int) -> StudentResponse:
    return StudentResponse(
        id=1,
        canvas_user_id="77",
        course_id=local_course_id,
        name="Alex Chen",
        enrollment_state="active",
    )


# Verifies: Feedback preview returns risk metadata for structured edits (#1118).
def test_feedback_preview_structured_edit(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_preview")
    enrolled = _enrolled_student(local_course_id)

    with patch(
        "app.services.feedback_validation.get_students",
        new_callable=AsyncMock,
        return_value=[enrolled],
    ):
        preview = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback/preview?canvas_url={CANVAS_URL}",
            json=_feedback_payload(new_grade="90", feedback="Excellent recursion trace."),
            headers=headers,
        )

    assert preview.status_code == 200, preview.json()
    body = preview.json()
    assert body["action"] == "update_grade"
    assert body["risk_level"] in {"low", "medium", "high"}
    assert "90" in body["summary"] or "grade" in body["summary"].lower()


# Verifies: Approved feedback posts to Canvas (#1116).
def test_feedback_post_success(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_post")
    enrolled = _enrolled_student(local_course_id)
    submission = {"id": 9001, "posted_grade": "85"}

    with (
        patch(
            "app.services.feedback_validation.get_students",
            new_callable=AsyncMock,
            return_value=[enrolled],
        ),
        patch(
            "app.services.canvas.update_submission_grade",
            new_callable=AsyncMock,
            return_value=submission,
        ) as mock_grade,
    ):
        posted = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback?canvas_url={CANVAS_URL}",
            json=_feedback_payload(),
            headers=headers,
        )

    assert posted.status_code == 200, posted.json()
    assert posted.json()["submission_id"] == 9001
    mock_grade.assert_awaited_once()


# Verifies: Posted feedback appears in workflow history (#1117).
def test_feedback_post_records_workflow_history(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_hist")
    enrolled = _enrolled_student(local_course_id)

    with (
        patch(
            "app.services.feedback_validation.get_students",
            new_callable=AsyncMock,
            return_value=[enrolled],
        ),
        patch(
            "app.services.canvas.update_submission_grade",
            new_callable=AsyncMock,
            return_value={"id": 9002, "posted_grade": "85"},
        ),
    ):
        posted = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback?canvas_url={CANVAS_URL}",
            json=_feedback_payload(),
            headers=headers,
        )
    assert posted.status_code == 200, posted.json()

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200, history.json()
    actions = {item.get("action_name") for item in history.json()["items"]}
    assert "update_grade" in actions


# Verifies: Missing context returns clarification-style errors (#1114, #1115, #1119).
def test_feedback_generate_draft_missing_context(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_clarify")
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"new_grade": "", "feedback": ""}'

    with (
        patch(
            "app.services.feedback_draft.verify_canvas_student_in_course",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.feedback_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback/generate-draft",
            json={
                "prompt": "Draft encouraging feedback about recursion clarity.",
                "assignment_id": 44,
                "student_id": 77,
                "assignment_name": "Recursion Homework",
                "student_name": "Alex Chen",
            },
            headers=headers,
        )

    assert response.status_code == 422
    assert "context" in response.json()["detail"].lower()


def test_feedback_generate_draft_llm_failure_returns_clarification(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_llm")
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = "not-json"

    with (
        patch(
            "app.services.feedback_draft.verify_canvas_student_in_course",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.feedback_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback/generate-draft",
            json={
                "prompt": "Draft encouraging feedback about recursion clarity.",
                "assignment_id": 44,
                "student_id": 77,
                "assignment_name": "Recursion Homework",
                "student_name": "Alex Chen",
            },
            headers=headers,
        )

    assert response.status_code == 502
    assert "detail" in response.json()["detail"].lower()


# Verifies: Unauthorized students are rejected before posting (#871).
def test_feedback_post_rejects_student_outside_roster(client):
    headers, local_course_id = register_with_canvas(client, prefix="fb_roster")

    with patch(
        "app.services.feedback_validation.get_students",
        new_callable=AsyncMock,
        return_value=[],
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/feedback?canvas_url={CANVAS_URL}",
            json=_feedback_payload(student_id=999),
            headers=headers,
        )

    assert response.status_code == 403
