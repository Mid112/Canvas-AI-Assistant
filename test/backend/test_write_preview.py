from app.models.course import Course
from app.services.write_preview import generate_write_preview

COURSE = Course(id=1, canvas_course_id="1", canvas_url="http://localhost:3000", name="cosc 501", instructor_id=1)


def test_create_assignment_preview_reversible_and_resources():
    preview = generate_write_preview(
        {"action": "create_assignment", "title": "Midterm", "due_date": "2030-01-01T00:00:00", "points_possible": 100},
        COURSE,
    )
    assert preview["reversible"] is True
    assert "reversibility_note" not in preview
    assert preview["affected_resources"] == [
        {"type": "course", "id": 1, "name": "cosc 501", "status": "unchanged"},
        {"type": "assignment", "id": None, "name": "Midterm", "status": "created"},
    ]


def test_update_assignment_preview_resources_reflect_changed_fields():
    preview = generate_write_preview(
        {"action": "update_assignment", "assignment_id": 42, "points_possible": 50},
        COURSE,
    )
    assert preview["reversible"] is True
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["course"]["status"] == "unchanged"
    assert resources["assignment"]["status"] == "modified"
    assert resources["assignment"]["id"] == 42
    assert resources["assignment"]["changed_fields"] == ["points_possible"]


def test_send_message_preview_is_irreversible_with_note_and_audience():
    preview = generate_write_preview(
        {"action": "send_message", "subject": "Reminder", "body": "Please submit by Friday"},
        COURSE,
    )
    assert preview["reversible"] is False
    assert preview["reversibility_note"] == "This action cannot be undone once submitted."
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["course"]["status"] == "unchanged"
    assert resources["announcement"]["status"] == "created"
    # Canvas-free at preview time — the real enrolled count isn't known yet
    assert preview["audience"] == {"scope": "entire_class", "size": None}


def test_update_grade_preview_marks_submission_modified():
    preview = generate_write_preview(
        {"action": "update_grade", "assignment_id": 1, "student_id": 2, "new_grade": "A"},
        COURSE,
    )
    assert preview["reversible"] is True
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["submission"]["status"] == "modified"
    assert resources["submission"]["changed_fields"] == ["grade"]


def test_unrecognized_action_falls_back_safely():
    """generate_write_preview's fallback (_preview_generic) is only ever
    reached in practice for a read action if something upstream mis-routes
    it here (dispatcher.py's write_actions gate normally prevents that
    entirely, returning a bare {"action": ...} for reads instead without
    calling generate_write_preview at all). Confirms the fallback itself
    stays safe rather than fabricating resources for a non-write action."""
    preview = generate_write_preview({"action": "fetch_courses"}, COURSE)
    assert preview["affected_resources"] == []
    assert preview["reversible"] is True
