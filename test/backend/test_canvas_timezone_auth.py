"""Canvas timezone storage on connection save (#1435)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.auth import update_canvas_token


@pytest.mark.asyncio
async def test_update_canvas_token_stores_canvas_time_zone():
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch(
            "app.services.auth.fetch_self",
            new=AsyncMock(return_value={"time_zone": "America/Vancouver"}),
        ),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.example.edu")

    connection = next(
        call.args[0]
        for call in db.add.call_args_list
        if hasattr(call.args[0], "encrypted_token")
    )
    assert connection.time_zone == "America/Vancouver"
