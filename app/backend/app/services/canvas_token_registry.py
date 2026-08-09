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
    """Check token ownership and lazily fingerprint legacy connections.

    Older databases have encrypted tokens but no fingerprint. They are
    decrypted only during a token-connect operation so they are still covered
    by the duplicate policy without a secret-bearing SQL backfill migration.
    """
    target_fingerprint = fingerprint_canvas_token(plain_token)
    connections = (await db.scalars(select(CanvasConnection))).all()

    for connection in connections:
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
