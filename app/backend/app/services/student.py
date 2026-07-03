from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_enrollments
from app.models.course import Course
from app.models.student import Student
from app.models.user import User
from app.schemas.student import StudentResponse
from app.services.canvas import require_canvas_token


async def get_students(
    canvas_course_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> list[StudentResponse]:
    token = require_canvas_token(user, canvas_url)

    # Verify this course belongs to the requesting instructor before touching Canvas.
    # Canvas would also reject an unauthorized token, but we enforce ownership at the
    # app layer so cross-instructor data leakage is impossible even on shared Canvas URLs.
    course = await db.scalar(
        select(Course).where(
            Course.canvas_course_id == str(canvas_course_id),
            Course.instructor_id == user.id,
        )
    )
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    data = await fetch_enrollments(canvas_course_id, token, canvas_url)

    if not data:
        return []

    # Batch-fetch existing student rows for this course to avoid N+1 on upsert
    canvas_user_ids = [str(item["user_id"]) for item in data]
    rows = await db.scalars(
        select(Student).where(
            Student.canvas_user_id.in_(canvas_user_ids),
            Student.course_id == course.id,
        )
    )
    student_map: dict[str, Student] = {s.canvas_user_id: s for s in rows}

    now = datetime.now(UTC)
    for item in data:
        uid = str(item["user_id"])
        user_obj = item.get("user") or {}
        name = user_obj.get("name") or "Unknown"
        sortable_name = user_obj.get("sortable_name")
        login_id = user_obj.get("login_id")
        enrollment_state = item.get("enrollment_state", "active")

        if uid in student_map:
            student_map[uid].name = name
            student_map[uid].sortable_name = sortable_name
            student_map[uid].login_id = login_id
            student_map[uid].enrollment_state = enrollment_state
            student_map[uid].updated_at = now
        else:
            student = Student(
                canvas_user_id=uid,
                course_id=course.id,
                name=name,
                sortable_name=sortable_name,
                login_id=login_id,
                enrollment_state=enrollment_state,
            )
            db.add(student)
            student_map[uid] = student

    await db.flush()
    await db.commit()

    return [StudentResponse.model_validate(student_map[str(item["user_id"])]) for item in data]
