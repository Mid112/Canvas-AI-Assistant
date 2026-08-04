"""Canvas account timezone helpers (#1435)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.services.canvas import canvas_urls_equivalent


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
