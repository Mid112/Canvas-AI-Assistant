from app.integrations.canvas import fetch_assignments, fetch_courses, fetch_submissions
from app.schemas.canvas import AssignmentResponse, CourseResponse, SubmissionResponse


async def get_courses() -> list[CourseResponse]:
    data = await fetch_courses()
    return [CourseResponse(**item) for item in data]


async def get_assignments(course_id: int) -> list[AssignmentResponse]:
    data = await fetch_assignments(course_id)
    return [AssignmentResponse(**item) for item in data]


async def get_submissions(course_id: int, assignment_id: int) -> list[SubmissionResponse]:
    data = await fetch_submissions(course_id, assignment_id)
    return [SubmissionResponse(**item) for item in data]
