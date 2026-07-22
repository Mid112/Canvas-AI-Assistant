from app.services.llm.student_context import (
    format_llm_student_listing,
    llm_student_candidates,
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
