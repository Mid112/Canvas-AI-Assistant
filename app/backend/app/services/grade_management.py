import json
import re
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_submissions, update_submission_grade
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.grade_history import GradeHistory
from app.models.student import Student
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.canvas import GradePreviewResponse, GradeUpdateRequest, GradeUpdateResponse
from app.services.canvas import (
    _assert_no_executing_write,
    _fill_submission_contact_fields,
    _parse_submission,
    get_owned_course,
    require_canvas_token,
    require_published_assignment,
    require_writable_course,
)
from app.services.canvas_idempotency import (
    build_idempotency_key,
    run_idempotent_canvas_write,
)
from app.services.message_validation import check_message_profanity

IRREVERSIBLE_GRADE_WARNING = (
    "Grade changes are high risk because Canvas updates the student's official record immediately."
)
ROLLBACK_MESSAGE = (
    "History is recorded for audit context; use a new grade change for any manual correction."
)
FEEDBACK_ONLY_WARNING = (
    "Feedback only is medium risk because it posts a Canvas comment that students can see immediately."
)
FEEDBACK_ONLY_ROLLBACK_MESSAGE = (
    "History is recorded; no grade correction is needed because this action does not change the student's grade."
)
MAX_REASONABLE_NUMERIC_GRADE = Decimal("10000")
# Keep text grades intentionally allow-listed: Canvas can accept grading-scheme
# values such as pass/fail variants, but "excused" is a separate Canvas boolean
# action and must not be submitted through posted_grade.
CANVAS_LETTER_GRADE_RE = re.compile(r"^(?:A|B|C|D)[+-]?$|^F$", re.IGNORECASE)
CANVAS_TEXT_GRADES = frozenset(
    {
        "complete",
        "incomplete",
        "pass",
        "fail",
        "p",
        "np",
        "satisfactory",
        "unsatisfactory",
    }
)


async def _find_submission(
    *,
    local_course_id: int,
    body: GradeUpdateRequest,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
):
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    await require_published_assignment(db, course, body.assignment_id)
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
        points_possible=snapshot.get("assignment_points_possible"),
    )


def _normalize_grade_value(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_score_value(value) -> str | None:
    decimal_value = _coerce_decimal(value)
    if decimal_value is None:
        return None
    return _format_decimal(decimal_value)


def _assert_snapshot_matches_live(body: GradeUpdateRequest, live_submission) -> None:
    """Feature 14 (#909): reject submits when the instructor's preview snapshot
    no longer matches live Canvas grade/score (someone else graded, or the
    page was stale). No snapshot means we already re-fetched live state and
    that is the source of truth."""
    snapshot = body.current_submission
    if not isinstance(snapshot, dict):
        return

    snap_grade = _normalize_grade_value(snapshot.get("grade"))
    live_grade = _normalize_grade_value(getattr(live_submission, "grade", None))
    snap_score = _normalize_score_value(snapshot.get("score"))
    live_score = _normalize_score_value(getattr(live_submission, "score", None))

    if snap_grade == live_grade and snap_score == live_score:
        return

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "This student's Canvas grade changed since you previewed. "
            "Refresh the Grades tab and preview again before submitting."
        ),
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
        points_possible=None,
    ):
        self.id = id
        self.assignment_id = assignment_id
        self.user_id = user_id
        self.student_name = student_name
        self.score = score
        self.grade = grade
        self.status = status
        self.points_possible = points_possible


def _coerce_int(value) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_decimal(value) -> Decimal | None:
    # Use Decimal instead of float/Number-style parsing so hex-ish strings like
    # "0x10" are rejected consistently with the frontend validation.
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None


def _format_decimal(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _validate_grade_payload(body: GradeUpdateRequest) -> str:
    # Canvas accepts both numeric scores and grading-scheme text. Keep bonus
    # scores possible while rejecting malformed payloads before any mutation.
    posted_grade = body.posted_grade.strip()
    feedback = (body.feedback or "").strip()
    if not posted_grade and not feedback:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Enter a new grade or feedback before previewing.",
        )
    if feedback:
        # Gradebook feedback is student-facing text (#1300).
        check_message_profanity(feedback, content_label="Feedback")
    if not posted_grade:
        return posted_grade

    if any(ord(char) < 32 for char in posted_grade):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Grade cannot contain line breaks or control characters.",
        )

    numeric_grade = _coerce_decimal(posted_grade)
    if numeric_grade is not None:
        if not numeric_grade.is_finite():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Grade must be a finite value.",
            )
        if numeric_grade < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Grade cannot be negative.",
            )
        if numeric_grade > MAX_REASONABLE_NUMERIC_GRADE:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Grade is outside the supported range.",
            )
        return posted_grade

    normalized_text_grade = posted_grade.lower()
    if (
        CANVAS_LETTER_GRADE_RE.fullmatch(posted_grade)
        or normalized_text_grade in CANVAS_TEXT_GRADES
    ):
        return posted_grade

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="Grade must be numeric or a supported grading-scheme value.",
    )


async def _grade_history_relationship_ids(
    *,
    db: AsyncSession,
    course_id: int,
    assignment_canvas_id: int,
    student_canvas_id: int,
) -> tuple[int | None, int | None]:
    # Grade update requests use Canvas ids because that is what the Canvas API
    # mutates. Store nullable local FKs too when our mirror has matching rows so
    # audit/history queries can join through the normal app relationships.
    local_assignment_id = await db.scalar(
        select(Assignment.id).where(
            Assignment.course_id == course_id,
            Assignment.canvas_assignment_id == str(assignment_canvas_id),
        )
    )
    local_student_id = await db.scalar(
        select(Student.id).where(
            Student.course_id == course_id,
            Student.canvas_user_id == str(student_canvas_id),
        )
    )
    return local_assignment_id, local_student_id


def _grade_warnings(body: GradeUpdateRequest, submission) -> list[str]:
    # Warnings are advisory and use the already-fetched page snapshot when
    # available, avoiding an extra Canvas call just to restate preview context.
    warnings: list[str] = []
    status_value = submission.status.value if hasattr(submission.status, "value") else str(submission.status)
    if status_value == "unsubmitted":
        warnings.append(
            "This student has no Canvas submission timestamp; only submit if offline, paper, or in-person work should be graded."
        )

    proposed_grade = body.posted_grade.strip()
    numeric_grade = _coerce_decimal(proposed_grade)
    points_possible = _coerce_decimal(getattr(submission, "points_possible", None))
    if points_possible is None and isinstance(body.current_submission, dict):
        points_possible = _coerce_decimal(body.current_submission.get("assignment_points_possible"))
    if numeric_grade is not None and points_possible is not None and numeric_grade > points_possible:
        points_label = _format_decimal(points_possible)
        warnings.append(
            f"This grade is above the assignment's {points_label} possible points; "
            "submit only if this is intentional bonus or adjusted grading."
        )
    return warnings


def _build_grade_preview(course, body: GradeUpdateRequest, submission) -> GradePreviewResponse:
    proposed_grade = _validate_grade_payload(body)
    feedback = (body.feedback or "").strip()
    feedback_only = not proposed_grade and bool(feedback)
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
        risk_level="medium" if feedback_only else "high",
        requires_approval=True,
        irreversible_warning=FEEDBACK_ONLY_WARNING if feedback_only else IRREVERSIBLE_GRADE_WARNING,
        rollback_available=False,
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
            "feedback": feedback or None,
            "warnings": _grade_warnings(body, submission),
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
    canvas_url: str | None,
    db: AsyncSession,
) -> GradePreviewResponse:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    # Also checked here, not only in _find_submission: a preview that carries a
    # submission snapshot skips that lookup entirely, and the point of this
    # guard is that the instructor learns before filling anything in.
    await require_published_assignment(db, course, body.assignment_id)
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
    canvas_url: str | None,
    db: AsyncSession,
    *,
    record_workflow_audit: bool = True,
    exclude_workflow_id: int | None = None,
) -> GradeUpdateResponse:
    course, token, submission = await _find_submission(
        local_course_id=local_course_id,
        body=body,
        user=user,
        canvas_url=canvas_url,
        db=db,
    )
    # Re-fetched live submission must still match the preview snapshot when
    # the client sent one — blocks stale Canvas-modifying submits (#909).
    _assert_snapshot_matches_live(body, submission)
    preview = _build_grade_preview(course, body, submission)
    proposed_grade = body.posted_grade.strip()
    feedback = (body.feedback or "").strip()
    feedback_only = not proposed_grade and bool(feedback)

    # Feature Reliability (#1188): same user-scoped mutex as other Canvas writes
    # so a grade confirm cannot race an in-flight assignment/quiz/message write.
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name="update_grade",
        local_course_id=course.id,
        exclude_workflow_id=exclude_workflow_id,
    )

    # The key identifies a TRANSITION, not a destination.
    #
    # Without the current grade in it, "set student 41 to 19" hashes the same
    # whenever it is asked, and the result is cached for IDEMPOTENCY_RETENTION
    # (7 days). So 18 -> 19, then 19 -> 16, then 16 -> 19 again collapsed: the
    # third write matched the first key, replayed its stored Canvas response,
    # and never called Canvas. The app read "19" out of that stale body and
    # reported success while Canvas still held 16 — a write that silently did
    # not happen, which is worse than one that visibly failed.
    #
    # Including the pre-write grade keeps the protection this exists for and
    # drops the false positive. A genuine double-submit is two requests made
    # from the same starting state, so it still hashes identically and is
    # still deduped. A deliberate re-set after the value moved starts from a
    # different state, so it is a different key and actually runs.
    idem_key = build_idempotency_key(
        "update_grade",
        user.id,
        course.id,
        body.assignment_id,
        body.user_id,
        submission.grade,
        submission.score,
        proposed_grade,
        feedback,
    )

    async def _write():
        # Canvas updates comments/feedback via the submission comment fields,
        # while the grade itself stays in posted_grade. Excuse support would
        # need a separate submission[excuse] path, not this helper.
        return await update_submission_grade(
            int(course.canvas_course_id),
            body.assignment_id,
            body.user_id,
            proposed_grade or None,
            token,
            course.canvas_url,
            feedback=feedback or None,
        )

    raw = await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation="update_grade",
        idempotency_key=idem_key,
        write=_write,
    )
    updated = _parse_submission(raw)
    local_assignment_id, local_student_id = await _grade_history_relationship_ids(
        db=db,
        course_id=course.id,
        assignment_canvas_id=body.assignment_id,
        student_canvas_id=body.user_id,
    )
    history = GradeHistory(
        user_id=user.id,
        course_id=course.id,
        local_assignment_id=local_assignment_id,
        assignment_id=str(body.assignment_id),
        student_id=local_student_id,
        student_canvas_id=str(body.user_id),
        previous_grade=submission.grade,
        previous_score=submission.score,
        new_grade=proposed_grade or submission.grade or "unchanged",
        feedback=feedback or None,
        risk_level="medium" if feedback_only else "high",
        # History supports audit/manual correction, but there is no automated
        # undo endpoint for grade writes yet.
        rollback_available=False,
        canvas_response=json.loads(json.dumps(raw, default=_json_default)),
    )
    workflow = None
    if record_workflow_audit:
        # Direct Grades tab submits do not have chat messages, but they still
        # need workflow/audit traceability alongside grade history.
        workflow = Workflow(
            conversation_id=None,
            user_id=user.id,
            course_id=course.id,
            action_name="update_grade",
            user_prompt="Grades tab grade update",
            proposed_action=body.model_dump(mode="json"),
            affected_resources=preview.affected_resources,
            status="executed",
            executed_at=datetime.now(UTC),
        )
        db.add(workflow)
        await db.flush()

    db.add(history)
    await db.flush()
    history_id = history.id
    if workflow is not None:
        # GradeHistory is the instructor-facing change ledger; AuditLog ties the
        # same successful Canvas write to workflow history for admin review.
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=course.id,
                action="update_grade",
                resource_type="submission",
                resource_id=str(updated.id) if updated.id is not None else None,
                operation="update",
                status="success",
                before_data=preview.current,
                after_data=json.loads(json.dumps(raw, default=_json_default)),
                request_payload=body.model_dump(mode="json"),
            )
        )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return GradeUpdateResponse(
        **preview.model_dump(),
        submitted=True,
        history_id=history_id,
        canvas_submission=updated,
    )


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value)
