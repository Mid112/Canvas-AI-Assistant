from datetime import UTC, datetime

from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.security import decrypt_canvas_token
from app.integrations.canvas import (
    create_announcement,
    create_assignment,
    fetch_assignment,
    fetch_assignments,
    fetch_courses,
    fetch_submissions,
    send_conversation,
    update_assignment,
)
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.canvas import (
    ActiveCourseResponse,
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    CourseResponse,
    MessageSendResult,
    SubmissionResponse,
    SubmissionStatus,
)


def require_canvas_token(user: User, canvas_url: str) -> str:
    canvas_url = canvas_url.rstrip("/")
    conn = next((c for c in user.canvas_connections if c.canvas_url == canvas_url), None)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No Canvas token for {canvas_url}. PATCH to /api/v1/auth/me/canvas-token first.",
        )
    try:
        return decrypt_canvas_token(conn.encrypted_token)
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token is corrupted — please reconnect Canvas.",
        )


async def get_owned_course(
    local_course_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> Course:
    course = await db.scalar(
        select(Course).where(
            Course.id == local_course_id,
            Course.instructor_id == user.id,
            Course.canvas_url == canvas_url.rstrip("/"),
        )
    )
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    return course


async def get_courses(user: User, canvas_url: str, db: AsyncSession) -> list[CourseResponse]:
    token = require_canvas_token(user, canvas_url)
    data = await fetch_courses(token, canvas_url)

    if not data:
        return []

    # Batch fetch all existing courses for this instructor in one query — avoids N+1.
    # instructor_id filter ensures we never touch another instructor's rows.
    # Known limitation: canvas_course_id is globally UNIQUE, so two co-instructors
    # on the same Canvas course will conflict on INSERT — tracked for follow-up.
    canvas_ids = [str(item["id"]) for item in data]
    rows = await db.scalars(
        select(Course).where(
            Course.canvas_course_id.in_(canvas_ids),
            Course.instructor_id == user.id,
        )
    )
    course_map: dict[str, Course] = {c.canvas_course_id: c for c in rows}

    for item in data:
        cid = str(item["id"])
        term_name: str | None = (item.get("term") or {}).get("name")

        if cid in course_map:
            course_map[cid].name = item["name"]
            course_map[cid].term = term_name
        else:
            course = Course(
                canvas_course_id=cid,
                canvas_url=canvas_url,
                name=item["name"],
                term=term_name,
                instructor_id=user.id,
            )
            db.add(course)
            course_map[cid] = course

    # flush() sends all INSERTs in one round-trip and populates auto-generated IDs
    # before we build the response — commit() finalises the transaction after
    await db.flush()
    await db.commit()

    return [
        CourseResponse.model_validate(
            {
                **item,
                "local_id": course_map[str(item["id"])].id,
                "term_name": (item.get("term") or {}).get("name"),
            }
        )
        for item in data
    ]


async def get_assignments(local_course_id: int, user: User, canvas_url: str, db: AsyncSession) -> list[AssignmentResponse]:
    course = await db.scalar(
        select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id)
    )
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    token = require_canvas_token(user, course.canvas_url)
    data = await fetch_assignments(int(course.canvas_course_id), token, course.canvas_url)

    if not data:
        return []

    # Batch-fetch existing assignment rows for this course to avoid N+1 on upsert
    canvas_ids = [str(item["id"]) for item in data]
    rows = await db.scalars(
        select(Assignment).where(Assignment.canvas_assignment_id.in_(canvas_ids))
    )
    assignment_map: dict[str, Assignment] = {a.canvas_assignment_id: a for a in rows}

    for item in data:
        aid = str(item["id"])
        title = item.get("name") or "Untitled"
        description = item.get("description")
        due_date = _parse_dt(item.get("due_at"))
        points_possible = item.get("points_possible")

        if aid in assignment_map:
            assignment_map[aid].title = title
            assignment_map[aid].description = description
            assignment_map[aid].due_date = due_date
            assignment_map[aid].points_possible = points_possible
        else:
            assignment = Assignment(
                canvas_assignment_id=aid,
                course_id=course.id,
                title=title,
                description=description,
                due_date=due_date,
                points_possible=points_possible,
            )
            db.add(assignment)
            assignment_map[aid] = assignment

    await db.flush()
    await db.commit()

    return [
        AssignmentResponse.model_validate({
            **item,
            "local_id": assignment_map[str(item["id"])].id,
        })
        for item in data
    ]


def _parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


async def get_assignment(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await fetch_assignment(
        int(course.canvas_course_id),
        assignment_id,
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


async def create_course_assignment(
    local_course_id: int,
    payload: AssignmentCreate,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await create_assignment(
        int(course.canvas_course_id),
        payload.model_dump(mode="json"),
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


async def update_course_assignment(
    local_course_id: int,
    assignment_id: int,
    payload: AssignmentUpdate,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await update_assignment(
        int(course.canvas_course_id),
        assignment_id,
        payload.model_dump(mode="json"),
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


async def send_course_message(
    local_course_id: int,
    subject: str,
    body: str,
    user: User,
    canvas_url: str,
    db: AsyncSession,
    recipient_canvas_user_ids: list[int] | None = None,
) -> MessageSendResult:
    # Local import — services/student.py imports require_canvas_token from
    # this module, so importing get_students at module level here would
    # create a circular import. Safe as a function-local import since both
    # modules are fully loaded by the time this actually runs.
    from app.services.student import get_students

    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    canvas_course_id = int(course.canvas_course_id)

    if recipient_canvas_user_ids:
        await send_conversation(
            canvas_course_id,
            recipient_canvas_user_ids,
            subject,
            body,
            token,
            canvas_url,
        )
        return MessageSendResult(
            course_id=canvas_course_id,
            subject=subject,
            body=body,
            audience_size=len(recipient_canvas_user_ids),
            delivery_mode="conversation",
            recipient_canvas_user_ids=recipient_canvas_user_ids,
        )

    await create_announcement(canvas_course_id, subject, body, token, canvas_url)
    roster = await get_students(canvas_course_id, user, canvas_url, db)
    return MessageSendResult(
        course_id=canvas_course_id,
        subject=subject,
        body=body,
        audience_size=len(roster),
        delivery_mode="announcement",
        recipient_canvas_user_ids=[],
    )


def _parse_submission_status(raw: dict) -> SubmissionStatus:
    # Priority: excused > missing > graded > late > submitted > unsubmitted
    if raw.get("excused"):
        return SubmissionStatus.excused
    if raw.get("missing"):
        return SubmissionStatus.missing
    state = raw.get("workflow_state", "unsubmitted")
    if state == "graded":
        return SubmissionStatus.graded
    if state in ("submitted", "pending_review"):
        return SubmissionStatus.late if raw.get("late") else SubmissionStatus.submitted
    return SubmissionStatus.unsubmitted


def _parse_submission(raw: dict) -> SubmissionResponse:
    # Canvas returns user data when include[]=user is set; fall back to None if absent
    user = raw.get("user") or {}
    return SubmissionResponse(
        id=raw["id"],
        assignment_id=raw["assignment_id"],
        user_id=raw["user_id"],
        student_name=user.get("name"),
        submitted_at=raw.get("submitted_at"),
        workflow_state=raw.get("workflow_state", "unsubmitted"),
        status=_parse_submission_status(raw),
        score=raw.get("score"),
        grade=raw.get("grade"),
        graded_at=raw.get("graded_at"),
    )


async def get_submissions(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> list[SubmissionResponse]:
    from app.models.submission import Submission

    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await fetch_submissions(
        int(course.canvas_course_id),
        assignment_id,
        token,
        canvas_url,
    )
    parsed = [_parse_submission(raw) for raw in data]

    assignment = await db.scalar(
        select(Assignment).where(
            Assignment.canvas_assignment_id == str(assignment_id),
            Assignment.course_id == course.id,
        )
    )
    if not assignment:
        assignment = Assignment(
            canvas_assignment_id=str(assignment_id),
            course_id=course.id,
            title=f"Assignment {assignment_id}",
        )
        db.add(assignment)
        await db.flush()

    canvas_ids = [str(item.id) for item in parsed]
    existing_rows = await db.scalars(
        select(Submission).where(Submission.canvas_submission_id.in_(canvas_ids))
    )
    submission_map = {s.canvas_submission_id: s for s in existing_rows}

    for item in parsed:
        cid = str(item.id)
        if cid in submission_map:
            row = submission_map[cid]
            row.status = item.status.value
            row.score = item.score
            row.grade = item.grade
            row.graded_at = item.graded_at
            row.submitted_at = item.submitted_at
            row.student_name = item.student_name
        else:
            db.add(
                Submission(
                    canvas_submission_id=cid,
                    assignment_id=assignment.id,
                    student_canvas_id=str(item.user_id),
                    student_name=item.student_name,
                    status=item.status.value,
                    score=item.score,
                    grade=item.grade,
                    graded_at=item.graded_at,
                    submitted_at=item.submitted_at,
                )
            )

    await db.commit()
    return parsed


async def get_active_course(user: User, db: AsyncSession) -> ActiveCourseResponse | None:
    # joinedload fetches preference + course in a single JOIN query
    pref = await db.scalar(
        select(UserPreference).where(UserPreference.user_id == user.id).options(joinedload(UserPreference.active_course))
    )
    if not pref or not pref.active_course:
        return None
    c = pref.active_course
    return ActiveCourseResponse(
        local_id=c.id,
        canvas_course_id=c.canvas_course_id,
        canvas_url=c.canvas_url,
        name=c.name,
        term=c.term,
    )


async def set_active_course(user: User, local_course_id: int, db: AsyncSession) -> ActiveCourseResponse:
    course = await db.scalar(select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id))
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    # Upsert: update if a preference row already exists, otherwise insert a new one
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if pref:
        pref.active_course_id = course.id
        pref.updated_at = datetime.now(UTC)
    else:
        db.add(UserPreference(user_id=user.id, active_course_id=course.id))

    await db.commit()
    return ActiveCourseResponse(
        local_id=course.id,
        canvas_course_id=course.canvas_course_id,
        canvas_url=course.canvas_url,
        name=course.name,
        term=course.term,
    )
