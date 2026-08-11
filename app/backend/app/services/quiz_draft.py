import html
import json
import re
from typing import Any, Literal, cast

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas.preview import QuizDraftRequest, QuizDraftResponse, QuizQuestionDraft
from app.services.canvas_timezone import get_instructor_canvas_timezone_for_user
from app.services.due_date import normalize_due_date_to_utc_iso, parse_due_date
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_setting import get_llm_adapter

QuizQuestionType = Literal[
    "multiple_choice_question",
    "true_false_question",
    "short_answer_question",
    "essay_question",
]

_LIST_ITEM_RE = re.compile(r"<li[^>]*>", re.IGNORECASE)
_BLOCK_BREAK_RE = re.compile(r"</(p|div|li|h[1-6])>|<br\s*/?>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(value: str) -> str:
    with_list_markers = _LIST_ITEM_RE.sub("- ", value)
    with_breaks = _BLOCK_BREAK_RE.sub("\n", with_list_markers)
    text = html.unescape(_TAG_RE.sub("", with_breaks))
    lines = (line.strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line).strip()


# Both validators reject a quiz whose per-question points don't add up to the
# total: services/quiz_validation.py's _check_points_consistency and the
# client's quizCreateSchema superRefine, both at a 0.01 tolerance.
_POINTS_TOLERANCE = 0.01


def _reconcile_points(
    points_possible: float | None,
    questions: list[QuizQuestionDraft],
) -> tuple[float | None, list[QuizQuestionDraft]]:
    """Make the draft's total and its per-question points agree before anyone
    sees it.

    Policy (Ticket 14): preserve per-question point values — including
    multi-point weights — and realign quiz ``points_possible`` to their sum
    when the model returns a missing, non-positive, or inconsistent total.
    Scaling questions up/down to a mismatched quiz total would erase the
    multi-point values instructors asked for.

    Reconciling here rather than only in the client keeps one answer for every
    entry point (form, assistant handoff, regeneration). The instructor can
    still redistribute afterwards; this only guarantees the *starting* draft is
    internally consistent.
    """
    if not questions:
        return points_possible, questions

    scored = round(sum(question.points_possible for question in questions), 2)

    # No usable total, or total does not match the scored questions: questions
    # define the quiz total. Do not rewrite question points.
    if (
        points_possible is None
        or points_possible <= 0
        or abs(scored - points_possible) > _POINTS_TOLERANCE
    ):
        return scored, questions

    return points_possible, questions


QUIZ_DRAFT_SYSTEM_PROMPT = (
    "You help instructors draft Canvas quizzes. "
        "Respond with JSON only: "
        '{"title": "...", "description": "...", "due_at": "ISO8601 or null", '
        '"points_possible": number or null, "allowed_attempts": number or null, '
        '"time_limit": minutes or null, '
        '"questions": [{"question_text": "...", "question_type": '
        '"multiple_choice_question"|"true_false_question"|"short_answer_question"|"essay_question", '
        '"points_possible": number, "answers": [{"text": "...", "weight": 100 or 0}]}]}. '
        "Honour the number of questions the prompt asks for; when it does not "
        "say, include 3-5 questions if it implies a quiz with questions. "
        "Per-question points_possible may be greater than 1 (for example 2, 5, or 10) "
        "when the prompt implies multi-point items — never force every question to 1. "
        "The per-question points_possible values MUST add up exactly to the "
        "quiz's points_possible. If the prompt names a total, divide it across "
        "the questions rather than inventing a different total. "
        "For multiple_choice_question and true_false_question, set weight 100 on the "
        "correct answer and 0 on incorrect ones. "
    "Description and question_text must be plain text only."
)

# Same split as assignment_draft's: the quiz review form is reached with a
# prompt an instructor wrote, a chat turn may carry no topic at all, and a
# quiz invented from nothing looks finished. See the comment there.
CHAT_QUIZ_DRAFT_SYSTEM_PROMPT = (
    f"{QUIZ_DRAFT_SYSTEM_PROMPT} "
    "If the request does not say what the quiz is about — "
    '"make a quiz" and nothing more — return {"title": "", "description": ""}. '
    "Do not invent a topic, a placeholder title such as \"New Quiz\", or "
    "filler questions. Returning empty is correct and expected here."
)


async def draft_quiz_content(prompt: str, *, adapter: Any) -> tuple[str, str]:
    """A title and description written from the instructor's own words.

    The quiz half of draft_assignment_content — see that docstring for why
    this reads the whole request instead of one field at a time. Only the
    title and description are taken here: questions, point splits and time
    limits belong to the quiz review form, where the instructor can see and
    change each one before anything reaches Canvas.

    Never raises. Both values come back empty on any failure and the caller
    keeps what it had.
    """
    try:
        raw = await adapter.generate(CHAT_QUIZ_DRAFT_SYSTEM_PROMPT, prompt)
        data = loads_llm_json(raw)
    except Exception:
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    title = str(data.get("title") or "").strip()
    description = _plain_text(str(data.get("description") or "")).strip()
    return title, description


async def generate_quiz_draft(
    body: QuizDraftRequest, db: AsyncSession, user_id: int
) -> QuizDraftResponse:
    system = QUIZ_DRAFT_SYSTEM_PROMPT
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})

    try:
        raw = await adapter.generate(system, body.prompt)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The quiz generator is temporarily rate-limited. Please wait a moment and try again.",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The quiz generator is temporarily unavailable. Please try again.",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The quiz generator is temporarily unavailable. Please try again.",
        ) from e

    try:
        data = loads_llm_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate quiz draft",
        ) from e

    # Same instructor timezone the assignment draft uses. Without it a
    # generated quiz due date was read as UTC wall clock, so it disagreed with
    # an assignment generated from the identical instruction.
    instructor_timezone = await get_instructor_canvas_timezone_for_user(db, user_id)
    due_at = None
    if data.get("due_at"):
        normalized = normalize_due_date_to_utc_iso(
            str(data["due_at"]), instructor_timezone
        )
        try:
            due_at = parse_due_date(normalized, instructor_timezone)
        except (ValueError, TypeError, OverflowError):
            due_at = None

    questions: list[QuizQuestionDraft] = []
    raw_questions = data.get("questions") or []
    if isinstance(raw_questions, list):
        for item in raw_questions:
            if not isinstance(item, dict):
                continue
            text = _plain_text(str(item.get("question_text") or ""))
            if not text:
                continue
            answers = []
            for answer in item.get("answers") or []:
                if not isinstance(answer, dict):
                    continue
                answer_text = str(answer.get("text") or "").strip()
                if not answer_text:
                    continue
                weight = answer.get("weight", 0)
                try:
                    weight_value = float(weight)
                except (TypeError, ValueError):
                    weight_value = 0.0
                answers.append({"text": answer_text, "weight": weight_value})
            q_type = str(item.get("question_type") or "essay_question")
            if q_type not in {
                "multiple_choice_question",
                "true_false_question",
                "short_answer_question",
                "essay_question",
            }:
                q_type = "essay_question"
            question_type = cast(QuizQuestionType, q_type)
            points = item.get("points_possible")
            try:
                points_value = float(points) if points is not None else 1.0
            except (TypeError, ValueError):
                points_value = 1.0
            # Preserve multi-point values from the model; only fall back when
            # missing/invalid. Never clamp down to 1 (Ticket 14).
            if points_value <= 0:
                points_value = 1.0
            questions.append(
                QuizQuestionDraft(
                    question_text=text,
                    question_type=question_type,
                    points_possible=points_value,
                    answers=answers,
                )
            )

    allowed_attempts = data.get("allowed_attempts")
    try:
        allowed_attempts_value = int(allowed_attempts) if allowed_attempts is not None else None
    except (TypeError, ValueError):
        allowed_attempts_value = None

    time_limit = data.get("time_limit")
    try:
        time_limit_value = int(time_limit) if time_limit is not None else None
    except (TypeError, ValueError):
        time_limit_value = None

    raw_points = data.get("points_possible")
    requested_total: float | None
    try:
        requested_total = float(raw_points) if raw_points is not None else None
    except (TypeError, ValueError):
        requested_total = None
    # Reconcile so multi-point questions stay consistent with the quiz total
    # (Ticket 14) without inventing a mismatched total the review form rejects.
    total_points, questions = _reconcile_points(requested_total, questions)

    return QuizDraftResponse(
        title=str(data.get("title") or "Untitled Quiz"),
        description=_plain_text(str(data.get("description") or body.prompt)),
        due_at=due_at,
        points_possible=total_points,
        allowed_attempts=allowed_attempts_value,
        time_limit=time_limit_value,
        questions=questions,
    )
