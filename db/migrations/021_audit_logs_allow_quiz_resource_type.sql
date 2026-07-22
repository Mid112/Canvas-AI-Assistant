-- Allow 'quiz' as a valid audit_logs.resource_type for create_quiz / undo.
-- Intentionally separate from 022 (which then adds 'submission'): the two
-- resource types landed on different feature branches before merge. Do not
-- fold this into 022 — databases that already applied 021 need 022 as the
-- next incremental step.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN ('assignment', 'announcement', 'conversation', 'quiz'));
