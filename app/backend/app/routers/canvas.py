from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    GradePreviewResponse,
    GradeUpdateRequest,
    GradeUpdateResponse,
    QuestionBankSummary,
    QuizCapabilities,
    QuizCreate,
    QuizResponse,
    SubmissionResponse,
)
from app.schemas.course_overview import CourseOverviewResponse
from app.schemas.dashboard import InstructorDashboardResponse
from app.schemas.preview import (
    ActionPreviewResponse,
    AssignmentDraftRequest,
    AssignmentDraftResponse,
    QuizDraftRequest,
    QuizDraftResponse,
)
from app.schemas.student import StudentResponse
from app.services.analysis import analyze_late_submissions, analyze_missing_submissions
from app.services.assignment_draft import generate_assignment_draft
from app.services.canvas import (
    create_course_assignment,
    create_course_quiz,
    get_active_course,
    get_assignment,
    get_assignments,
    get_cached_courses,
    get_course_question_banks,
    get_course_quiz_capabilities,
    get_course_quizzes,
    get_courses,
    get_submissions,
    set_active_course,
    update_course_assignment,
)
from app.services.course_overview import get_course_overview
from app.services.dashboard import get_instructor_dashboard
from app.services.grade_management import preview_grade_update, submit_grade_update
from app.services.preview import build_action_preview
from app.services.quiz_draft import generate_quiz_draft
from app.services.quiz_validation import short_answer_new_quiz_warnings
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


# Last-synced courses straight from the local DB, no live Canvas call — lets the
# dashboard paint instantly, with the frontend also calling GET /courses in the
# background to revalidate. See get_cached_courses()'s docstring.
@router.get("/courses/cached", response_model=list[CourseResponse])
async def list_cached_courses(
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_cached_courses(current_user, canvas_url, db)


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str | None = Query(default=None),
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
    from app.services.canvas import get_owned_course, require_writable_course

    course = await get_owned_course(course_id, current_user, canvas_url, db)
    require_writable_course(course)
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


@router.get("/courses/{course_id}/quizzes", response_model=list[QuizResponse])
async def list_quizzes_endpoint(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await get_course_quizzes(course_id, current_user, canvas_url, db)


@router.get(
    "/courses/{course_id}/quizzes/capabilities",
    response_model=QuizCapabilities,
)
async def quiz_capabilities_endpoint(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_course_quiz_capabilities(
        course_id, current_user, canvas_url, db
    )


@router.get(
    "/courses/{course_id}/quizzes/question-banks",
    response_model=list[QuestionBankSummary],
)
async def list_question_banks_endpoint(
    course_id: int,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_course_question_banks(
        course_id, current_user, canvas_url, db
    )


@router.post("/courses/{course_id}/quizzes/generate-draft", response_model=QuizDraftResponse)
async def generate_quiz_draft_endpoint(
    course_id: int,
    body: QuizDraftRequest,
    current_user: User = Depends(get_instructor_user),
    db: AsyncSession = Depends(get_db),
):
    # Require instructor role AND course ownership before spending an LLM call.
    from app.services.course_access import get_owned_course_or_404

    await get_owned_course_or_404(course_id, current_user, db)
    return await generate_quiz_draft(body)


@router.post("/courses/{course_id}/quizzes/preview", response_model=ActionPreviewResponse)
async def preview_quiz_endpoint(
    course_id: int,
    body: QuizCreate,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    from app.services.canvas import get_owned_course, require_writable_course
    from app.services.quiz_validation import validate_quiz_for_create

    await validate_quiz_for_create(
        course_id,
        current_user,
        body.title,
        body.description,
        body.due_at.isoformat() if body.due_at else None,
        body.points_possible,
        db,
        allowed_attempts=body.allowed_attempts,
        time_limit=body.time_limit,
        questions=[q.model_dump() for q in body.questions],
        quiz_engine=body.quiz_engine,
        question_bank_groups=[
            group.model_dump() for group in body.question_bank_groups
        ],
    )
    if body.quiz_engine == "new_quizzes":
        capabilities = await get_course_quiz_capabilities(
            course_id, current_user, canvas_url, db
        )
        if not capabilities.new_quizzes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    capabilities.new_quizzes_unavailable_reason
                    or "New Quizzes is not available for this course."
                ),
            )
    course = await get_owned_course(course_id, current_user, canvas_url, db)
    require_writable_course(course)
    question_total = len(body.questions) + sum(
        group.pick_count for group in body.question_bank_groups
    )
    question_note = (
        f" with {question_total} question{'s' if question_total != 1 else ''}"
        if question_total
        else ""
    )
    metadata = body.model_dump(mode="json")
    warnings = short_answer_new_quiz_warnings(
        body.quiz_engine,
        [question.model_dump() for question in body.questions],
    )
    if warnings:
        metadata["warnings"] = warnings
    preview = build_action_preview(
        "create_quiz",
        (
            f"Create {'New' if body.quiz_engine == 'new_quizzes' else 'Classic'} "
            f"Quiz '{body.title}' in {course.name}{question_note}"
        ),
        metadata,
        course_name=course.name,
    )
    return ActionPreviewResponse(**preview)


@router.post("/courses/{course_id}/quizzes", response_model=QuizResponse)
async def create_quiz_endpoint(
    course_id: int,
    body: QuizCreate,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
    conversation_id: int | None = Query(default=None),
):
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.conversation import Conversation
    from app.models.workflow import Workflow
    from app.services.canvas import get_owned_course
    from app.services.chat import record_write_audit
    from app.services.quiz_validation import validate_quiz_for_create

    await validate_quiz_for_create(
        course_id,
        current_user,
        body.title,
        body.description,
        body.due_at.isoformat() if body.due_at else None,
        body.points_possible,
        db,
        allowed_attempts=body.allowed_attempts,
        time_limit=body.time_limit,
        questions=[q.model_dump() for q in body.questions],
        quiz_engine=body.quiz_engine,
        question_bank_groups=[
            group.model_dump() for group in body.question_bank_groups
        ],
    )
    quiz = await create_course_quiz(course_id, body, current_user, canvas_url, db)
    course = await get_owned_course(course_id, current_user, canvas_url, db)

    linked_conversation_id: int | None = None
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        if conversation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        linked_conversation_id = conversation.id

    workflow = Workflow(
        conversation_id=linked_conversation_id,
        user_id=current_user.id,
        course_id=course.id,
        source_user_message_id=None,
        preview_message_id=None,
        action_name="create_quiz",
        user_prompt="Created via quiz creation form",
        proposed_action={
            "action": "create_quiz",
            "local_course_id": course.id,
            **body.model_dump(mode="json"),
        },
        affected_resources=[
            {
                "type": "course",
                "id": course.id,
                "name": course.name,
                "status": "unchanged",
            },
            {
                "type": "quiz",
                "id": quiz.id,
                "name": quiz.title,
                "status": "created",
            },
        ],
        status="executed",
        executed_at=datetime.now(UTC),
    )
    db.add(workflow)
    await db.flush()

    await record_write_audit(
        db,
        current_user,
        workflow,
        {
            "data": quiz.model_dump(mode="json"),
            "affected_resources": workflow.affected_resources,
        },
    )
    await db.commit()
    return quiz


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


@router.post(
    "/courses/{course_id}/grades/preview",
    response_model=GradePreviewResponse,
)
async def preview_grade_update_endpoint(
    course_id: int,
    body: GradeUpdateRequest,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await preview_grade_update(course_id, body, current_user, canvas_url, db)


@router.post(
    "/courses/{course_id}/grades/submit",
    response_model=GradeUpdateResponse,
)
async def submit_grade_update_endpoint(
    course_id: int,
    body: GradeUpdateRequest,
    current_user: User = Depends(get_instructor_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await submit_grade_update(course_id, body, current_user, canvas_url, db)


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
    """List enrolled students for a course. ``course_id`` is the local DB course id."""
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
