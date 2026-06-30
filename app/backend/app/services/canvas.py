from datetime import UTC, datetime

from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.security import decrypt_canvas_token
from app.integrations.canvas import fetch_assignments, fetch_courses, fetch_submissions
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.canvas import ActiveCourseResponse, AssignmentResponse, CourseResponse, SubmissionResponse


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
        CourseResponse.model_validate({
            **item,
            "local_id": course_map[str(item["id"])].id,
            "term_name": (item.get("term") or {}).get("name"),
        })
        for item in data
    ]


async def get_assignments(local_course_id: int, user: User, db: AsyncSession) -> list[AssignmentResponse]:
    # Ownership check — also gives us canvas_course_id and canvas_url without a client param
    course = await db.scalar(
        select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id)
    )
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    token = _require_canvas_token(user, course.canvas_url)
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


async def get_submissions(course_id: int, assignment_id: int, user: User, canvas_url: str) -> list[SubmissionResponse]:
    token = require_canvas_token(user, canvas_url)
    data = await fetch_submissions(course_id, assignment_id, token, canvas_url)
    return [SubmissionResponse(**item) for item in data]


async def get_active_course(user: User, db: AsyncSession) -> ActiveCourseResponse | None:
    # joinedload fetches preference + course in a single JOIN query
    pref = await db.scalar(
        select(UserPreference)
        .where(UserPreference.user_id == user.id)
        .options(joinedload(UserPreference.active_course))
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
    course = await db.scalar(
        select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id)
    )
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
