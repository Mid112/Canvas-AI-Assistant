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
    assert data["points_possible"] == 20
    assert data["allowed_attempts"] == 2
    assert data["time_limit"] == 30
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "What is a base case?"


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


def _draft(client, headers, payload: str, prompt: str = "Create a quiz about cell biology for my class"):
    """Runs the generator with a canned model response."""
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = payload
    with (
        patch(
            "app.services.course_access.get_owned_course_or_404",
            new=AsyncMock(return_value=object()),
        ),
        patch("app.services.quiz_draft.get_llm_adapter", return_value=mock_adapter),
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/quizzes/generate-draft",
            json={"prompt": prompt},
            headers=headers,
        )
    assert response.status_code == 200, response.text
    return response.json()


def _questions_payload(points: list[float], total) -> str:
    items = ", ".join(
        '{"question_text": "Q%d", "question_type": "multiple_choice_question", '
        '"points_possible": %s, "answers": [{"text": "a", "weight": 100}, '
        '{"text": "b", "weight": 0}]}' % (index, value)
        for index, value in enumerate(points)
    )
    return (
        '{"title": "Chapter 5 Review", "description": "Cell biology review quiz.", '
        f'"due_at": null, "points_possible": {total}, "allowed_attempts": 1, '
        f'"time_limit": 30, "questions": [{items}]}}'
    )


# Verifies: the reported bug. Regenerating a "50 points total" quiz produced
# five 5-point questions summing to 25, which both validators then rejected —
# leaving the instructor on a Review step whose submit button was disabled.
def test_generate_quiz_draft_reconciles_points_to_the_requested_total(client):
    headers, _ = _register(client)

    data = _draft(client, headers, _questions_payload([5, 5, 5, 5, 5], 50))

    assert data["points_possible"] == 50
    assert [q["points_possible"] for q in data["questions"]] == [10, 10, 10, 10, 10]


# Verifies: reconciliation scales rather than flattening, so a deliberately
# weighted quiz (one heavy question among light ones) keeps its shape.
def test_generate_quiz_draft_preserves_relative_weighting(client):
    headers, _ = _register(client)

    data = _draft(client, headers, _questions_payload([20, 5, 5, 5, 5], 50))

    points = [q["points_possible"] for q in data["questions"]]
    assert points == [25, 6.25, 6.25, 6.25, 6.25]
    assert sum(points) == 50


# Verifies: a total that does not divide evenly still sums exactly, rather
# than leaving a rounding residue that trips the 0.01 consistency tolerance.
def test_generate_quiz_draft_distributes_uneven_totals_exactly(client):
    headers, _ = _register(client)

    data = _draft(client, headers, _questions_payload([1, 1, 1], 50))

    points = [q["points_possible"] for q in data["questions"]]
    assert points == [16.67, 16.67, 16.66]
    assert round(sum(points), 2) == 50


# Verifies: with no total from the model, the questions define it rather than
# the draft arriving with points_possible unset.
def test_generate_quiz_draft_without_a_total_uses_the_question_sum(client):
    headers, _ = _register(client)

    data = _draft(client, headers, _questions_payload([7, 8], "null"))

    assert data["points_possible"] == 15


# Verifies the invariant that matters: whatever the model returns, the draft
# the instructor receives must satisfy the validator that guards the create.
# Without reconciliation the generator could emit a draft its own backend
# would refuse.
def test_generated_draft_always_satisfies_points_consistency(client):
    from app.services.quiz_validation import _check_points_consistency

    headers, _ = _register(client)

    for points, total in ([5, 5, 5, 5, 5], 50), ([1, 1, 1], 50), ([3, 4], "null"):
        data = _draft(client, headers, _questions_payload(points, total))
        _check_points_consistency(
            data["points_possible"],
            [{"points_possible": q["points_possible"]} for q in data["questions"]],
            None,
        )
