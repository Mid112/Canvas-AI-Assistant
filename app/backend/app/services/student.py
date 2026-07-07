from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_enrollments
from app.models.student import Student
from app.models.user import User
from app.schemas.student import StudentResponse
from app.services.canvas import get_owned_course, require_canvas_token


async def get_students(
    local_course_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> list[StudentResponse]:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    canvas_course_id = int(course.canvas_course_id)

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
