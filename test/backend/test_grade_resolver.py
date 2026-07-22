from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat import _run_update_grade_chain


@pytest.mark.asyncio
async def test_grade_resolver_uses_real_assignment_and_student_candidates():
    db = AsyncMock()
    user = MagicMock(id=1)
    conversation = SimpleNamespace(id=9)
    user_message_row = SimpleNamespace(id=11)
    course = SimpleNamespace(id=3, name="CPSC 310", canvas_url="https://canvas")
    action = SimpleNamespace(
        local_course_id=3,
        assignment_id=None,
        assignment_reference="the midterm",
        student_id=None,
        student_reference="Alex",
        new_grade="85",
        feedback="Good improvement",
    )

    async def tracked_read(*args):
        await args[-1]
        return {
            "students": [
                {
                    "canvas_user_id": "77",
                    "name": "Alex Chen",
                    "login_id": "alex",
                    "enrollment_state": "active",
                }
            ]
        }

    with (
        patch(
            "app.services.chat._resolve_course_and_assignment",
            new=AsyncMock(return_value=(course, 44)),
        ),
        patch(
            "app.services.chat._run_tracked_read",
            new=AsyncMock(side_effect=tracked_read),
        ),
        patch(
            "app.services.chat.execute_tool",
            new=AsyncMock(return_value={"students": []}),
        ),
        patch(
            "app.services.chat._resolve_students_via_llm",
            new=AsyncMock(return_value={"Alex": 77}),
        ) as resolve_student,
    ):
        result = await _run_update_grade_chain(
            db,
            user,
            conversation,
            user_message_row,
            action,
            "give Alex 85 on the midterm",
            AsyncMock(),
        )

    assert result["intent_preview"] is True
    assert result["proposed_action"]["assignment_id"] == 44
    assert result["proposed_action"]["student_id"] == 77
    assert "Alex" in result["summary"]
    resolve_student.assert_awaited_once()
