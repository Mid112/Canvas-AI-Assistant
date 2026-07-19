from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import CANVAS_URL, register_with_canvas


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client
    app.state.limiter.enabled = True


def _quiz_payload(question_count: int = 2) -> dict:
    return {
        "title": "Recursion Quiz",
        "description": "Check understanding of recursive functions.",
        "due_at": "2030-09-01T23:59:00Z",
        "points_possible": 20,
        "allowed_attempts": 2,
        "time_limit": 30,
        "published": False,
        "questions": [
            {
                "question_text": f"Question {index + 1}",
                "question_type": "essay_question",
                "points_possible": 10,
                "answers": [],
            }
            for index in range(question_count)
        ],
    }


def test_quiz_preview_is_simplified_and_never_writes(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizpreview")

    with patch(
        "app.services.canvas.create_quiz", new_callable=AsyncMock
    ) as create_quiz:
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/preview"
            f"?canvas_url={CANVAS_URL}",
            json=_quiz_payload(),
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["action"] == "create_quiz"
    assert "Recursion Quiz" in body["summary"]
    assert "2 questions" in body["summary"]
    assert body["risk_level"] == "medium"
    assert body["reversible"] is True
    assert any(item["type"] == "quiz" for item in body["affected_resources"])
    create_quiz.assert_not_awaited()


def test_create_quiz_creates_quiz_and_questions(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizcreate")
    quiz_response = {
        "id": 555,
        "title": "Recursion Quiz",
        "description": "Check understanding of recursive functions.",
        "due_at": "2030-09-01T23:59:00Z",
        "points_possible": 20,
        "course_id": 999,
        "quiz_type": "assignment",
        "allowed_attempts": 2,
        "time_limit": 30,
        "published": False,
    }

    with (
        patch(
            "app.services.canvas.create_quiz",
            new=AsyncMock(return_value=quiz_response),
        ) as create_quiz,
        patch(
            "app.services.canvas.create_quiz_question",
            new=AsyncMock(return_value={"id": 1}),
        ) as create_question,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes"
            f"?canvas_url={CANVAS_URL}",
            json=_quiz_payload(),
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] == 555
    assert response.json()["question_count"] == 2
    assert create_question.await_count == 2
    canvas_payload = create_quiz.await_args.args[1]
    assert "questions" not in canvas_payload
    assert canvas_payload["published"] is False


def test_question_failure_removes_incomplete_quiz(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizcleanup")
    quiz_response = {
        "id": 556,
        "title": "Recursion Quiz",
        "course_id": 999,
        "published": False,
    }

    with (
        patch(
            "app.services.canvas.create_quiz",
            new=AsyncMock(return_value=quiz_response),
        ),
        patch(
            "app.services.canvas.create_quiz_question",
            new=AsyncMock(
                side_effect=HTTPException(status_code=502, detail="Canvas failed")
            ),
        ),
        patch(
            "app.services.canvas.delete_quiz", new=AsyncMock(return_value={})
        ) as delete_quiz,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes"
            f"?canvas_url={CANVAS_URL}",
            json=_quiz_payload(question_count=1),
            headers=headers,
        )

    assert response.status_code == 502
    delete_quiz.assert_awaited_once()


def test_quiz_preview_and_create_share_validation(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizvalidate")
    invalid = {**_quiz_payload(), "due_at": "2020-01-01T00:00:00Z"}

    preview = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/quizzes/preview"
        f"?canvas_url={CANVAS_URL}",
        json=invalid,
        headers=headers,
    )
    create = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/quizzes"
        f"?canvas_url={CANVAS_URL}",
        json=invalid,
        headers=headers,
    )

    assert preview.status_code == 422
    assert create.status_code == 422
    assert preview.json()["detail"] == create.json()["detail"]
