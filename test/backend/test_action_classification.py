import pytest

from app.mcp_tools.schemas import ACTION_CLASSIFICATION, ACTION_SCHEMAS, is_reversible

# These are semantic/meta envelopes, not Canvas operations.  Keep this list in
# sync with ACTION_SCHEMAS so adding a language-facing intent envelope does not
# make the classification completeness test fail.
CONVERSATIONAL_ACTIONS = {
    "out_of_scope",
    "clarify",
    "intent_preview",
    "respond",
    # A language-facing envelope, not a Canvas operation: normalize_semantic_intent
    # rewrites it into one of the strict actions before anything is dispatched, so
    # the action that gets classified is always the rewritten one. Classifying the
    # envelope itself would invent a risk level for something that never executes.
    "semantic_intent",
    # Also an envelope: it holds ordinary actions and the step loop runs each
    # one through the normal dispatch, so every step is classified on its own.
    # Classifying the plan would be worse than redundant — READ_ACTIONS and
    # WRITE_ACTIONS are both derived from ACTION_CLASSIFICATION, so a
    # "read_only" entry here would put action_plan in READ_ACTIONS and the
    # loop would treat a plan envelope as a chainable read of its own.
    "action_plan",
}


# Verifies: Read actions are read only.
def test_read_actions_are_read_only():
    for action in ("fetch_courses", "fetch_assignments", "fetch_submissions", "get_active_course"):
        assert ACTION_CLASSIFICATION[action] == "read_only"


# Verifies: Undoable writes are modifying.
def test_writes_are_modifying():
    for action in ("set_active_course", "create_assignment", "update_assignment"):
        assert ACTION_CLASSIFICATION[action] == "modifying"


# Verifies: Writes without undo paths are irreversible.
@pytest.mark.requirement("FR7.6")
def test_writes_without_undo_paths_are_irreversible():
    assert ACTION_CLASSIFICATION["send_message"] == "irreversible"
    assert ACTION_CLASSIFICATION["update_grade"] == "irreversible"


# Verifies: Conversational actions are not classified.
def test_conversational_actions_are_not_classified():
    """Meta actions aren't Canvas operations
    at all — they shouldn't appear in the classification table."""
    for action in CONVERSATIONAL_ACTIONS:
        assert action not in ACTION_CLASSIFICATION


# Verifies: Every real action schema is classified.
@pytest.mark.requirement("FR7.6")
def test_every_real_action_schema_is_classified():
    """Every action in ACTION_SCHEMAS other than the conversational ones
    must have a classification — update_grade is the one exception
    (classified despite having no schema, since it's still previewable)."""
    for action in ACTION_SCHEMAS:
        if action in CONVERSATIONAL_ACTIONS:
            continue
        assert action in ACTION_CLASSIFICATION, f"{action} has a schema but no classification"


# Verifies: Is reversible matches classification.
@pytest.mark.requirement("FR7.6")
def test_is_reversible_matches_classification():
    assert is_reversible("fetch_courses") is True
    assert is_reversible("create_assignment") is True
    assert is_reversible("update_assignment") is True
    assert is_reversible("update_grade") is False
    assert is_reversible("send_message") is False


# Verifies: Is reversible fails closed on unknown action.
def test_is_reversible_fails_closed_on_unknown_action():
    """Safety-facing metadata should never silently treat an unrecognized
    action as reversible."""
    assert is_reversible("some_future_action_nobody_classified_yet") is False
