# Database migrations

`db/init/01_schema.sql` is applied automatically on **fresh** database containers. It reflects the current schema only.

If you have an **existing** local or shared database created before the `ta` role was removed, run the numbered migration scripts in order before relying on the updated schema. For local development, recreating the database (`docker compose down -v && docker compose up`) is also acceptable.

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
| `011_course_workflow_state_and_assignment_active.sql` | Adds `courses.workflow_state` (used to reject unpublished courses as active without a live Canvas call) and `assignments.is_active` (used to reconcile assignments Canvas no longer returns instead of counting them as active forever) |
| `012_assignment_published.sql` | Adds `assignments.published` (Canvas's own draft/published distinction) so data-analysis surfaces can exclude draft assignments — they're invisible to students and can't have real submissions |
| `013_course_synced_at.sql` | Adds `courses.synced_at`, set only from a real Canvas response — lets `set_active_course` refuse rows that are only trusting `011`'s `workflow_state` backfill default and have never actually been confirmed against Canvas |
| `014_workflow_undo.sql` | Adds `workflows.undone_at` so a reversible chat-driven action (`update_assignment`, `create_assignment`) can be marked unambiguously reverted, without overloading the `status` column's existing lifecycle meaning |
| `015_audit_logs_allow_delete_operation.sql` | Allows `'delete'` as an `audit_logs.operation`, alongside `'create'`/`'update'`, so undoing a `create_assignment` (by deleting the created assignment) gets its own audit row |
