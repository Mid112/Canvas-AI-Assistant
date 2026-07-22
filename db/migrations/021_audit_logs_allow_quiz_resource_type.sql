-- Allow 'quiz' as a valid audit_logs.resource_type for create_quiz / undo.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN ('assignment', 'announcement', 'conversation', 'quiz'));
