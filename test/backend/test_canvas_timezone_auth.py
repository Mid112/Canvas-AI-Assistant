"""Canvas timezone storage on connection save (#1435)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.services.auth import update_canvas_token


def _saved_connection(db):
    return next(
        call.args[0]
        for call in db.add.call_args_list
        if hasattr(call.args[0], "encrypted_token")
    )


@pytest.mark.asyncio
async def test_update_canvas_token_stores_canvas_time_zone():
    db = AsyncMock()
    # Three scalar lookups, in order: no existing connection for this URL,
    # no other account already holding this token, then the refreshed user.
    # The old two-item side_effect predated the duplicate-token check being
    # added in the middle, so its truthy sentinel landed there instead of on
    # the refresh — and every one of these tests 409'd before ever reaching
    # the timezone it was written to assert on.
    db.scalar = AsyncMock(side_effect=[None, None, SimpleNamespace(id=1)])
    db.scalars = AsyncMock(return_value=SimpleNamespace(all=lambda: []))
    user = SimpleNamespace(id=1)

    # Patched at the Canvas boundary rather than on the helper, so the
    # extraction in fetch_canvas_time_zone is exercised too.
    #
    # Patching the *right* boundary is the point: this used to mock
    # fetch_self, whose real payload has no time_zone at any nesting, so it
    # asserted against a response Canvas does not send. The helper passed
    # here and returned None against every real Canvas it ever ran on.
    # test_fetches_the_profile_endpoint_not_the_user_endpoint below pins the
    # URL so the mock can't drift back off the endpoint that has the field.
    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self_profile",
            new=AsyncMock(return_value={"time_zone": "America/Vancouver"}),
        ),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.example.edu")

    assert _saved_connection(db).time_zone == "America/Vancouver"


@pytest.mark.asyncio
async def test_update_canvas_token_survives_an_unreachable_profile_endpoint():
    """The profile lookup is a nicety; the connection is the point.

    validate_token has already confirmed the token by the time the profile is
    read, so a failure here says nothing about whether the connection is good.
    Letting it propagate rejected a valid token with a 502 and stored no
    connection at all — losing the whole Canvas integration to recover a
    display preference, and taking most of the backend suite with it, since
    almost every test sets a Canvas token through this path.
    """
    db = AsyncMock()
    # Three scalar lookups, in order: no existing connection for this URL,
    # no other account already holding this token, then the refreshed user.
    # The old two-item side_effect predated the duplicate-token check being
    # added in the middle, so its truthy sentinel landed there instead of on
    # the refresh — and every one of these tests 409'd before ever reaching
    # the timezone it was written to assert on.
    db.scalar = AsyncMock(side_effect=[None, None, SimpleNamespace(id=1)])
    db.scalars = AsyncMock(return_value=SimpleNamespace(all=lambda: []))
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self_profile",
            new=AsyncMock(
                side_effect=HTTPException(status_code=502, detail="Could not reach Canvas")
            ),
        ),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.example.edu")

    connection = _saved_connection(db)
    assert connection.encrypted_token == "encrypted-token"
    assert connection.time_zone is None


@pytest.mark.asyncio
async def test_update_canvas_token_ignores_a_non_string_time_zone():
    """Canvas can return null for accounts that never set one."""
    db = AsyncMock()
    # Three scalar lookups, in order: no existing connection for this URL,
    # no other account already holding this token, then the refreshed user.
    # The old two-item side_effect predated the duplicate-token check being
    # added in the middle, so its truthy sentinel landed there instead of on
    # the refresh — and every one of these tests 409'd before ever reaching
    # the timezone it was written to assert on.
    db.scalar = AsyncMock(side_effect=[None, None, SimpleNamespace(id=1)])
    db.scalars = AsyncMock(return_value=SimpleNamespace(all=lambda: []))
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self_profile",
            new=AsyncMock(return_value={"time_zone": None}),
        ),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.example.edu")

    assert _saved_connection(db).time_zone is None


@pytest.mark.asyncio
async def test_fetches_the_profile_endpoint_not_the_user_endpoint():
    """The regression test the original fix needed and did not have.

    /api/v1/users/self returns a Canvas User: id, name, sortable_name,
    login_id, sis_user_id, integration_id, locale, permissions. No
    time_zone, under any name. /api/v1/users/self/profile returns a Profile,
    which has it. Reading the first meant fetch_canvas_time_zone returned
    None for every connection ever saved — 0 of 2431 rows in the dev
    database had a zone — and every due date was then interpreted and
    labelled UTC regardless of where the instructor actually was.

    Asserting on the URL rather than on a mocked payload is the whole point:
    a mock can be handed a time_zone that real Canvas would never send, and
    that is exactly how this passed while being wrong.
    """
    import httpx

    from app.services.canvas_timezone import fetch_canvas_time_zone

    requested: list[str] = []

    async def fake_get(client, url, **kwargs):
        requested.append(url)
        return httpx.Response(
            200,
            json={"id": 1, "time_zone": "America/Vancouver"},
            request=httpx.Request("GET", url),
        )

    with patch("app.integrations.canvas._get_with_retry", new=fake_get):
        time_zone = await fetch_canvas_time_zone(
            "raw-token", "https://canvas.example.edu"
        )

    assert time_zone == "America/Vancouver"
    assert requested, "no Canvas request was made"
    assert requested[0].endswith("/api/v1/users/self/profile"), requested
