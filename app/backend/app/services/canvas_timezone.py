"""Canvas account timezone helpers (#1435)."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_self
from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.services.canvas import canvas_urls_equivalent

logger = logging.getLogger(__name__)


async def fetch_canvas_time_zone(canvas_token: str, canvas_url: str) -> str | None:
    """The account's IANA timezone, or None if Canvas would not tell us.

    Deliberately non-fatal. Callers run this while saving a Canvas
    connection, immediately after validate_token has already confirmed the
    token works, so a failure here is a hiccup on a secondary lookup rather
    than evidence the connection is bad. Letting it raise meant a profile
    fetch that timed out, 500'd, or could not resolve DNS rejected an
    otherwise valid token with a 502 and stored no connection at all —
    losing the whole integration to recover a display preference.

    The timezone is a nicety: everything that reads it already handles None
    (see get_instructor_canvas_timezone), falling back to the server default.
    """
    try:
        profile = await fetch_self(canvas_token, canvas_url)
    except Exception:
        # Includes the HTTPException fetch_self raises for timeouts and
        # unreachable hosts, which would otherwise surface as the caller's
        # own response.
        logger.warning(
            "Could not read the Canvas account timezone from %s; "
            "saving the connection without it.",
            canvas_url,
            exc_info=True,
        )
        return None
    time_zone = profile.get("time_zone") if isinstance(profile, dict) else None
    return time_zone if isinstance(time_zone, str) else None


def get_instructor_canvas_timezone(
    user: User,
    canvas_url: str | None = None,
) -> str | None:
    """Return the stored Canvas IANA timezone for the instructor, if known."""
    connections = getattr(user, "canvas_connections", None) or []
    if canvas_url:
        for connection in connections:
            if canvas_urls_equivalent(connection.canvas_url, canvas_url):
                return connection.time_zone
        return None
    for connection in connections:
        if connection.time_zone:
            return connection.time_zone
    return connections[0].time_zone if connections else None


async def get_instructor_canvas_timezone_for_user(
    db: AsyncSession,
    user_id: int,
    canvas_url: str | None = None,
) -> str | None:
    rows = (
        await db.scalars(
            select(CanvasConnection).where(CanvasConnection.user_id == user_id)
        )
    ).all()
    if canvas_url:
        for connection in rows:
            if canvas_urls_equivalent(connection.canvas_url, canvas_url):
                return connection.time_zone
        return None
    for connection in rows:
        if connection.time_zone:
            return connection.time_zone
    return rows[0].time_zone if rows else None
