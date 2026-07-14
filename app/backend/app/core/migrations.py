import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# app/backend/app/core/migrations.py -> repo root is four parents up
MIGRATIONS_DIR = Path(__file__).resolve().parents[4] / "db" / "migrations"

# Migrations from before db/migrations/README.md's "ADD COLUMN IF NOT
# EXISTS / CREATE TABLE IF NOT EXISTS" convention (established at 011) are
# never run by this module, full stop — not "run only if missing", never.
# Verified directly against a scratch database while building this: 003 is
# a bare RENAME (errors the second time it runs), and both 004 and 010
# unconditionally DROP TABLE workflows/audit_logs before recreating them —
# re-running either against a database with real rows in those tables
# would silently destroy them, not just error. An unattended startup hook
# must never be able to do that.
#
# This is also never actually needed in practice: any database capable of
# running today's application code already reflects 002-010's cumulative
# effect one way or another — either they were genuinely run in order
# historically, or (the common case) the database was created from a
# db/init/01_schema.sql that already baked their result in directly.
# db/init/01_schema.sql is always a single flat snapshot of the current
# schema, not a replay of history, so "missing 002-010" and "running
# today's code" cannot co-occur. Only the newest migrations — the ones a
# given database might predate — are realistic gaps, and those are exactly
# the ones written to be safe to run unattended.
_PRE_CONVENTION_MIGRATIONS = frozenset({
    "002_remove_ta_role.sql",
    "002_submission_status_and_grading.sql",
    "003_rename_audit_logs_to_session.sql",
    "004_workflow_auditlog_redesign.sql",
    "005_assignment_description.sql",
    "006_workflow_affected_resources.sql",
    "007_audit_logs_allow_conversation_resource_type.sql",
    "008_unstarted_backend_features.sql",
    "009_assignment_unique_per_course.sql",
    "010_workflow_schema_repair.sql",
})


async def run_pending_migrations(engine: AsyncEngine) -> None:
    """Applies db/migrations/*.sql files not yet recorded in
    schema_migrations, in filename order, each in its own transaction —
    the safety net for existing databases that predate a schema change
    (e.g. canvas_connections.courses_synced_at, canvas_course_names,
    tool_call_logs): Base.metadata.create_all() in main.py's lifespan
    only creates missing tables, it never ALTERs an existing one, so a
    database that hasn't had these migrations applied crashes the first
    time a query touches a column that isn't there yet.

    Called on every startup. Only migrations outside
    _PRE_CONVENTION_MIGRATIONS are ever candidates to actually run — see
    that constant's docstring for why 002-010 are permanently excluded.
    Everything else is written to the idempotent convention (ADD COLUMN IF
    NOT EXISTS / CREATE TABLE IF NOT EXISTS — see db/migrations/README.md),
    so even re-running an already-applied one is safe; the tracking table
    just avoids the wasted work every boot.

    The first time schema_migrations itself is created (a database that
    predates this tracking mechanism, whatever its actual migration
    history), every pre-convention filename is stamped as already-applied
    without being run — see _stamp_pre_convention_migrations."""
    if not MIGRATIONS_DIR.exists():
        return

    async with engine.begin() as conn:
        tracking_table_existed = (
            await conn.scalar(text("SELECT to_regclass('public.schema_migrations')"))
        ) is not None
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "    filename VARCHAR PRIMARY KEY,"
                "    applied_at TIMESTAMPTZ DEFAULT NOW()"
                ")"
            )
        )
        if not tracking_table_existed:
            await _stamp_pre_convention_migrations(conn)

    applied = await _applied_filenames(engine)
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in _PRE_CONVENTION_MIGRATIONS or path.name in applied:
            continue
        async with engine.begin() as conn:
            # Neither text()+execute() nor exec_driver_sql() work here —
            # both route through SQLAlchemy's asyncpg dialect, which always
            # PREPARES the statement first, and Postgres's prepared-statement
            # protocol rejects a string containing more than one command
            # ("cannot insert multiple commands into a prepared statement") —
            # confirmed by hitting exactly that error against a scratch
            # database while building this. asyncpg's own Connection.execute,
            # reached via the raw driver connection, uses the simple query
            # protocol instead (since no parameters are bound), which does
            # allow a whole file's worth of semicolon-separated statements
            # in one call — also confirmed against a scratch database.
            raw_connection = await conn.get_raw_connection()
            asyncpg_connection = raw_connection.driver_connection
            assert asyncpg_connection is not None
            await asyncpg_connection.execute(path.read_text())
            await conn.execute(
                text("INSERT INTO schema_migrations (filename) VALUES (:f)"),
                {"f": path.name},
            )
        logger.info("applied migration %s", path.name)


async def _stamp_pre_convention_migrations(conn) -> None:
    present = {p.name for p in MIGRATIONS_DIR.glob("*.sql")} & _PRE_CONVENTION_MIGRATIONS
    if not present:
        return
    await conn.execute(
        text("INSERT INTO schema_migrations (filename) VALUES (:f) ON CONFLICT DO NOTHING"),
        [{"f": name} for name in sorted(present)],
    )
    logger.info(
        "schema_migrations initialized: stamped %d pre-convention migration(s) "
        "as already-applied without running them",
        len(present),
    )


async def _applied_filenames(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT filename FROM schema_migrations"))
        return {row[0] for row in rows}
