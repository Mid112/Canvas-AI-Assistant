from app.mcp_tools.schemas import ACTION_CLASSIFICATION, ACTION_SCHEMAS, is_reversible

CONVERSATIONAL_ACTIONS = {"out_of_scope", "clarify", "intent_preview", "respond"}


# Verifies: Read actions are read only.
def test_read_actions_are_read_only():
    for action in ("fetch_courses", "fetch_assignments", "fetch_submissions", "get_active_course"):
        assert ACTION_CLASSIFICATION[action] == "read_only"


# Verifies: Writes are modifying.
def test_writes_are_modifying():
    for action in ("set_active_course", "create_assignment", "update_assignment", "update_grade"):
        assert ACTION_CLASSIFICATION[action] == "modifying"


# Verifies: Send message is irreversible.
def test_send_message_is_irreversible():
    assert ACTION_CLASSIFICATION["send_message"] == "irreversible"


# Verifies: Conversational actions are not classified.
def test_conversational_actions_are_not_classified():
    """out_of_scope/clarify/intent_preview/respond aren't Canvas operations
    at all — they shouldn't appear in the classification table."""
    for action in CONVERSATIONAL_ACTIONS:
        assert action not in ACTION_CLASSIFICATION


# Verifies: Every real action schema is classified.
def test_every_real_action_schema_is_classified():
    """Every action in ACTION_SCHEMAS other than the conversational ones
    must have a classification — update_grade is the one exception
    (classified despite having no schema, since it's still previewable)."""
    for action in ACTION_SCHEMAS:
        if action in CONVERSATIONAL_ACTIONS:
            continue
        assert action in ACTION_CLASSIFICATION, f"{action} has a schema but no classification"


# Verifies: Is reversible matches classification.
def test_is_reversible_matches_classification():
    assert is_reversible("fetch_courses") is True
    assert is_reversible("create_assignment") is True
    assert is_reversible("update_assignment") is True
    assert is_reversible("send_message") is False


# Verifies: Is reversible fails closed on unknown action.
def test_is_reversible_fails_closed_on_unknown_action():
    """Safety-facing metadata should never silently treat an unrecognized
    action as reversible."""
    assert is_reversible("some_future_action_nobody_classified_yet") is False
