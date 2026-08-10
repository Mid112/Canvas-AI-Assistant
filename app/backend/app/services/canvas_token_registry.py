from cryptography.fernet import InvalidToken
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.canvas_url import canvas_url_candidates
from app.core.security import decrypt_canvas_token, fingerprint_canvas_token
from app.models.canvas_connection import CanvasConnection


async def token_is_already_used(
    db: AsyncSession,
    plain_token: str,
    canvas_url: str,
    *,
    exclude_connection_id: int | None = None,
) -> bool:
    """Check token ownership within one Canvas institution.

    Older databases have encrypted tokens but no fingerprint. They are
    decrypted only during a token-connect operation so they are still covered
    by the duplicate policy without a secret-bearing SQL backfill migration.
    """
    target_fingerprint = fingerprint_canvas_token(plain_token)
    url_candidates = canvas_url_candidates(canvas_url)

    indexed_match = await db.scalar(
        select(CanvasConnection.id).where(
            CanvasConnection.canvas_url.in_(url_candidates),
            CanvasConnection.token_fingerprint == target_fingerprint,
            CanvasConnection.id != exclude_connection_id
            if exclude_connection_id is not None
            else True,
        )
    )
    if indexed_match is not None:
        return True

    # Legacy rows may have either no fingerprint or the pre-v1 format. They
    # are the only rows that need decryption during the transition; successful
    # scans upgrade the old format so this set shrinks over time.
    connections = (
        await db.scalars(
            select(CanvasConnection).where(
                CanvasConnection.canvas_url.in_(url_candidates),
                or_(
                    CanvasConnection.token_fingerprint.is_(None),
                    ~CanvasConnection.token_fingerprint.startswith("v1:"),
                ),
            )
        )
    ).all()

    for connection in connections:
        if connection.id == exclude_connection_id:
            continue
        try:
            legacy_token = decrypt_canvas_token(connection.encrypted_token)
        except InvalidToken:
            # A corrupted connection is handled by the existing Canvas health
            # and reconnect flows; it must not make a new valid token unusable.
            continue

        legacy_fingerprint = fingerprint_canvas_token(legacy_token)
        if legacy_fingerprint == target_fingerprint:
            return True

        fingerprint_owner = await db.scalar(
            select(CanvasConnection.id).where(
                CanvasConnection.canvas_url.in_(url_candidates),
                CanvasConnection.token_fingerprint == legacy_fingerprint,
                CanvasConnection.id != connection.id,
            )
        )
        if fingerprint_owner is None:
            connection.token_fingerprint = legacy_fingerprint

    return False
