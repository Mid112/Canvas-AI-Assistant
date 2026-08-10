"""Test-only values that stay isolated when suites share one database."""

from __future__ import annotations

import hashlib
import os


def unique_canvas_token() -> str:
    """Return one stable token per pytest test, without using a real secret.

    The same test may assert the token passed to a mocked Canvas call, so the
    value must be stable during that test. Pytest exposes the current test
    identifier while it is running, which keeps separate tests from claiming
    the same database fingerprint.
    """
    test_id = os.environ.get("PYTEST_CURRENT_TEST", "unknown-test").split(
        " (", 1
    )[0]
    digest = hashlib.sha256(test_id.encode()).hexdigest()[:16]
    return f"test-token-{digest}"
