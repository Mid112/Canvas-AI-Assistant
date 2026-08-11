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

# How many tokens each test has already asked for. Per-test uniqueness alone
# was not enough: a test that registers TWO instructors called this twice, got
# the same value both times, and the second connection hit
# uq_canvas_url_token_fingerprint — so it silently ended up with no Canvas
# connection and the test failed later, on an unrelated-looking assertion,
# with an error body where a course list should have been.
_CALLS_PER_TEST: dict[str, int] = {}


def unique_canvas_token() -> str:
    """Return a token no other account in this database is using.

    Stable *for the first call in a test*, so a test that asserts the token
    handed to a mocked Canvas call still sees the value it always did. Each
    further call within the same test gets its own, which is what a test
    registering more than one instructor needs — they cannot share a
    fingerprint any more than two real accounts could.

    Pytest exposes the current test identifier while it is running, which keeps
    separate tests apart; _RUN_SALT extends that to separate runs against a
    database that outlives them.
    """
    test_id = os.environ.get("PYTEST_CURRENT_TEST", "unknown-test").split(
        " (", 1
    )[0]
    seen = _CALLS_PER_TEST.get(test_id, 0)
    _CALLS_PER_TEST[test_id] = seen + 1
    # The first call keeps the original digest input exactly, so nothing that
    # depended on the old value changes.
    seed = f"{_RUN_SALT}:{test_id}" if seen == 0 else f"{_RUN_SALT}:{test_id}:{seen}"
    digest = hashlib.sha256(seed.encode()).hexdigest()[:16]
    return f"test-token-{digest}"
