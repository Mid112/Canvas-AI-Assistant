"""Backfill `canvas_connections.token_fingerprint` for rows that predate it.

Why this is a Python command and not a `db/migrations/*.sql` file: a
fingerprint is an HMAC of the *decrypted* Canvas token, so producing one needs
`CANVAS_TOKEN_ENCRYPTION_KEY`. SQL migrations run inside Postgres and have no
access to it, and handing a migration the decryption key would put plaintext
Canvas tokens into a file that gets replayed on every fresh database. So the
column ships via migration 045 and the values are filled in here.

Why it isn't done lazily when someone connects a token, which is what the
registry's docstring originally implied: `uq_canvas_token_fingerprint` rejects
duplicates, and a database written before the rule existed can legitimately
contain two rows sharing a token. Writing fingerprints opportunistically would
throw IntegrityError at whichever instructor happened to connect next, for a
conflict they had nothing to do with. Resolving those conflicts is a decision,
so it belongs in a command someone runs deliberately and reads the output of.

Safe to run repeatedly: rows that already have a fingerprint are skipped, and
nothing is written at all without --apply.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decrypt_canvas_token, fingerprint_canvas_token
from app.models.canvas_connection import CanvasConnection


class BackfillReport:
    def __init__(self) -> None:
        self.already_done = 0
        self.undecryptable: list[int] = []
        self.to_write: list[tuple[int, str]] = []
        # Rows deliberately left NULL because another row already claims the
        # same token. Reported rather than resolved: deleting or reassigning a
        # real instructor's Canvas connection is not this command's call.
        self.conflicts: dict[str, list[int]] = {}

    @property
    def conflict_row_count(self) -> int:
        return sum(len(rows) for rows in self.conflicts.values())

    def render(self, *, applied: bool) -> str:
        lines = [
            "Canvas token fingerprint backfill",
            f"  already fingerprinted : {self.already_done}",
            f"  {'written' if applied else 'would write'}{'':<8}: {len(self.to_write)}",
            f"  undecryptable (skipped): {len(self.undecryptable)}",
            f"  duplicate-token rows   : {self.conflict_row_count}"
            f" across {len(self.conflicts)} token(s)",
        ]
        if self.undecryptable:
            preview = ", ".join(str(i) for i in self.undecryptable[:10])
            more = "" if len(self.undecryptable) <= 10 else " ..."
            lines += [
                "",
                "Undecryptable rows were encrypted under a different",
                "CANVAS_TOKEN_ENCRYPTION_KEY and cannot be fingerprinted. They stay",
                "invisible to the duplicate check until they are re-connected or",
                "removed, so the uniqueness guarantee does not cover them:",
                f"  connection ids: {preview}{more}",
            ]
        if self.conflicts:
            lines += [
                "",
                "These rows share a Canvas token with an older row. The oldest keeps",
                "the fingerprint; the rest are left NULL so the unique index is not",
                "violated. Resolve them by hand (remove or re-issue the token):",
            ]
            for rows in list(self.conflicts.values())[:10]:
                shown = ", ".join(str(i) for i in rows[:12])
                more = "" if len(rows) <= 12 else f" ... (+{len(rows) - 12} more)"
                lines.append(f"  {len(rows):>5} row(s): {shown}{more}")
            if len(self.conflicts) > 10:
                lines.append(f"  ... and {len(self.conflicts) - 10} more token group(s)")
        if not applied and self.to_write:
            lines += ["", "Dry run — re-run with --apply to write these values."]
        return "\n".join(lines)


async def plan_backfill(db) -> BackfillReport:
    """Work out what to write without writing anything."""
    report = BackfillReport()
    connections = (
        await db.scalars(select(CanvasConnection).order_by(CanvasConnection.id))
    ).all()

    # Fingerprints already in the table are claimed: a NULL row matching one of
    # them is a duplicate of an existing owner, not the start of a new group.
    claimed: set[str] = set()
    pending: dict[str, list[int]] = defaultdict(list)

    for connection in connections:
        if connection.token_fingerprint is not None:
            report.already_done += 1
            claimed.add(connection.token_fingerprint)
            continue
        try:
            token = decrypt_canvas_token(connection.encrypted_token)
        except InvalidToken:
            report.undecryptable.append(connection.id)
            continue
        pending[fingerprint_canvas_token(token)].append(connection.id)

    for fingerprint, ids in pending.items():
        # Oldest row wins: ids are ascending, and an existing claim outranks
        # every un-fingerprinted row regardless of age.
        if fingerprint in claimed:
            report.conflicts[fingerprint] = ids
            continue
        keeper, *rest = ids
        report.to_write.append((keeper, fingerprint))
        if rest:
            report.conflicts[fingerprint] = rest

    return report


async def run_backfill(*, apply: bool) -> BackfillReport:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            report = await plan_backfill(db)
            if apply and report.to_write:
                by_id = {
                    connection.id: connection
                    for connection in (
                        await db.scalars(
                            select(CanvasConnection).where(
                                CanvasConnection.id.in_(
                                    [row_id for row_id, _ in report.to_write]
                                )
                            )
                        )
                    ).all()
                }
                for row_id, fingerprint in report.to_write:
                    by_id[row_id].token_fingerprint = fingerprint
                await db.commit()
            return report
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the fingerprints (default is a dry run)",
    )
    args = parser.parse_args()
    report = asyncio.run(run_backfill(apply=args.apply))
    print(report.render(applied=args.apply))


if __name__ == "__main__":
    main()
