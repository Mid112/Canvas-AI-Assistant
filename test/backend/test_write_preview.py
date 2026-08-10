from app.models.course import Course
from app.services.write_preview import generate_write_preview

COURSE = Course(id=1, canvas_course_id="1", canvas_url="http://localhost:3000", name="cosc 501", instructor_id=1)


# Verifies: Create assignment preview reversible and resources.
def test_create_assignment_preview_reversible_and_resources():
    preview = generate_write_preview(
        {"action": "create_assignment", "title": "Midterm", "due_date": "2030-01-01T00:00:00", "points_possible": 100},
        COURSE,
    )
    assert preview["reversible"] is True
    assert preview["risk_metadata"]["risk_level"] == "medium"
    assert preview["risk_metadata"]["confirmation_requirement"]["type"] == "standard"
    assert "reversibility_note" not in preview
    assert preview["affected_resources"] == [
        {"type": "course", "id": 1, "name": "cosc 501", "status": "unchanged"},
        {"type": "assignment", "id": None, "name": "Midterm", "status": "created"},
    ]


# Verifies: Update assignment preview resources reflect changed fields.
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
    assert resources["assignment"]["name"] == "Assignment 42"
    assert resources["assignment"]["changed_fields"] == ["points_possible"]
    assert "(ID 42)" in preview["summary"]


# Verifies: Update assignment preview prefers the resolved assignment name.
def test_update_assignment_preview_uses_assignment_name_when_available():
    preview = generate_write_preview(
        {
            "action": "update_assignment",
            "assignment_id": 42,
            "assignment_name": "Final Project",
            "due_date": "2030-01-01T00:00:00",
        },
        COURSE,
    )
    assert "'Final Project'" in preview["summary"]
    assert "(ID 42)" not in preview["summary"]
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["assignment"]["name"] == "Final Project"


# Verifies: Send message preview is irreversible with note and audience.
def test_send_message_preview_is_irreversible_with_note_and_audience():
    preview = generate_write_preview(
        {"action": "send_message", "subject": "Reminder", "body": "Please submit by Friday"},
        COURSE,
    )
    assert preview["reversible"] is False
    assert preview["risk_metadata"]["risk_level"] == "high"
    assert preview["risk_metadata"]["confirmation_requirement"]["type"] == "strong"
    assert preview["risk_metadata"]["can_undo"] is False
    assert preview["reversibility_note"] == "This action cannot be undone once submitted."
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["course"]["status"] == "unchanged"
    assert resources["announcement"]["status"] == "created"
    assert preview["audience"] == {"scope": "entire_class", "size": None}


# Verifies: Send message preview supports selected recipients.
def test_send_message_preview_supports_selected_recipients():
    preview = generate_write_preview(
        {
            "action": "send_message",
            "subject": "Reminder",
            "body": "Please submit by Friday",
            "recipient_canvas_user_ids": [101, 102],
        },
        COURSE,
    )
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["conversation"]["status"] == "created"
    assert preview["audience"] == {"scope": "selected_students", "size": 2}
    assert "2 selected student" in preview["summary"]


# Verifies: an omitted subject does not become a pair of empty quotes.
# schemas.py leaves subject/body optional so a bare recipient set can be handed
# to the Messages compose form (#1310), which made the summary read
# Send "" as a private Canvas message to ... -- as though the instructor's own
# words had been dropped somewhere between chat and the preview.
def test_send_message_preview_without_subject_does_not_quote_an_empty_string():
    preview = generate_write_preview(
        {
            "action": "send_message",
            "recipient_canvas_user_ids": [101, 102],
            "recipient_names": ["Student One", "Student Two"],
        },
        COURSE,
    )
    assert '""' not in preview["summary"]
    assert preview["summary"] == (
        "Draft a private Canvas message to Student One, Student Two in cosc 501."
    )
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["conversation"]["name"] == "Untitled message"


# Verifies: the same for the announcement half of the branch.
def test_announcement_preview_without_subject_does_not_quote_an_empty_string():
    preview = generate_write_preview({"action": "send_message"}, COURSE)

    assert '""' not in preview["summary"]
    assert preview["summary"] == (
        "Draft an announcement for the entire class in cosc 501."
    )
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["announcement"]["name"] == "Untitled announcement"


# Verifies: a subject the instructor did supply is still quoted verbatim. The
# empty-subject wording above must not swallow the normal case.
def test_send_message_preview_still_quotes_a_supplied_subject():
    preview = generate_write_preview(
        {
            "action": "send_message",
            "subject": "  Reminder  ",
            "body": "Please submit by Friday",
            "recipient_canvas_user_ids": [101],
            "recipient_names": ["Student One"],
        },
        COURSE,
    )
    assert preview["summary"] == (
        'Send "Reminder" as a private Canvas message to Student One in cosc 501.'
    )
    assert preview["metadata"]["subject"] == "Reminder"


# Verifies: Update grade preview marks submission modified.
def test_update_grade_preview_marks_submission_modified():
    preview = generate_write_preview(
        {"action": "update_grade", "assignment_id": 1, "student_id": 2, "new_grade": "A"},
        COURSE,
    )
    # Grade updates keep history, but they are not automatically undoable yet.
    assert preview["reversible"] is False
    resources = {r["type"]: r for r in preview["affected_resources"]}
    assert resources["submission"]["status"] == "modified"
    assert resources["submission"]["changed_fields"] == ["grade"]


# Verifies: Unrecognized action falls back safely.
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


# Verifies: Risk service classifies read-only actions as low risk.
def test_read_only_preview_risk_metadata_is_low():
    preview = generate_write_preview({"action": "fetch_courses"}, COURSE)
    assert preview["risk_metadata"]["risk_level"] == "low"
    assert preview["risk_metadata"]["requires_confirmation"] is False
