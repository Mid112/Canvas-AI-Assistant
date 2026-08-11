import json

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.schemas.preview import FeedbackDraftRequest, FeedbackDraftResponse
from app.services.feedback_validation import (
    verify_assignment_in_course,
    verify_canvas_student_in_course,
)
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_setting import get_llm_adapter

FEEDBACK_DRAFT_SYSTEM_PROMPT = (
    "You help instructors draft Canvas submission feedback. "
    "Respond with JSON only: "
    '{"new_grade": "letter or number", "feedback": "plain text comment"}. '
    "The feedback must be constructive, specific, and suitable to post as "
    "a Canvas submission comment. Address the learner in second person "
    "('you') and never invent or include a student name, email, or login."
)

# The chat variant writes a comment and nothing else. The form's prompt asks
# for a grade alongside it, which is right there — the instructor is looking
# at one submission and deciding what it is worth — and wrong here, where the
# same request may cover a whole band of students who already have different
# marks. A single invented grade applied across them would overwrite real
# results, so this one is told to leave it alone.
CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT = (
    "You help instructors write Canvas submission feedback. "
    'Respond with JSON only: {"feedback": "plain text comment"}. '
    "Write the comment the instructor described, in their voice, ready to "
    "post as-is. Address the learner in second person ('you'). Never name a "
    "student, never mention a score or a grade, and never write anything that "
    "assumes which student is reading it — the same comment may go to several "
    "people at once. "
    "If the request does not say what the feedback should convey, return "
    '{"feedback": ""} rather than inventing praise or criticism.'
)


async def draft_feedback_comment(prompt: str, *, adapter) -> str:
    """A submission comment written from the instructor's own words.

    Chat had no way to reach the feedback generator: "give encouraging
    feedback to students who scored 70-96" resolved the three students
    correctly and then handed the Grades tab an empty comment box, because
    nothing turned the request into the comment it described.

    Never raises and never invents. On any failure — or on a request with
    nothing to say — this returns "" and the instructor writes the comment
    themselves on the form, exactly as before.
    """
    try:
        raw = await adapter.generate(CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT, prompt)
        data = loads_llm_json(raw)
    except Exception:
        return ""
    if not isinstance(data, dict):
        return ""
    return str(data.get("feedback") or "").strip()


async def generate_feedback_draft(
    local_course_id: int,
    body: FeedbackDraftRequest,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> FeedbackDraftResponse:
    await verify_assignment_in_course(
        local_course_id, body.assignment_id, user, canvas_url, db
    )
    await verify_canvas_student_in_course(
        local_course_id, body.student_id, user, canvas_url, db
    )

    if not body.assignment_name or not body.student_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Assignment and student context are required before generating "
                "feedback."
            ),
        )

    system = FEEDBACK_DRAFT_SYSTEM_PROMPT
    # Do not send student names/emails/logins to the LLM (#908). Keep only
    # assignment context and the instructor's prompt; the UI still receives
    # student_name back from the request body for display.
    context = (
        f"Assignment: {body.assignment_name}\n"
        "Learner: selected enrolled student (do not name them)\n"
        f"Current grade: {body.current_grade or 'not provided'}\n"
        f"Instructor request: {body.prompt}"
    )
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})

    try:
        raw = await adapter.generate(system, context)
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "The feedback generator is temporarily rate-limited. "
                    "Please wait a moment and try again."
                ),
            ) from error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The feedback generator is temporarily unavailable.",
        ) from error
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The feedback generator is temporarily unavailable.",
        ) from error

    try:
        data = loads_llm_json(raw)
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Could not generate feedback draft. Try adding more detail about "
                "what the student did well or should improve."
            ),
        ) from error

    new_grade = str(data.get("new_grade") or "").strip()
    feedback = str(data.get("feedback") or "").strip()
    if not new_grade or not feedback:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Need more context to draft feedback. Include the assignment, "
                "student, and what you want the comment to cover."
            ),
        )

    return FeedbackDraftResponse(
        assignment_id=body.assignment_id,
        student_id=body.student_id,
        assignment_name=body.assignment_name,
        student_name=body.student_name,
        new_grade=new_grade,
        feedback=feedback,
        current_grade=body.current_grade,
    )
