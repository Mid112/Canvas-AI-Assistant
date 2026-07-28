# app/backend/app/services/quiz_validation.py
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.services.course_access import get_owned_course_or_404
from app.services.profanity import check_message_profanity

MIN_QUIZ_DESCRIPTION_LENGTH = 20
ALLOWED_QUESTION_TYPES = frozenset(
    {
        "multiple_choice_question",
        "true_false_question",
        "short_answer_question",
        "essay_question",
    }
)


def _check_title(title: str) -> None:
    if not title or not title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quiz title cannot be empty.",
        )
    check_message_profanity(title, content_label="Quiz title")


def _check_description(description: str | None) -> None:
    if not description or not str(description).strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quiz description cannot be empty.",
        )
    if len(str(description).strip()) < MIN_QUIZ_DESCRIPTION_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Quiz description must be at least "
                f"{MIN_QUIZ_DESCRIPTION_LENGTH} characters."
            ),
        )
    check_message_profanity(str(description), content_label="Quiz description")


def _check_due_date(due_date: str) -> None:
    try:
        due_dt = datetime.fromisoformat(due_date)
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=UTC)
        if due_dt <= datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Due date must be in the future.",
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid due date format: {due_date}. Use ISO 8601, e.g. 2026-09-01T23:59:00.",
        )


def _check_points_possible(points_possible: float) -> None:
    if points_possible <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Points possible must be greater than zero.",
        )


def _check_allowed_attempts(allowed_attempts: int | None) -> None:
    if allowed_attempts is not None and allowed_attempts < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allowed attempts must be at least 1.",
        )


def _check_time_limit(time_limit: int | None) -> None:
    if time_limit is not None and time_limit < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Time limit must be at least 1 minute when set.",
        )


def _answer_weight(answer: dict) -> float:
    raw = answer.get("weight", answer.get("answer_weight", 0))
    try:
        return float(raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answer weights must be numbers.",
        ) from None


def _check_choice_answers(index: int, question_type: str, answers: list) -> None:
    label = f"Question {index + 1}"
    if not isinstance(answers, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} answers must be a list.",
        )

    if question_type == "true_false_question" and len(answers) != 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} true/false questions must have exactly 2 answers.",
        )
    if question_type == "multiple_choice_question" and len(answers) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} multiple-choice questions must have at least 2 answers.",
        )

    weights: list[float] = []
    for answer in answers:
        if not isinstance(answer, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{label} answers must be objects with text and weight.",
            )
        text = str(answer.get("text") or answer.get("answer_text") or "").strip()
        if not text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{label} has an answer with empty text.",
            )
        check_message_profanity(text, content_label=f"{label} answer text")
        weight = _answer_weight(answer)
        if weight not in (0.0, 100.0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{label} answer weights must be 0 or 100.",
            )
        weights.append(weight)

    correct_count = sum(1 for weight in weights if weight == 100.0)
    if correct_count != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{label} must mark exactly one correct answer "
                "(weight 100) and mark the rest incorrect (weight 0)."
            ),
        )


def _check_questions(questions: list[dict] | None) -> None:
    if not questions:
        return
    for index, question in enumerate(questions):
        if not isinstance(question, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {index + 1} is invalid.",
            )
        text = question.get("question_text")
        if not isinstance(text, str) or not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {index + 1} is missing question_text.",
            )
        check_message_profanity(
            text, content_label=f"Question {index + 1} text"
        )
        question_type = question.get("question_type", "essay_question")
        if question_type not in ALLOWED_QUESTION_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Question {index + 1} has an unsupported question_type "
                    f"'{question_type}'."
                ),
            )
        points = question.get("points_possible")
        if points is not None:
            try:
                if float(points) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Question {index + 1} points_possible must be greater than zero.",
                )
        answers = question.get("answers") or []
        if question_type in {
            "multiple_choice_question",
            "true_false_question",
        }:
            _check_choice_answers(index, question_type, answers)


def _check_question_bank_groups(
    quiz_engine: str, groups: list[dict] | None
) -> None:
    if not groups:
        return
    if quiz_engine != "classic":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question-bank groups are supported only for Classic Quizzes.",
        )
    for index, group in enumerate(groups):
        bank_id = group.get("bank_id") if isinstance(group, dict) else None
        pick_count = group.get("pick_count") if isinstance(group, dict) else None
        question_points = (
            group.get("question_points") if isinstance(group, dict) else None
        )
        if not isinstance(bank_id, int) or bank_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} has an invalid bank_id.",
            )
        if not isinstance(pick_count, int) or pick_count <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} pick_count must be positive.",
            )
        if not isinstance(question_points, int | float) or question_points <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} question_points must be positive.",
            )


def _check_has_scorable_content(
    questions: list[dict] | None,
    question_bank_groups: list[dict] | None,
) -> None:
    has_questions = bool(questions)
    has_banks = bool(question_bank_groups)
    if not has_questions and not has_banks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Quiz must include at least one question or one "
                "question-bank group."
            ),
        )


def _scored_points_total(
    questions: list[dict] | None,
    question_bank_groups: list[dict] | None,
) -> float:
    question_total = 0.0
    for question in questions or []:
        if not isinstance(question, dict):
            continue
        points = question.get("points_possible", 1.0)
        try:
            question_total += float(points if points is not None else 1.0)
        except (TypeError, ValueError):
            continue
    bank_total = 0.0
    for group in question_bank_groups or []:
        if not isinstance(group, dict):
            continue
        try:
            bank_total += float(group["pick_count"]) * float(
                group["question_points"]
            )
        except (KeyError, TypeError, ValueError):
            continue
    return question_total + bank_total


def _check_points_consistency(
    points_possible: float | None,
    questions: list[dict] | None,
    question_bank_groups: list[dict] | None,
) -> None:
    if points_possible is None:
        return
    scored = _scored_points_total(questions, question_bank_groups)
    if abs(scored - float(points_possible)) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Quiz points_possible ({points_possible}) must equal the "
                f"sum of question and question-bank points ({scored:g})."
            ),
        )


def short_answer_new_quiz_warnings(
    quiz_engine: str, questions: list[dict] | None
) -> list[str]:
    """Warn when Classic short-answer items will become essays in New Quizzes."""
    if quiz_engine != "new_quizzes" or not questions:
        return []
    count = sum(
        1
        for question in questions
        if isinstance(question, dict)
        and question.get("question_type") == "short_answer_question"
    )
    if count == 0:
        return []
    noun = "question" if count == 1 else "questions"
    return [
        (
            f"{count} short-answer {noun} will be created as instructor-scored "
            "essay items because Canvas New Quizzes has no Classic short-answer "
            "equivalent."
        )
    ]


async def validate_quiz_for_create(
    local_course_id: int,
    user: User,
    title: str,
    description: str | None,
    due_date: str | None,
    points_possible: float | None,
    db: AsyncSession,
    *,
    allowed_attempts: int | None = None,
    time_limit: int | None = None,
    questions: list[dict] | None = None,
    quiz_engine: str = "classic",
    question_bank_groups: list[dict] | None = None,
) -> Course:
    """Semantic validation before creating a Canvas quiz. Mirrors
    validate_assignment_for_create so the quiz preview/confirm path
    rejects incomplete or invalid proposals before any Canvas write."""

    course = await get_owned_course_or_404(local_course_id, user, db)

    _check_title(title)
    _check_description(description)

    if not due_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Due date is required for quizzes.",
        )
    _check_due_date(due_date)

    if points_possible is not None:
        _check_points_possible(points_possible)

    _check_allowed_attempts(allowed_attempts)
    _check_time_limit(time_limit)
    _check_has_scorable_content(questions, question_bank_groups)
    _check_questions(questions)
    _check_question_bank_groups(quiz_engine, question_bank_groups)
    _check_points_consistency(points_possible, questions, question_bank_groups)

    return course
