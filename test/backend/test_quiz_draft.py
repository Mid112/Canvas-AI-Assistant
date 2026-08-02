import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> tuple[dict, str]:
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, email


def test_generate_quiz_draft_success(client):
    headers, _ = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Recursion Quiz", "description": "Cover base cases and recursion.", '
        '"due_at": null, "points_possible": 20, "allowed_attempts": 2, '
        '"time_limit": 30, "questions": ['
        '{"question_text": "What is a base case?", "question_type": "essay_question", '
        '"points_possible": 5, "answers": []}]}'
    )

    with (
        patch(
            "app.services.course_access.get_owned_course_or_404",
            new=AsyncMock(return_value=object()),
        ),
        patch("app.services.quiz_draft.get_llm_adapter", return_value=mock_adapter),
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/quizzes/generate-draft",
            json={"prompt": "Create a quiz on recursion with essay questions"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Recursion Quiz"
    # Ticket 14: quiz total is realigned to the scored question sum when the
    # model returns an inconsistent points_possible.
    assert data["points_possible"] == 5
    assert data["allowed_attempts"] == 2
    assert data["time_limit"] == 30
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "What is a base case?"
    assert data["questions"][0]["points_possible"] == 5


# Verifies: Ticket 14 — multi-point questions are preserved and quiz total
# is aligned to the sum when the model returns an inconsistent total.
def test_generate_quiz_draft_preserves_multi_point_questions(client):
    headers, _ = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Weighted Quiz", "description": "Uses multi-point questions.", '
        '"due_at": null, "points_possible": 100, "allowed_attempts": 1, '
        '"time_limit": null, "questions": ['
        '{"question_text": "Essay on recursion", "question_type": "essay_question", '
        '"points_possible": 5, "answers": []},'
        '{"question_text": "Short definition", "question_type": "short_answer_question", '
        '"points_possible": 2, "answers": []},'
        '{"question_text": "True or false?", "question_type": "true_false_question", '
        '"points_possible": 3, "answers": [{"text": "True", "weight": 100}, '
        '{"text": "False", "weight": 0}]}]}'
    )

    with (
        patch(
            "app.services.course_access.get_owned_course_or_404",
            new=AsyncMock(return_value=object()),
        ),
        patch("app.services.quiz_draft.get_llm_adapter", return_value=mock_adapter),
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/quizzes/generate-draft",
            json={"prompt": "Create a quiz with multi-point questions on recursion"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert [q["points_possible"] for q in data["questions"]] == [5, 2, 3]
    assert data["points_possible"] == 10


def test_generate_quiz_draft_rejects_unowned_course(client):
    headers, _ = _register(client)

    response = client.post(
        "/api/v1/canvas/courses/999999/quizzes/generate-draft",
        json={"prompt": "Create a quiz on recursion with essay questions"},
        headers=headers,
    )

    assert response.status_code == 404
    assert "belong" in response.json()["detail"].lower()


def test_generate_quiz_draft_rejects_non_instructor_role(client):
    headers, email = _register(client)

    import asyncio

    from sqlalchemy import select

    from app.config import settings
    from app.models.user import User

    async def _demote():
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                user = await db.scalar(select(User).where(User.email == email))
                assert user is not None
                user.role = "admin"
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(_demote())

    response = client.post(
        "/api/v1/canvas/courses/1/quizzes/generate-draft",
        json={"prompt": "Create a quiz on recursion with essay questions"},
        headers=headers,
    )

    assert response.status_code == 403
