import json

from app.mcp_tools.schemas import UpdateGradeAction
from app.models.course import Course
from app.services.chat import (
    _build_grade_handoff_result,
    _build_grouped_grade_update_result,
    _grade_partial_plan,
    _preserve_grade_clarification_context,
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


def test_grade_partial_plan_preserves_feedback():
    action = UpdateGradeAction.model_validate(
        {
            "action": "update_grade",
            "local_course_id": 7,
            "assignment_reference": "ggg",
            "student_reference": "coin",
            "new_grade": "100",
            "feedback": "Strong explanation of the solution.",
        }
    )

    partial_plan = _grade_partial_plan(action, local_course_id=7, assignment_id=10)

    assert partial_plan["feedback"] == "Strong explanation of the solution."
    assert "reason" not in partial_plan


def test_grade_resolver_clarification_preserves_all_user_grade_context():
    """A clarify must not lose the grade details already given.

    `reason` is deliberately absent from the expectations: UpdateGradeAction
    accepts the old spelling but normalizes it to `feedback` at the boundary,
    so nothing downstream ever sees a separate reason field.
    """
    action = UpdateGradeAction.model_validate(
        {
            "action": "update_grade",
            "local_course_id": 7,
            "assignment_reference": "ggg",
            "student_reference": "coin",
            "new_grade": "100",
            "reason": "Instructor rationale",
        }
    )

    result = _preserve_grade_clarification_context(
        {
            "action": "clarify",
            "question": "Which assignment?",
            "partial_plan": {"local_course_id": 7},
        },
        action,
    )

    assert result["partial_plan"] == {
        "local_course_id": 7,
        "assignment_reference": "ggg",
        "student_reference": "coin",
        "new_grade": "100",
        "feedback": "Instructor rationale",
    }
    assert result["_server_preserved_grade_context"] == {
        "new_grade": "100",
        "feedback": "Instructor rationale",
    }
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
        feedback="Curve applied",
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
        "feedback": "Curve applied",
    }
    assert result["message"] == (
        "I found Coin and Mn for COSC 777. Open the Grades tab to review the Canvas "
        "preview, warnings, and approval step before anything is submitted."
    )

    # The handoff stays JSON-safe because the assistant transcript persists
    # the full reply envelope before the frontend opens the Grades tab.
    json.dumps(result["grade_handoff"])


def test_grade_handoff_uses_assignment_name_and_single_student_name():
    course = Course(id=7, name="COSC 777", canvas_course_id="77", instructor_id=1)
    result = _build_grade_handoff_result(
        course,
        assignment_id=10,
        submissions=[
            {"id": 1, "assignment_id": 10, "user_id": 101, "student_name": "Coin"},
        ],
        new_grade="100",
        feedback=None,
        assignment_name="Recursion Homework",
    )

    assert result["grade_handoff"]["assignment_label"] == 'assignment "Recursion Homework"'
    assert "Coin for COSC 777" in result["message"]
    assert "1 student" not in result["message"]


def test_grade_handoff_falls_back_to_student_count_for_large_sets():
    course = Course(id=7, name="COSC 777", canvas_course_id="77", instructor_id=1)
    submissions = [
        {"user_id": index, "student_name": f"Student {index}"}
        for index in range(101, 106)
    ]
    result = _build_grade_handoff_result(
        course,
        assignment_id=10,
        submissions=submissions,
        new_grade="100",
        feedback=None,
    )

    assert "5 students for COSC 777" in result["message"]
    assert "Student 101" not in result["message"]


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
        feedback=None,
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
            # Deprecated spelling: still accepted at the LLM boundary and
            # normalized to feedback, so an older prompt cannot drop the text.
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
        "feedback": "Curve adjustment",
    }


def test_bulk_student_reference_tolerates_common_student_typo():
    # Covers a real prompt typo seen in review: "all astudent" should still be
    # understood as a bulk/all-students grade request.
    assert _is_bulk_student_reference("all astudent") is True
