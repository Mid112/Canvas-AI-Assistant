
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import Course
from app.models.submission import Submission
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.dashboard import (
    CourseActivitySummary,
    InstructorDashboardResponse,
    RecentWorkflowSummary,
)
from app.services.canvas import get_active_course


async def get_instructor_dashboard(
    user: User,
    db: AsyncSession,
) -> InstructorDashboardResponse:
    courses = list(
        await db.scalars(
            select(Course)
            .where(Course.instructor_id == user.id)
            .options(selectinload(Course.assignments), selectinload(Course.students))
            .order_by(Course.name)
        )
    )

    course_summaries: list[CourseActivitySummary] = []
    total_students = 0
    total_assignments = 0
    total_missing = 0
    total_late = 0

    for course in courses:
        assignment_ids = [assignment.id for assignment in course.assignments]
        missing_count = 0
        late_count = 0

        if assignment_ids:
            missing_count = int(
                await db.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.status == "missing",
                    )
                )
                or 0
            )
            late_count = int(
                await db.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.status == "late",
                    )
                )
                or 0
            )

        student_count = len(course.students)
        assignment_count = len(course.assignments)

        total_students += student_count
        total_assignments += assignment_count
        total_missing += missing_count
        total_late += late_count

        course_summaries.append(
            CourseActivitySummary(
                local_id=course.id,
                name=course.name,
                student_count=student_count,
                assignment_count=assignment_count,
                missing_submissions=missing_count,
                late_submissions=late_count,
            )
        )

    pending_workflows = int(
        await db.scalar(
            select(func.count())
            .select_from(Workflow)
            .where(Workflow.user_id == user.id, Workflow.status == "pending")
        )
        or 0
    )

    recent_rows = await db.scalars(
        select(Workflow)
        .where(Workflow.user_id == user.id)
        .order_by(desc(Workflow.created_at))
        .limit(5)
    )

    active_course = await get_active_course(user, db)

    return InstructorDashboardResponse(
        course_count=len(courses),
        student_count=total_students,
        assignment_count=total_assignments,
        missing_submissions=total_missing,
        late_submissions=total_late,
        pending_workflows=pending_workflows,
        active_course=active_course,
        courses=course_summaries,
        recent_workflows=[
            RecentWorkflowSummary(
                id=workflow.id,
                action_name=workflow.action_name,
                user_prompt=workflow.user_prompt,
                status=workflow.status,
                created_at=workflow.created_at,
            )
            for workflow in recent_rows
        ],
    )
