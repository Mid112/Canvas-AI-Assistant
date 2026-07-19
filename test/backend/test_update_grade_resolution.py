import json

from app.mcp_tools.schemas import UpdateGradeAction
from app.models.course import Course
from app.services.chat import (
    _build_grouped_grade_update_result,
    _grade_partial_plan,
    _is_bulk_student_reference,
)


def test_update_grade_action_accepts_numeric_grade():
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


def test_bulk_grade_update_builds_additional_previews():
    course = Course(id=7, name="COSC 777", canvas_course_id="77", instructor_id=1)
    result = _build_grouped_grade_update_result(
        course,
        assignment_id=10,
        submissions=[
            {"id": 1, "assignment_id": 10, "user_id": 101, "student_name": "Coin", "grade": None},
            {"id": 2, "assignment_id": 10, "user_id": 102, "student_name": "Mn", "grade": "88"},
        ],
        new_grade="100",
        reason="Curve applied",
    )

    assert result["intent_preview"] is True
    assert result["proposed_action"]["student_id"] == 101
    assert result["proposed_action"]["new_grade"] == "100"
    assert result["proposed_action"]["reason"] == "Curve applied"
    assert len(result["_extra_groups"]) == 1
    assert result["_extra_groups"][0]["proposed_action"]["student_id"] == 102

    # The snapshot is stored as JSON-safe data so Workflow.proposed_action
    # can persist it directly when the preview is created.
    json.dumps(result["proposed_action"]["current_submission"])


def test_grade_clarification_partial_plan_preserves_target_context():
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
    assert _is_bulk_student_reference("all astudent") is True
