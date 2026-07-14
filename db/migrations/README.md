# Database migrations

`db/init/01_schema.sql` is applied automatically on **fresh** database containers. It reflects the current schema only.

**Existing databases catch up automatically.** `app/backend/app/core/migrations.py` runs on every backend startup: it applies any `db/migrations/*.sql` file not yet recorded in the `schema_migrations` table, in filename order. You don't need to do anything by hand after a `git pull` that adds a migration — just start the backend (`make reload` / `make dev`) and it applies itself. This exists because `Base.metadata.create_all()` (also run on startup) only creates tables that don't exist yet — it never `ALTER`s an existing one, so without this an existing database would crash the first time a query touched a column/table a migration added.

This automatic runner **never touches migrations 002 through 010** — a few of them (`003`'s bare `RENAME`, `004`/`010`'s unconditional `DROP TABLE` before recreating) are not safe to run a second time, and `004`/`010` are outright destructive if they were. Only migrations from `011` onward — written to the idempotent convention below — are ever candidates to run unattended. This is never actually a gap in practice: any database that can run today's application code already reflects `002`-`010`'s cumulative effect one way or another, either because they were genuinely applied in order, or (the common case) because the database was created from a `db/init/01_schema.sql` snapshot that already baked their result in directly — that file is always a flat snapshot of the *current* schema, never a replay of history.

**Adding a new migration:** write the new file as `NNN_description.sql`, following the `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` convention below so it's safe if the automatic runner ends up executing it more than once. Then update three places to match: this table, `db/init/01_schema.sql`'s table definitions (so a fresh database gets the same end state directly), and `db/init/01_schema.sql`'s `schema_migrations` baseline `INSERT` at the bottom of that file (so a fresh database doesn't also try to re-run it).

If you have a genuinely ancient local database (created before the `ta` role was removed, i.e. before migration `002`), the automatic runner won't help — recreate it instead (`docker compose down -v && docker compose up`, or `make db-reset`).

| Migration | Purpose |
|-----------|---------|
| `002_remove_ta_role.sql` | Reassigns legacy `ta` users to `instructor` and tightens the role check constraint |
| `002_submission_status_and_grading.sql` | Adds `grade`/`graded_at` to `submissions` and expands the status check constraint |
| `003_rename_audit_logs_to_session.sql` | Renames `audit_logs` to `audit_logs_session` (table, constraints, sequence, indexes) to free up the `audit_logs` name for the new workflow/audit-log design — **must run before `004_workflow_auditlog_redesign.sql`** |
| `004_workflow_auditlog_redesign.sql` | Drops and recreates `workflows`/`audit_logs` with the action-lifecycle schema that fixes the confirm replay bug (both tables were unused, so no data migration is needed) |
| `005_assignment_description.sql` | Adds `description` to `assignments` for Canvas assignment upserts |
| `006_workflow_affected_resources.sql` | Adds `affected_resources` JSONB column to `workflows` for action history (#621, #870) |
| `007_audit_logs_allow_conversation_resource_type.sql` | Allows `'conversation'` as an `audit_logs.resource_type`, alongside `'assignment'`/`'announcement'`, since targeted `send_message` now produces a private conversation instead of an announcement |
| `008_unstarted_backend_features.sql` | Adds `notification_settings` to `user_preferences`, and the `password_reset_tokens`/`message_drafts`/`system_settings` tables — must run after `004_workflow_auditlog_redesign.sql` |
| `009_assignment_unique_per_course.sql` | Changes `assignments.canvas_assignment_id` from a globally-unique column to a composite unique constraint on `(canvas_assignment_id, course_id)`, so co-instructors on the same Canvas course each get their own `Assignment` row instead of silently reusing (or failing to insert) one another's |
| `010_workflow_schema_repair.sql` | Repairs legacy `workflows` tables when `004` could not drop the old schema because `audit_logs_session` still referenced it. Aborts if either table already has rows (row checks run via dynamic SQL only when `to_regclass` confirms the table exists). |
| `011_course_name_tracking.sql` | Adds `conversations.course_name` (backfilled from `courses`) and `canvas_connections.courses_synced_at`, and creates `canvas_course_names` — a connection-scoped, write-once index the chat pipeline uses to resolve a course by name without ever exposing a numeric ID to the LLM |
| `012_tool_call_logs.sql` | Creates `tool_call_logs`, tracking the pending/executing/executed/failed lifecycle of each individual `fetch_courses`/`fetch_assignments`/`fetch_students`/`fetch_submissions` call now that reads execute immediately instead of going through `workflows`' preview/confirm gate |
