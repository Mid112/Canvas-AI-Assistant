from app.schemas.canvas import SubmissionResponse, SubmissionStatus
from app.schemas.student import StudentResponse
from app.services.llm.student_context import (
    collect_grounded_ids,
    filter_grounded_dict_fields,
    format_llm_student_listing,
    llm_safe_student_dict,
    llm_safe_submission_dict,
    llm_student_candidates,
    strip_ungrounded_ids,
)


def test_llm_student_candidates_strip_identifiers():
    candidates = llm_student_candidates(
        [
            {
                "canvas_user_id": "77",
                "name": "Alex Chen",
                "login_id": "alex",
                "email": "alex@example.edu",
            }
        ]
    )
    assert candidates == [{"user_id": 77, "name": "Alex Chen"}]
    listing = format_llm_student_listing(candidates)
    assert "login_id" not in listing
    assert "email" not in listing
    assert "Alex Chen" in listing


def test_llm_safe_submission_dict_strips_contact_fields():
    # Feature 14 (#908): tool results echoed to the LLM must not include
    # student email/login even when Canvas returned them on the submission.
    submission = SubmissionResponse(
        id=9,
        assignment_id=10,
        user_id=42,
        student_name="Alex Chen",
        student_email="alex@example.edu",
        student_login_id="alex",
        workflow_state="graded",
        status=SubmissionStatus.graded,
        score=88.0,
        grade="88",
    )
    safe = llm_safe_submission_dict(submission)
    assert safe["user_id"] == 42
    assert safe["student_name"] == "Alex Chen"
    assert safe["grade"] == "88"
    assert "student_email" not in safe
    assert "student_login_id" not in safe
    assert "email" not in safe
    assert "login_id" not in safe


def test_llm_safe_student_dict_strips_login_id():
    student = StudentResponse(
        id=1,
        canvas_user_id="42",
        course_id=7,
        name="Alex Chen",
        sortable_name="Chen, Alex",
        login_id="alex@example.edu",
        enrollment_state="active",
    )
    safe = llm_safe_student_dict(student)
    assert safe == {
        "id": 1,
        "canvas_user_id": "42",
        "course_id": 7,
        "name": "Alex Chen",
        "enrollment_state": "active",
    }
    assert "login_id" not in safe
    assert "sortable_name" not in safe


def test_collect_grounded_ids_from_tool_payloads():
    grounded = collect_grounded_ids(
        [
            {
                "assignments": [{"id": 10, "course_id": 3}],
                "students": [{"canvas_user_id": "77", "name": "Alex Chen"}],
            }
        ]
    )
    assert grounded == {3, 10, 77}


def test_strip_ungrounded_ids_redacts_unknown_numbers():
    text = strip_ungrounded_ids(
        "Assignment 10 for student 77 and mystery 99999.",
        {10, 77},
    )
    assert "Assignment 10" in text
    assert "student 77" in text
    assert "99999" not in text
    assert "[ID redacted]" in text


def test_filter_grounded_dict_fields():
    filtered = filter_grounded_dict_fields(
        {"assignment_id": 10, "student_id": 999, "title": "HW1"},
        {10},
    )
    assert filtered == {"title": "HW1", "assignment_id": 10}
    assert "student_id" not in filtered


def test_strip_ungrounded_canvas_id_claims_keeps_years_and_points():
    from app.services.llm.student_context import strip_ungrounded_canvas_id_claims

    text = strip_ungrounded_canvas_id_claims(
        "Assignment id 10 due in 2026 is worth 100 points; student_id 999 is wrong.",
        {10},
    )
    assert "Assignment id 10" in text
    assert "2026" in text
    assert "100 points" in text
    assert "student_id [ID redacted]" in text
    assert "999" not in text


def test_strip_ungrounded_canvas_id_claims_keeps_assignment_titles():
    from app.services.llm.student_context import strip_ungrounded_canvas_id_claims

    text = strip_ungrounded_canvas_id_claims(
        "Which assignment in CPSC 310 did you mean? Options: Assignment 1, Assignment 2.",
        set(),
    )
    assert "Assignment 1" in text
    assert "Assignment 2" in text
    assert "[ID redacted]" not in text
    assert "assignment: 999" not in strip_ungrounded_canvas_id_claims(
        "See assignment: 999 for details.",
        set(),
    )


def test_ground_assistant_result_scrubs_respond_and_proposed_action():
    from app.services.llm.student_context import ground_assistant_result

    grounded_tool = {
        "assignments": [{"id": 10, "name": "HW1", "course_id": 3}],
        "submissions": [{"user_id": 77, "grade": "88", "score": 88}],
    }
    result, tool_facts = ground_assistant_result(
        {
            "action": "respond",
            "message": (
                'Assignment id 10 "HW1" scored 88; '
                'assignment_id 555 and "Fake Homework" scored 99.'
            ),
            "proposed_action": {
                "action": "update_grade",
                "assignment_id": 10,
                "student_id": 999,
            },
        },
        tool_results=[grounded_tool],
        field_memory={"local_course_id": 3, "assignment_id": 555, "grade": "99"},
    )
    assert "Assignment id 10" in result["message"]
    assert '"HW1"' in result["message"]
    assert "scored 88" in result["message"]
    assert "[ID redacted]" in result["message"]
    assert "[grade redacted]" in result["message"]
    assert "[name redacted]" in result["message"]
    assert "555" not in result["message"]
    assert result["proposed_action"]["assignment_id"] == 10
    assert "student_id" not in result["proposed_action"]
    assert result["grounded"] is True
    assert 10 in tool_facts.ids
    assert "hw1" in tool_facts.names


def test_ground_assistant_result_ignores_scalar_field_memory_as_retrieval_source():
    from app.services.llm.student_context import ground_assistant_result

    result, _tool_facts = ground_assistant_result(
        {
            "action": "respond",
            "message": 'Student scored 99 on "Remembered Homework".',
        },
        tool_results=[],
        field_memory={
            "assignment_id": 555,
            "name": "Remembered Homework",
            "grade": "99",
        },
    )
    assert "[grade redacted]" in result["message"]
    assert "[name redacted]" in result["message"]
    assert "grounded" not in result


def test_ground_assistant_result_reuses_prior_tool_grounded_facts():
    """#1303: prior tool-derived grounded_facts authorize later-turn titles."""
    from app.services.llm.student_context import ground_assistant_result

    result, _tool_facts = ground_assistant_result(
        {
            "action": "respond",
            "message": 'Yes — "HW1" scored 88 for that student.',
        },
        tool_results=[],
        field_memory={
            "grounded_facts": {
                "ids": [10, 77],
                "names": ["hw1"],
                "grades": ["88"],
                "dates": [],
            }
        },
    )
    assert '"HW1"' in result["message"]
    assert "scored 88" in result["message"]
    assert "[name redacted]" not in result["message"]
    assert "[grade redacted]" not in result["message"]


def test_ground_assistant_result_scrubs_invented_claims_without_tools():
    from app.services.llm.student_context import ground_assistant_result

    result, _tool_facts = ground_assistant_result(
        {
            "action": "respond",
            "message": 'Assignment id 42 "Invented Title" scored 77.',
        },
        tool_results=None,
    )
    assert "[ID redacted]" in result["message"]
    assert "[grade redacted]" in result["message"]
    assert "[name redacted]" in result["message"]
