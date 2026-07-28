"""Fuzz / property-based tests for pure parsers and validators (#1301).

These feed random, invalid, and unexpected inputs into isolated helpers to
surface crashes and invariant breaks. They do not hit the network or DB.

Run with:
  make test-fuzz

Excluded from the default `make test` / CI suite via the ``fuzz`` marker so
longer Hypothesis runs stay opt-in.
"""

from __future__ import annotations

import json
import re

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.core.canvas_url import canvas_urls_equivalent, normalize_canvas_url
from app.core.secret_redaction import redact_secrets, safe_exception_text
from app.mcp_tools.dispatcher import ToolExecutionError, parse_action
from app.services.llm.json_extraction import (
    escape_control_chars_in_json_strings,
    extract_json_object,
    loads_llm_json,
)

pytestmark = pytest.mark.fuzz

# Keep local fuzz runs bounded; raise max_examples when hunting regressions.
_FUZZ_SETTINGS = settings(
    max_examples=80,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
)

# Prefer text that stresses braces/quotes/control chars without megabyte blobs.
_messy_text = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "S", "Z"),
        whitelist_characters=" \t\n\r\\\"{}[]<>:/@.-_",
    ),
    min_size=0,
    max_size=200,
)


@_FUZZ_SETTINGS
@given(raw=_messy_text)
def test_fuzz_extract_json_object_never_crashes(raw: str) -> None:
    """extract_json_object must always return a str for any unicode input."""
    result = extract_json_object(raw)
    assert isinstance(result, str)


@_FUZZ_SETTINGS
@given(raw=_messy_text)
def test_fuzz_escape_control_chars_never_crashes(raw: str) -> None:
    escaped = escape_control_chars_in_json_strings(raw)
    assert isinstance(escaped, str)


@_FUZZ_SETTINGS
@given(raw=_messy_text)
def test_fuzz_loads_llm_json_only_raises_expected_errors(raw: str) -> None:
    """loads_llm_json may fail to parse, but must not raise unexpected types."""
    try:
        data = loads_llm_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError):
        return
    assert isinstance(data, dict)


@_FUZZ_SETTINGS
@given(raw=_messy_text)
def test_fuzz_parse_action_only_raises_tool_execution_error(raw: str) -> None:
    """Malformed model output must surface as ToolExecutionError, never crash."""
    try:
        action = parse_action(raw)
    except ToolExecutionError as exc:
        assert exc.user_message
        assert "Raw output" not in exc.user_message
        return
    assert getattr(action, "action", None)


@_FUZZ_SETTINGS
@given(url=_messy_text)
def test_fuzz_normalize_canvas_url_never_crashes(url: str) -> None:
    normalized = normalize_canvas_url(url)
    assert isinstance(normalized, str)
    assert not normalized.endswith("/") or normalized == ""


@_FUZZ_SETTINGS
@given(left=_messy_text, right=_messy_text)
def test_fuzz_canvas_urls_equivalent_never_crashes(left: str, right: str) -> None:
    result = canvas_urls_equivalent(left, right)
    assert isinstance(result, bool)
    if normalize_canvas_url(left) == normalize_canvas_url(right):
        assert result is True


@_FUZZ_SETTINGS
@given(text=_messy_text)
def test_fuzz_redact_secrets_returns_str_and_never_crashes(text: str) -> None:
    redacted = redact_secrets(text)
    assert isinstance(redacted, str)
    assert not re.search(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b", redacted)


@_FUZZ_SETTINGS
@given(message=_messy_text)
def test_fuzz_safe_exception_text_never_crashes(message: str) -> None:
    text = safe_exception_text(RuntimeError(message))
    assert isinstance(text, str)
    assert text.startswith("RuntimeError:")


@_FUZZ_SETTINGS
@given(
    payload=st.fixed_dictionaries(
        {
            "action": st.sampled_from(
                [
                    "respond",
                    "clarify",
                    "out_of_scope",
                    "fetch_assignments",
                    "not_a_real_action",
                ]
            ),
            "message": st.text(max_size=80),
        }
    ),
    prefix=st.text(max_size=40),
    suffix=st.text(max_size=40),
)
def test_fuzz_parse_action_around_embedded_json(
    payload: dict,
    prefix: str,
    suffix: str,
) -> None:
    """JSON buried in noise still must not crash the parser."""
    raw = f"{prefix}\n{json.dumps(payload)}\n{suffix}"
    try:
        action = parse_action(raw)
    except ToolExecutionError:
        return
    assert getattr(action, "action", None) == payload["action"]
