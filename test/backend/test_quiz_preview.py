from app.models.course import Course
from app.mcp_tools.schemas import get_risk_level
from app.services.write_preview import generate_write_preview

COURSE = Course(id=1, canvas_course_id="1", canvas_url="http://localhost:3000", name="cosc 501", instructor_id=1)


def test_create_quiz_preview_reversible_risk_and_resources():
    preview = generate_write_preview(
        {
            "action": "create_quiz",
            "title": "Recursion Quiz",
            "description": "Cover base cases and recursive thinking.",
            "due_date": "2030-01-01T00:00:00",
            "points_possible": 25,
            "questions": [
                {"question_text": "What is a base case?", "question_type": "essay_question"},
                {"question_text": "True or false: recursion needs a base case", "question_type": "true_false_question"},
            ],
        },
        COURSE,
    )
    assert preview["reversible"] is True
    assert preview["risk_level"] == "medium"
    assert get_risk_level("create_quiz") == "medium"
    assert "2 questions" in preview["summary"]
    assert preview["affected_resources"] == [
        {"type": "course", "id": 1, "name": "cosc 501", "status": "unchanged"},
        {"type": "quiz", "id": None, "name": "Recursion Quiz", "status": "created"},
    ]



