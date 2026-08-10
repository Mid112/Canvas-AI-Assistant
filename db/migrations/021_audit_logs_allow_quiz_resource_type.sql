-- Allow 'quiz' as a valid audit_logs.resource_type for create_quiz / undo.
--
-- Keep 'submission' in this transitional constraint too. Some developer
-- databases already contain grade-management audit rows with
-- resource_type='submission' but do not have 021 stamped in schema_migrations;
-- excluding submission here makes Postgres reject the new CHECK constraint
-- before startup can continue to 022, which is the migration that formalizes
-- submission support. Including it keeps this migration safe no matter which
-- branch introduced the local audit rows first.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN ('assignment', 'announcement', 'conversation', 'quiz', 'submission'));
