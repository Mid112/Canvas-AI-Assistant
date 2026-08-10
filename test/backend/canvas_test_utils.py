"""Test-only values that stay isolated when suites share one database."""

from __future__ import annotations

import hashlib
import os
import uuid

# One random value per pytest process, mixed into every generated token.
#
# Without it the token was a pure function of the test's name, which made the
# fingerprint stable across RUNS as well as within one. The app enforces
# uq_canvas_url_token_fingerprint (canvas_url, token_fingerprint) — deliberately,
# so two accounts cannot share a Canvas token — so the second run of a test
# tried to claim a fingerprint the first run's throwaway user already owned,
# got a 409, and reached the assertions with no Canvas connection at all. Every
# affected test passed exactly once per database and failed on every rerun
# until someone wiped the volume.
#
# Per process, not per call: a test may assert the token handed to a mocked
# Canvas call, so it still has to be stable for the length of that test.
_RUN_SALT = uuid.uuid4().hex


def unique_canvas_token() -> str:
    """Return one stable token per pytest test, without using a real secret.

    The same test may assert the token passed to a mocked Canvas call, so the
    value must be stable during that test. Pytest exposes the current test
    identifier while it is running, which keeps separate tests from claiming
    the same database fingerprint; _RUN_SALT extends that isolation to separate
    runs against a database that outlives them.
    """
    test_id = os.environ.get("PYTEST_CURRENT_TEST", "unknown-test").split(
        " (", 1
    )[0]
    digest = hashlib.sha256(f"{_RUN_SALT}:{test_id}".encode()).hexdigest()[:16]
    return f"test-token-{digest}"
