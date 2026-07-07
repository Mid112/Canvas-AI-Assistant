from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user, get_instructor_user
from app.models.user import User
from app.schemas.analysis import LateSubmissionAnalysis, MissingSubmissionAnalysis
from app.schemas.canvas import (
    ActiveCourseResponse,
    ActiveCourseSet,
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    CourseResponse,
    SubmissionResponse,
)
from app.schemas.course_overview import CourseOverviewResponse
from app.schemas.dashboard import InstructorDashboardResponse
from app.schemas.preview import ActionPreviewResponse, AssignmentDraftRequest, AssignmentDraftResponse
from app.schemas.student import StudentResponse
from app.services.analysis import analyze_late_submissions, analyze_missing_submissions
from app.services.assignment_draft import generate_assignment_draft
from app.services.canvas import (
    create_course_assignment,
    get_active_course,
    get_assignment,
    get_assignments,
    get_courses,
    get_submissions,
    set_active_course,
    update_course_assignment,
)
from app.services.course_overview import get_course_overview
from app.services.dashboard import get_instructor_dashboard
from app.services.preview import build_action_preview
from app.services.student import get_students

router = APIRouter(prefix="/canvas", tags=["canvas"])


@router.get("/dashboard", response_model=InstructorDashboardResponse)
async def instructor_dashboard(
    current_user: User = Depends(get_instructor_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_instructor_dashboard(current_user, db)


@router.get("/courses/{course_id}/overview", response_model=CourseOverviewResponse)
async def course_overview(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_course_overview(course_id, current_user, canvas_url, db)


@router.get("/courses", response_model=list[CourseResponse])
async def list_courses(
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_courses(current_user, canvas_url, db)


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_assignments(course_id, current_user, canvas_url, db)


@router.post("/courses/{course_id}/assignments/generate-draft", response_model=AssignmentDraftResponse)
async def generate_assignment_draft_endpoint(
    course_id: int,
    body: AssignmentDraftRequest,
    current_user: User = Depends(get_current_user),
):
    return await generate_assignment_draft(body)


@router.post("/courses/{course_id}/assignments/preview", response_model=ActionPreviewResponse)
async def preview_assignment_endpoint(
    course_id: int,
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    from app.services.canvas import get_owned_course

    course = await get_owned_course(course_id, current_user, canvas_url, db)
    preview = build_action_preview(
        "create_assignment",
        f"Create assignment '{body.name}' in {course.name}",
        body.model_dump(mode="json"),
        course_name=course.name,
    )
    return ActionPreviewResponse(**preview)


@router.post("/courses/{course_id}/assignments", response_model=AssignmentResponse)
async def create_assignment_endpoint(
    course_id: int,
    body: AssignmentCreate,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await create_course_assignment(course_id, body, current_user, canvas_url, db)


@router.get("/courses/{course_id}/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment_endpoint(
    course_id: int,
    assignment_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_assignment(course_id, assignment_id, current_user, canvas_url, db)


@router.patch("/courses/{course_id}/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment_endpoint(
    course_id: int,
    assignment_id: int,
    body: AssignmentUpdate,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await update_course_assignment(
        course_id,
        assignment_id,
        body,
        current_user,
        canvas_url,
        db,
    )


@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/submissions",
    response_model=list[SubmissionResponse],
)
async def list_submissions(
    course_id: int,
    assignment_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_submissions(
        course_id,
        assignment_id,
        current_user,
        canvas_url,
        db,
    )


# Missing submission analysis (#550–#553) — compares the enrolled roster against
# submissions for one assignment and returns missing students plus summary stats.
@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/missing-submissions",
    response_model=MissingSubmissionAnalysis,
)
async def missing_submission_analysis(
    course_id: int,
    assignment_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await analyze_missing_submissions(
        course_id,
        assignment_id,
        current_user,
        canvas_url,
        db,
    )


# Late submission analysis (#554–#557) — detects late submissions among the enrolled
# roster for one assignment and returns late students plus timing statistics.
@router.get(
    "/courses/{course_id}/assignments/{assignment_id}/late-submissions",
    response_model=LateSubmissionAnalysis,
)
async def late_submission_analysis(
    course_id: int,
    assignment_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await analyze_late_submissions(
        course_id,
        assignment_id,
        current_user,
        canvas_url,
        db,
    )


@router.get("/courses/{course_id}/students", response_model=list[StudentResponse])
async def list_students(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_students(course_id, current_user, canvas_url, db)


# Active course — stores which course the instructor is currently working in (UI selection state).
# This is separate from conversation.course_id, which is a historical record per chat session.
@router.get("/active-course", response_model=ActiveCourseResponse | None)
async def get_active_course_endpoint(
    current_user: User = Depends(get_instructor_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_course(current_user, db)


@router.patch("/active-course", response_model=ActiveCourseResponse)
async def set_active_course_endpoint(
    body: ActiveCourseSet,
    current_user: User = Depends(get_instructor_user),
    db: AsyncSession = Depends(get_db),
):
    return await set_active_course(current_user, body.local_course_id, db)
