# Database migrations

`db/init/01_schema.sql` is applied automatically on **fresh** database containers. It reflects the current schema only.

If you have an **existing** local or shared database created before the `ta` role was removed, run the numbered migration scripts in order before relying on the updated schema. For local development, recreating the database (`docker compose down -v && docker compose up`) is also acceptable.

| Migration | Purpose |
|-----------|---------|
| `002_remove_ta_role.sql` | Reassigns legacy `ta` users to `instructor` and tightens the role check constraint |
| `002_submission_status_and_grading.sql` | Adds `grade`/`graded_at` to `submissions` and expands the status check constraint |
| `003_rename_audit_logs_to_session.sql` | Renames `audit_logs` to `audit_logs_session` (table, constraints, sequence, indexes) to free up the `audit_logs` name for the new workflow/audit-log design |
