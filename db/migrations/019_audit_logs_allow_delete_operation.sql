-- Allow 'delete' as a valid audit_logs.operation, alongside the existing
-- 'create'/'update' values. Undoing a create_assignment action means
-- deleting the Canvas assignment that was created — that delete needs its
-- own audit row, distinct from the original create_assignment row.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_operation_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_operation_check
    CHECK (operation IN ('create', 'update', 'delete'));
