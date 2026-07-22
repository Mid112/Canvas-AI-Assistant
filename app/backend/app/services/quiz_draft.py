import html
import json
import re
from datetime import datetime

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas.preview import QuizDraftRequest, QuizDraftResponse, QuizQuestionDraft
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_setting import get_llm_adapter

_LIST_ITEM_RE = re.compile(r"<li[^>]*>", re.IGNORECASE)
_BLOCK_BREAK_RE = re.compile(r"</(p|div|li|h[1-6])>|<br\s*/?>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(value: str) -> str:
    with_list_markers = _LIST_ITEM_RE.sub("- ", value)
    with_breaks = _BLOCK_BREAK_RE.sub("\n", with_list_markers)
    text = html.unescape(_TAG_RE.sub("", with_breaks))
    lines = (line.strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line).strip()


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
        "Include 3-5 questions when the prompt implies a quiz with questions. "
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
        try:
            due_at = datetime.fromisoformat(str(data["due_at"]).replace("Z", "+00:00"))
        except ValueError:
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
            points = item.get("points_possible")
            try:
                points_value = float(points) if points is not None else 1.0
            except (TypeError, ValueError):
                points_value = 1.0
            questions.append(
                QuizQuestionDraft(
                    question_text=text,
                    question_type=q_type,  # validated against the allowed set above
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

    return QuizDraftResponse(
        title=str(data.get("title") or "Untitled Quiz"),
        description=_plain_text(str(data.get("description") or body.prompt)),
        due_at=due_at,
        points_possible=data.get("points_possible"),
        allowed_attempts=allowed_attempts_value,
        time_limit=time_limit_value,
        questions=questions,
    )
