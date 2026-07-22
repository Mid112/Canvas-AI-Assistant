import json

from app.mcp_tools.schemas import UpdateGradeAction
from app.models.course import Course
from app.services.chat import (
    _build_grade_handoff_result,
    _build_grouped_grade_update_result,
    _grade_partial_plan,
    _is_bulk_student_reference,
)


def test_update_grade_action_accepts_numeric_grade():
    # Covers LLM/tool payload coercion so numeric grades from the model become
    # the string format expected by the grade preview/submit workflow.
    action = UpdateGradeAction.model_validate(
        {
            "action": "update_grade",
            "local_course_id": 7,
            "assignment_reference": "ggg",
            "student_reference": "coin",
            "new_grade": 100,
        }
    )

    assert action.new_grade == "100"


def test_bulk_grade_update_builds_grades_tab_handoff():
    """Bulk grade requests should redirect to the shared Grades tab flow.

    This replaces the older one-chat-preview-per-student behavior, which was
    harder to review and easier to desynchronize from the manual Grades page.
    """
    course = Course(id=7, name="COSC 777", canvas_course_id="77", instructor_id=1)
    result = _build_grade_handoff_result(
        course,
        assignment_id=10,
        submissions=[
            {"id": 1, "assignment_id": 10, "user_id": 101, "student_name": "Coin", "grade": None},
            {"id": 2, "assignment_id": 10, "user_id": 102, "student_name": "Mn", "grade": "88"},
        ],
        new_grade="100",
        reason="Curve applied",
    )

    assert result["action"] == "respond"
    assert result["grade_handoff"] == {
        "local_course_id": 7,
        "course_name": "COSC 777",
        "assignment_id": 10,
        "assignment_label": 'assignment "10"',
        "student_ids": [101, 102],
        "student_count": 2,
        "new_grade": "100",
        "reason": "Curve applied",
    }

    # The handoff stays JSON-safe because the assistant transcript persists
    # the full reply envelope before the frontend opens the Grades tab.
    json.dumps(result["grade_handoff"])


def test_grouped_grade_update_wrapper_uses_grades_tab_handoff():
    """The legacy helper name remains a thin wrapper for local callers/tests."""
    course = Course(id=7, name="COSC 777", canvas_course_id="77", instructor_id=1)
    result = _build_grouped_grade_update_result(
        course,
        assignment_id=10,
        submissions=[
            {"id": 1, "assignment_id": 10, "user_id": 101, "student_name": "Coin"},
        ],
        new_grade="100",
        reason=None,
    )

    assert result["action"] == "respond"
    assert result["grade_handoff"]["student_ids"] == [101]


def test_grade_clarification_partial_plan_preserves_target_context():
    # Covers the clarify-loop fix: when the assistant still needs student scope,
    # it keeps the resolved course/assignment and grade details for the next turn.
    action = UpdateGradeAction.model_validate(
        {
            "action": "update_grade",
            "local_course_id": 7,
            "assignment_reference": "ggg",
            "student_reference": "all astudent",
            "new_grade": "110",
            "reason": "Curve adjustment",
        }
    )

    plan = _grade_partial_plan(action, local_course_id=7, assignment_id=10)

    assert plan == {
        "action": "update_grade",
        "local_course_id": 7,
        "assignment_id": 10,
        "assignment_reference": "ggg",
        "student_reference": "all astudent",
        "new_grade": "110",
        "reason": "Curve adjustment",
    }


def test_bulk_student_reference_tolerates_common_student_typo():
    # Covers a real prompt typo seen in review: "all astudent" should still be
    # understood as a bulk/all-students grade request.
    assert _is_bulk_student_reference("all astudent") is True
