from app.services.risk import classify_action_risk


def test_fetch_courses_is_low_risk_without_confirmation() -> None:
    risk = classify_action_risk("fetch_courses")

    assert risk["risk_level"] == "low"
    assert risk["classification"] == "read_only"
    assert risk["requires_confirmation"] is False
    assert risk["confirmation_requirement"]["type"] == "none"
    assert risk["reversible"] is True
    assert risk["can_undo"] is False


def test_assignment_writes_are_medium_risk_and_undoable() -> None:
    for action_name in ("create_assignment", "update_assignment"):
        risk = classify_action_risk(action_name)

        assert risk["risk_level"] == "medium"
        assert risk["classification"] == "modifying"
        assert risk["requires_confirmation"] is True
        assert risk["confirmation_requirement"]["type"] == "standard"
        assert risk["reversible"] is True
        assert risk["undoable"] is True
        assert risk["can_undo"] is True


def test_send_message_is_high_risk_and_not_undoable() -> None:
    risk = classify_action_risk("send_message", {"recipient_canvas_user_ids": [1]})

    assert risk["risk_level"] == "high"
    assert risk["classification"] == "irreversible"
    assert risk["requires_confirmation"] is True
    assert risk["confirmation_requirement"]["type"] == "strong"
    assert risk["reversible"] is False
    assert risk["undoable"] is False
    assert risk["can_undo"] is False
    assert risk["warnings"]


def test_unknown_action_fails_closed_as_high_risk() -> None:
    risk = classify_action_risk("delete_everything")

    assert risk["risk_level"] == "high"
    assert risk["classification"] == "unknown"
    assert risk["requires_confirmation"] is True
    assert risk["confirmation_requirement"]["type"] == "strong"
    assert risk["reversible"] is False
    assert risk["can_undo"] is False
    assert any("not recognized" in warning for warning in risk["warnings"])
