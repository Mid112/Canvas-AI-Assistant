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
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    # Patched at the Canvas boundary rather than on the helper, so the
    # extraction in fetch_canvas_time_zone is exercised too.
    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self",
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
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self",
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
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.token_is_already_used", new=AsyncMock(return_value=False)),
        patch(
            "app.services.canvas_timezone.fetch_self",
            new=AsyncMock(return_value={"time_zone": None}),
        ),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.example.edu")

    assert _saved_connection(db).time_zone is None
