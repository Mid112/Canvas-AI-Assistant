from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_canvas_token, fingerprint_canvas_token
from app.models.canvas_connection import CanvasConnection


async def token_is_already_used(
    db: AsyncSession,
    plain_token: str,
    *,
    exclude_connection_id: int | None = None,
) -> bool:
    """Check whether another connection already holds this Canvas token.

    Rows written since the fingerprint column landed are matched by an indexed
    equality check on that column -- the reason it exists. Only rows predating
    it (fingerprint NULL) still need decrypt-and-compare, which keeps the
    duplicate policy covering them without a migration that would have to
    handle the decrypted Canvas token in SQL.

    The fingerprints are deliberately not backfilled here. Any database that
    already contains two connections sharing a token would violate
    uq_canvas_token_fingerprint the moment both rows were written, so a
    backfill has to be a deliberate, conflict-resolving migration rather than
    a side effect of someone connecting a token.
    """
    target_fingerprint = fingerprint_canvas_token(plain_token)

    indexed_match = select(CanvasConnection.id).where(
        CanvasConnection.token_fingerprint == target_fingerprint
    )
    if exclude_connection_id is not None:
        indexed_match = indexed_match.where(CanvasConnection.id != exclude_connection_id)
    if await db.scalar(indexed_match.limit(1)) is not None:
        return True

    legacy_connections = (
        await db.scalars(
            select(CanvasConnection).where(CanvasConnection.token_fingerprint.is_(None))
        )
    ).all()

    for connection in legacy_connections:
        if connection.id == exclude_connection_id:
            continue
        try:
            legacy_token = decrypt_canvas_token(connection.encrypted_token)
        except InvalidToken:
            # A corrupted connection is handled by the existing Canvas health
            # and reconnect flows; it must not make a new valid token unusable.
            continue

        if fingerprint_canvas_token(legacy_token) == target_fingerprint:
            return True

    return False
