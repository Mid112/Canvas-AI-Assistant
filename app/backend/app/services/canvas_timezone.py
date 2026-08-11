"""Canvas account timezone helpers (#1435)."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_canvas_token
from app.integrations.canvas import fetch_self_profile
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

    Reads the Profile endpoint, not the User one. Canvas puts ``time_zone``
    on only the first, and reading the second is why this returned None for
    every connection ever saved — see fetch_self_profile.
    """
    try:
        profile = await fetch_self_profile(canvas_token, canvas_url)
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


async def ensure_connection_time_zone(
    db: AsyncSession, connection: CanvasConnection
) -> str | None:
    """Fill in a connection's timezone if it never got one. Never raises.

    The column is written when a token is saved, and nowhere else — so
    every connection created before the Profile-endpoint fix has NULL and
    would keep it forever, because nothing re-reads it. Fixing
    fetch_canvas_time_zone alone would only help instructors who happen to
    reconnect their token afterwards.

    Repairing lazily is safe here in a way it was not for token
    fingerprints (see core/token_backfill, which is a deliberate command
    for exactly that reason): a timezone has no uniqueness constraint, so
    writing one can never collide with another row and can never fail an
    unrelated instructor's request.

    Does not commit. The caller is already committing something else, and
    this should never be the reason a transaction is opened.
    """
    if getattr(connection, "time_zone", None):
        return connection.time_zone
    try:
        token = decrypt_canvas_token(connection.encrypted_token)
    except Exception:
        # Encrypted under a different key. Nothing to do, and certainly not
        # worth failing the sync that called us.
        logger.warning(
            "Could not decrypt the Canvas token for connection %s; "
            "leaving its timezone unset.",
            getattr(connection, "id", "?"),
        )
        return None
    time_zone = await fetch_canvas_time_zone(token, connection.canvas_url)
    if time_zone:
        connection.time_zone = time_zone
        db.add(connection)
    return time_zone


def get_instructor_canvas_timezone(
    user: User,
    canvas_url: str | None = None,
) -> str | None:
    """Return the stored Canvas IANA timezone for the instructor, if known."""
    connections = getattr(user, "canvas_connections", None) or []
    # time_zone is read through getattr because callers pass anything
    # connection-shaped -- including rows loaded before the column existed and
    # lightweight stand-ins in tests. A missing attribute means "unknown zone",
    # which is already a supported answer, not an AttributeError.
    if canvas_url:
        for connection in connections:
            if canvas_urls_equivalent(connection.canvas_url, canvas_url):
                return getattr(connection, "time_zone", None)
        return None
    for connection in connections:
        time_zone = getattr(connection, "time_zone", None)
        if time_zone:
            return time_zone
    return getattr(connections[0], "time_zone", None) if connections else None


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
