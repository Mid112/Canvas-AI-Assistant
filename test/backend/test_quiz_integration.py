from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import QuizQuestionCreate
from app.services.canvas import _new_quiz_item_payload
from integration_helpers import CANVAS_URL, register_with_canvas


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client
    app.state.limiter.enabled = True


def _quiz_payload(question_count: int = 2) -> dict:
    question_points = 10
    return {
        "title": "Recursion Quiz",
        "description": "Check understanding of recursive functions.",
        "due_at": "2030-09-01T23:59:00Z",
        "points_possible": question_points * question_count if question_count else 20,
        "allowed_attempts": 2,
        "time_limit": 30,
        "published": False,
        "questions": [
            {
                "question_text": f"Question {index + 1}",
                "question_type": "essay_question",
                "points_possible": question_points,
                "answers": [],
            }
            for index in range(question_count)
        ],
    }


def test_new_quiz_multiple_choice_item_preserves_correct_answer():
    item = _new_quiz_item_payload(
        QuizQuestionCreate(
            question_text="Which value is the base case?",
            question_type="multiple_choice_question",
            points_possible=5,
            answers=[
                {"text": "zero", "weight": 100},
                {"text": "infinity", "weight": 0},
            ],
        ),
        1,
    )

    assert item["entry"]["interaction_type_slug"] == "choice"
    assert item["entry"]["scoring_algorithm"] == "Equivalence"
    assert item["entry"]["scoring_data"]["value"] == (
        item["entry"]["interaction_data"]["choices"][0]["id"]
    )


def test_new_quiz_true_false_rejects_ambiguous_weights():
    with pytest.raises(HTTPException) as exc:
        _new_quiz_item_payload(
            QuizQuestionCreate(
                question_text="Recursion needs a base case?",
                question_type="true_false_question",
                points_possible=1,
                answers=[
                    {"text": "True", "weight": 0},
                    {"text": "False", "weight": 0},
                ],
            ),
            1,
        )
    assert exc.value.status_code == 422
    assert "exactly one correct answer" in exc.value.detail


def test_quiz_capabilities_reports_new_quizzes_availability(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizcaps")

    with patch(
        "app.services.canvas.probe_new_quizzes",
        new=AsyncMock(return_value=(True, None)),
    ):
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/capabilities"
            f"?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    assert response.json() == {
        "classic_quizzes": True,
        "new_quizzes": True,
        "question_banks": True,
        "preferred_engine": "new_quizzes",
        "new_quizzes_unavailable_reason": None,
    }


def test_question_banks_are_loaded_only_on_demand(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizbanks")
    with patch(
        "app.services.canvas.list_question_banks",
        new=AsyncMock(
            return_value=[
                {
                    "id": 31,
                    "title": "Recursion Bank",
                    "assessment_question_count": 12,
                }
            ]
        ),
    ) as list_banks:
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes/question-banks"
            f"?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    assert response.json() == [
        {"id": 31, "title": "Recursion Bank", "question_count": 12}
    ]
    list_banks.assert_awaited_once()


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

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200, history.json()
    workflows = history.json()["items"]
    assert any(
        item["action_name"] == "create_quiz"
        and item["status"] == "executed"
        and item["user_prompt"] == "Created via quiz creation form"
        for item in workflows
    )

    audit = client.get("/api/v1/audit/logs", headers=headers)
    assert audit.status_code == 200, audit.json()
    assert any(
        item["action"] == "create_quiz"
        and item["resource_type"] == "quiz"
        and item["resource_id"] == "555"
        and item["operation"] == "create"
        for item in audit.json()["items"]
    )


def test_classic_quiz_can_link_question_bank_group(client):
    headers, local_course_id = register_with_canvas(client, prefix="quizbankgroup")
    payload = {
        **_quiz_payload(question_count=0),
        "points_possible": 10,
        "quiz_engine": "classic",
        "question_bank_groups": [
            {
                "bank_id": 31,
                "bank_name": "Recursion Bank",
                "pick_count": 5,
                "question_points": 2,
            }
        ],
    }
    quiz_response = {
        "id": 557,
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
            "app.services.canvas.create_quiz_question_group",
            new=AsyncMock(return_value={"id": 8}),
        ) as create_group,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes"
            f"?canvas_url={CANVAS_URL}",
            json=payload,
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    assert response.json()["question_count"] == 5
    group_payload = create_group.await_args.args[2]
    assert group_payload["assessment_question_bank_id"] == 31
    assert group_payload["pick_count"] == 5


def test_create_new_quiz_uses_new_quizzes_items_api(client):
    headers, local_course_id = register_with_canvas(client, prefix="newquiz")
    payload = {**_quiz_payload(), "quiz_engine": "new_quizzes"}
    new_quiz_response = {
        "assignment_id": 880,
        "title": "Recursion Quiz",
        "instructions": "Check understanding of recursive functions.",
        "points_possible": 20,
    }

    with (
        patch(
            "app.services.canvas.probe_new_quizzes",
            new=AsyncMock(return_value=(True, None)),
        ),
        patch(
            "app.services.canvas.create_new_quiz",
            new=AsyncMock(return_value=new_quiz_response),
        ) as create_new,
        patch(
            "app.services.canvas.create_new_quiz_item",
            new=AsyncMock(return_value={"id": 1}),
        ) as create_item,
        patch(
            "app.services.canvas.create_quiz",
            new_callable=AsyncMock,
        ) as create_classic,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes"
            f"?canvas_url={CANVAS_URL}",
            json=payload,
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] == 880
    assert response.json()["quiz_engine"] == "new_quizzes"
    assert create_item.await_count == 2
    assert create_new.await_args.args[1]["instructions"].startswith(
        "Check understanding"
    )
    create_classic.assert_not_awaited()


def test_new_quiz_unavailable_fails_without_classic_fallback(client):
    headers, local_course_id = register_with_canvas(client, prefix="newquizoff")
    payload = {**_quiz_payload(), "quiz_engine": "new_quizzes"}

    with (
        patch(
            "app.services.canvas.probe_new_quizzes",
            new=AsyncMock(
                return_value=(
                    False,
                    "This Canvas instance does not expose the New Quizzes API.",
                )
            ),
        ),
        patch(
            "app.services.canvas.create_new_quiz",
            new_callable=AsyncMock,
        ) as create_new,
        patch(
            "app.services.canvas.create_quiz",
            new_callable=AsyncMock,
        ) as create_classic,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/quizzes"
            f"?canvas_url={CANVAS_URL}",
            json=payload,
            headers=headers,
        )

    assert response.status_code == 422
    assert "does not expose" in response.json()["detail"]
    create_new.assert_not_awaited()
    create_classic.assert_not_awaited()


def test_new_quiz_rejects_classic_question_bank_groups(client):
    headers, local_course_id = register_with_canvas(client, prefix="newquizbank")
    payload = {
        **_quiz_payload(),
        "quiz_engine": "new_quizzes",
        "question_bank_groups": [
            {
                "bank_id": 31,
                "bank_name": "Recursion Bank",
                "pick_count": 5,
                "question_points": 2,
            }
        ],
    }

    response = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/quizzes/preview"
        f"?canvas_url={CANVAS_URL}",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 422
    assert "Classic" in response.json()["detail"]


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
