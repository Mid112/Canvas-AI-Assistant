import json
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_submissions, update_submission_grade
from app.models.grade_history import GradeHistory
from app.models.user import User
from app.schemas.canvas import GradePreviewResponse, GradeUpdateRequest, GradeUpdateResponse
from app.services.canvas import (
    _fill_submission_contact_fields,
    _parse_submission,
    get_owned_course,
    require_canvas_token,
    require_writable_course,
)

IRREVERSIBLE_GRADE_WARNING = (
    "Grade changes are high risk because Canvas updates the student's official record immediately."
)
ROLLBACK_MESSAGE = (
    "Rollback is available while the previous grade is recorded in history; restore it manually if needed."
)
FEEDBACK_ONLY_WARNING = (
    "Feedback only is low risk because it adds a Canvas comment without changing the official grade."
)
FEEDBACK_ONLY_ROLLBACK_MESSAGE = (
    "No grade rollback is needed because this action does not change the student's grade."
)


async def _find_submission(
    *,
    local_course_id: int,
    body: GradeUpdateRequest,
    user: User,
    canvas_url: str,
    db: AsyncSession,
):
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    token = require_canvas_token(user, course.canvas_url)
    raw_submissions = await fetch_submissions(
        int(course.canvas_course_id),
        body.assignment_id,
        token,
        course.canvas_url,
    )
    parsed = [_parse_submission(raw) for raw in raw_submissions]
    await _fill_submission_contact_fields(parsed, token, course.canvas_url)
    submission = next((item for item in parsed if item.user_id == body.user_id), None)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found for this assignment and student.",
        )
    return course, token, submission


def _submission_from_snapshot(body: GradeUpdateRequest):
    snapshot = body.current_submission
    if not isinstance(snapshot, dict):
        return None
    if _coerce_int(snapshot.get("user_id")) != body.user_id:
        return None
    if _coerce_int(snapshot.get("assignment_id")) != body.assignment_id:
        return None
    return _SnapshotSubmission(
        id=_coerce_int(snapshot.get("id")) or body.user_id,
        assignment_id=body.assignment_id,
        user_id=body.user_id,
        student_name=snapshot.get("student_name"),
        score=snapshot.get("score"),
        grade=snapshot.get("grade"),
        status=str(snapshot.get("status") or "unknown"),
    )


class _SnapshotSubmission:
    def __init__(
        self,
        *,
        id: int,
        assignment_id: int,
        user_id: int,
        student_name: str | None,
        score,
        grade: str | None,
        status: str,
    ):
        self.id = id
        self.assignment_id = assignment_id
        self.user_id = user_id
        self.student_name = student_name
        self.score = score
        self.grade = grade
        self.status = status


def _coerce_int(value) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_grade_preview(course, body: GradeUpdateRequest, submission) -> GradePreviewResponse:
    proposed_grade = body.posted_grade.strip()
    feedback = (body.reason or "").strip()
    feedback_only = not proposed_grade and bool(feedback)
    if not proposed_grade and not feedback:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Enter a new grade or feedback before previewing.",
        )
    current_grade = submission.grade if submission.grade is not None else "ungraded"
    student_name = submission.student_name or f"Canvas user {submission.user_id}"
    summary = (
        f"Send feedback to {student_name} on assignment {body.assignment_id} "
        "without changing the grade."
        if feedback_only
        else (
            f"Update {student_name}'s grade on assignment {body.assignment_id} "
            f"from {current_grade} to {proposed_grade}."
        )
    )
    return GradePreviewResponse(
        risk_level="low" if feedback_only else "high",
        requires_approval=not feedback_only,
        irreversible_warning=FEEDBACK_ONLY_WARNING if feedback_only else IRREVERSIBLE_GRADE_WARNING,
        rollback_available=not feedback_only,
        rollback_message=FEEDBACK_ONLY_ROLLBACK_MESSAGE if feedback_only else ROLLBACK_MESSAGE,
        summary=summary,
        current={
            "grade": submission.grade,
            "score": submission.score,
            "status": submission.status.value if hasattr(submission.status, "value") else submission.status,
            "student_name": submission.student_name,
            "student_canvas_id": submission.user_id,
        },
        proposed={
            "posted_grade": proposed_grade,
            "reason": feedback or None,
        },
        affected_resources=[
            {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
            {
                "type": "submission",
                "id": submission.id,
                "name": student_name,
                "status": "modified",
                "changed_fields": ["feedback"] if feedback_only else ["grade", *([] if not feedback else ["feedback"])],
            },
        ],
    )


async def preview_grade_update(
    local_course_id: int,
    body: GradeUpdateRequest,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> GradePreviewResponse:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    submission = _submission_from_snapshot(body)
    if submission is None:
        course, _, submission = await _find_submission(
            local_course_id=local_course_id,
            body=body,
            user=user,
            canvas_url=canvas_url,
            db=db,
        )
    return _build_grade_preview(course, body, submission)


async def submit_grade_update(
    local_course_id: int,
    body: GradeUpdateRequest,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> GradeUpdateResponse:
    course, token, submission = await _find_submission(
        local_course_id=local_course_id,
        body=body,
        user=user,
        canvas_url=canvas_url,
        db=db,
    )
    preview = _build_grade_preview(course, body, submission)
    proposed_grade = body.posted_grade.strip()
    feedback = (body.reason or "").strip()
    feedback_only = not proposed_grade and bool(feedback)
    raw = await update_submission_grade(
        int(course.canvas_course_id),
        body.assignment_id,
        body.user_id,
        proposed_grade or None,
        token,
        feedback or None,
        course.canvas_url,
    )
    updated = _parse_submission(raw)
    history = GradeHistory(
        user_id=user.id,
        course_id=course.id,
        assignment_id=str(body.assignment_id),
        student_canvas_id=str(body.user_id),
        previous_grade=submission.grade,
        previous_score=submission.score,
        new_grade=proposed_grade or submission.grade or "unchanged",
        reason=feedback or None,
        risk_level="low" if feedback_only else "high",
        rollback_available=not feedback_only,
        canvas_response=json.loads(json.dumps(raw, default=_json_default)),
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)
    return GradeUpdateResponse(
        **preview.model_dump(),
        submitted=True,
        history_id=history.id,
        canvas_submission=updated,
    )


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value)
