import html
import json
import re
from typing import Literal, cast

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.preview import QuizDraftRequest, QuizDraftResponse, QuizQuestionDraft
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
# Below this, an even split would round some question to zero, which
# _check_questions rejects outright ("points_possible must be greater than
# zero"). Let the questions define the total instead of forcing the split.
_MIN_QUESTION_POINTS = 0.01


def _reconcile_points(
    points_possible: float | None,
    questions: list[QuizQuestionDraft],
) -> tuple[float | None, list[QuizQuestionDraft]]:
    """Make the draft's total and its per-question points agree before anyone
    sees it.

    The generator used to return both numbers exactly as the model emitted
    them, with nothing tying them together. Regenerating a quiz — e.g. after
    editing one word of the description — produced a fresh, independent guess
    at per-question points, so a "50 points total" quiz could come back as five
    5-point questions summing to 25. Both validators then rejected it and the
    Review step disabled its own submit button, leaving the instructor stuck on
    a draft they could not approve and had not authored.

    Reconciling here rather than in the client keeps one answer for every entry
    point (form, assistant handoff, regeneration). The instructor is still free
    to redistribute afterwards; this only guarantees the *starting* draft is
    internally consistent.
    """
    if not questions:
        return points_possible, questions

    scored = sum(question.points_possible for question in questions)

    # No usable total: the questions define it.
    if points_possible is None or points_possible <= 0:
        return round(scored, 2), questions

    if abs(scored - points_possible) <= _POINTS_TOLERANCE:
        return points_possible, questions

    # Scale rather than split evenly, so a deliberately weighted quiz (one
    # 20-point essay among 5-point recall questions) keeps its shape.
    if scored > 0:
        factor = points_possible / scored
        scaled = [
            round(question.points_possible * factor, 2) for question in questions
        ]
    else:
        even = round(points_possible / len(questions), 2)
        scaled = [even] * len(questions)

    # Absorb the rounding drift in the last question so the sum is exact:
    # 50 over 3 becomes 16.67 / 16.67 / 16.66, not 16.67 * 3 = 50.01.
    scaled[-1] = round(points_possible - sum(scaled[:-1]), 2)

    if any(value < _MIN_QUESTION_POINTS for value in scaled):
        # The total cannot be represented across this many questions without
        # zeroing one out. The questions win; the instructor can still edit.
        return round(scored, 2), questions

    return points_possible, [
        question.model_copy(update={"points_possible": value})
        for question, value in zip(questions, scaled, strict=True)
    ]


async def generate_quiz_draft(body: QuizDraftRequest) -> QuizDraftResponse:
    system = (
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

    due_at = None
    if data.get("due_at"):
        normalized = normalize_due_date_to_utc_iso(str(data["due_at"]))
        try:
            due_at = parse_due_date(normalized)
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
