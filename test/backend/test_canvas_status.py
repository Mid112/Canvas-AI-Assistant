from app.services.canvas_status import CanvasWriteResult


# Verifies: Reversible result has no reversibility note.
def test_reversible_result_has_no_reversibility_note():
    result = CanvasWriteResult(
        action="create_assignment",
        data={"id": 1, "name": "Midterm"},
        reversible=True,
        affected_resources=[{"type": "assignment", "id": 1, "status": "created"}],
    )
    body = result.to_dict()
    assert body["reversible"] is True
    assert "reversibility_note" not in body
    assert body["affected_resources"] == [{"type": "assignment", "id": 1, "status": "created"}]


# Verifies: Irreversible result includes reversibility note.
def test_irreversible_result_includes_reversibility_note():
    result = CanvasWriteResult(
        action="send_message",
        data={"course_id": 1, "subject": "Reminder", "audience_size": 12},
        reversible=False,
        affected_resources=[{"type": "announcement", "id": None, "status": "created"}],
    )
    body = result.to_dict()
    assert body["reversible"] is False
    assert body["reversibility_note"] == "This action was not reversible."


# Verifies: Affected resources always a list even when empty.
def test_affected_resources_always_a_list_even_when_empty():
    result = CanvasWriteResult(action="update_grade", data={}, reversible=True, affected_resources=[])
    assert result.to_dict()["affected_resources"] == []


# Verifies: Success defaults true and data model dump still used.
def test_success_defaults_true_and_data_model_dump_still_used():
    """model_dump() handling for Pydantic .data objects is unchanged by
    the new fields — success still defaults True, data still model_dumps."""
    class _FakeModel:
        def model_dump(self):
            return {"id": 1}

    result = CanvasWriteResult(
        action="create_assignment", data=_FakeModel(), reversible=True, affected_resources=[]
    )
    body = result.to_dict()
    assert body["success"] is True
    assert body["data"] == {"id": 1}
