"""Ticket 13 — quiz publish/unpublish and quiz-native workflows.

These tests deliberately avoid assignment publish endpoints so quiz flows
cannot silently regress into assignment-only logic.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import QuizResponse
from app.services.canvas import quiz_gradebook_assignment_id
from integration_helpers import CANVAS_URL, register_with_canvas


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client
    app.state.limiter.enabled = True


def _classic_quiz(quiz_id: int, **overrides) -> dict:
    base = {
        "id": quiz_id,
        "assignment_id": quiz_id + 1000,
        "title": "Recursion Quiz",
        "description": None,
        "due_at": None,
        "points_possible": 20,
        "quiz_type": "assignment",
        "allowed_attempts": 1,
        "time_limit": None,
        "published": False,
        "question_count": 2,
        "html_url": None,
    }
    return {**base, **overrides}


def _new_quiz(assignment_id: int, **overrides) -> dict:
    base = {
        "id": assignment_id,
        "assignment_id": assignment_id,
        "title": "New Quizzes Midterm",
        "instructions": "Use New Quizzes",
        "due_at": None,
        "points_possible": 30,
        "published": False,
        "question_count": 3,
        "html_url": None,
    }
    return {**base, **overrides}


# Verifies: list merges classic + New Quizzes and tags engines correctly.
def test_list_quizzes_merges_classic_and_new_quizzes(client):
    headers, local_course_id = register_with_canvas(client)
    classic_id = uuid.uuid4().int % 10_000_000
    new_id = classic_id + 1

    with (
        patch(
            "app.services.canvas.list_quizzes",
            new_callable=AsyncMock,
            return_value=[_classic_quiz(classic_id, published=True)],
        ),
        patch(
            "app.services.canvas.list_new_quizzes",
            new_callable=AsyncMock,
            return_value=[_new_quiz(new_id, published=False)],
        ),
    ):
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    by_engine = {item["quiz_engine"]: item for item in payload}
    assert by_engine["classic"]["id"] == classic_id
    assert by_engine["classic"]["assignment_id"] == classic_id + 1000
    assert by_engine["classic"]["published"] is True
    assert by_engine["new_quizzes"]["id"] == new_id
    assert by_engine["new_quizzes"]["assignment_id"] == new_id
    assert by_engine["new_quizzes"]["published"] is False


# Verifies: classic publish uses Quizzes PUT, not Assignments PUT.
def test_publish_classic_quiz_uses_quiz_api(client):
    headers, local_course_id = register_with_canvas(client)
    quiz_id = uuid.uuid4().int % 10_000_000

    with (
        patch(
            "app.services.canvas.fetch_quiz",
            new_callable=AsyncMock,
            return_value=_classic_quiz(quiz_id, published=False),
        ),
        patch(
            "app.services.canvas.update_quiz",
            new_callable=AsyncMock,
            return_value=_classic_quiz(quiz_id, published=True),
        ) as mock_update_quiz,
        patch(
            "app.services.canvas.update_assignment",
            new_callable=AsyncMock,
        ) as mock_update_assignment,
    ):
        response = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/{quiz_id}/publish"
            f"?canvas_url={CANVAS_URL}&quiz_engine=classic",
            json={"published": True},
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["published"] is True
    assert response.json()["quiz_engine"] == "classic"
    mock_update_quiz.assert_awaited_once()
    assert mock_update_quiz.await_args.args[2] == {"published": True}
    mock_update_assignment.assert_not_awaited()


# Verifies: New Quizzes publish uses New Quizzes PATCH, not classic Quizzes PUT.
def test_publish_new_quiz_uses_new_quizzes_api(client):
    headers, local_course_id = register_with_canvas(client)
    assignment_id = uuid.uuid4().int % 10_000_000

    with (
        patch(
            "app.services.canvas.fetch_new_quiz",
            new_callable=AsyncMock,
            return_value=_new_quiz(assignment_id, published=False),
        ),
        patch(
            "app.services.canvas.update_new_quiz",
            new_callable=AsyncMock,
            return_value=_new_quiz(assignment_id, published=True),
        ) as mock_update_new,
        patch(
            "app.services.canvas.update_quiz",
            new_callable=AsyncMock,
        ) as mock_update_classic,
    ):
        response = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/{assignment_id}/publish"
            f"?canvas_url={CANVAS_URL}&quiz_engine=new_quizzes",
            json={"published": True},
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["published"] is True
    assert response.json()["quiz_engine"] == "new_quizzes"
    mock_update_new.assert_awaited_once()
    assert mock_update_new.await_args.args[2] == {"published": True}
    mock_update_classic.assert_not_awaited()


# Verifies: Canvas unpublish refusals are explained for quizzes.
def test_unpublish_quiz_explains_canvas_refusal(client):
    headers, local_course_id = register_with_canvas(client)
    quiz_id = uuid.uuid4().int % 10_000_000

    with (
        patch(
            "app.services.canvas.fetch_quiz",
            new_callable=AsyncMock,
            return_value=_classic_quiz(quiz_id, published=True),
        ),
        patch(
            "app.services.canvas.update_quiz",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Canvas API error: 400 - Can't unpublish if there are student submissions",
            ),
        ),
    ):
        response = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/{quiz_id}/publish"
            f"?canvas_url={CANVAS_URL}&quiz_engine=classic",
            json={"published": False},
            headers=headers,
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail.startswith("Canvas refused to unpublish this quiz.")
    assert "student submissions" in detail


# Verifies: marking must use linked assignment_id, not classic quiz id.
def test_quiz_gradebook_assignment_id_prefers_linked_assignment():
    classic = QuizResponse(
        id=5,
        assignment_id=99,
        title="Classic",
        course_id=1,
        quiz_engine="classic",
    )
    new_quiz = QuizResponse(
        id=77,
        assignment_id=77,
        title="New",
        course_id=1,
        quiz_engine="new_quizzes",
    )
    orphan = QuizResponse(
        id=5,
        assignment_id=None,
        title="Orphan classic",
        course_id=1,
        quiz_engine="classic",
    )

    assert quiz_gradebook_assignment_id(classic) == 99
    assert quiz_gradebook_assignment_id(new_quiz) == 77
    with pytest.raises(HTTPException) as exc:
        quiz_gradebook_assignment_id(orphan)
    assert exc.value.status_code == 400
    assert "linked gradebook assignment" in exc.value.detail
