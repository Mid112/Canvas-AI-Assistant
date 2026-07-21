-- Grade updates (update_grade) audit the Canvas submission whose grade
-- changed. This migration is required on any branch that writes
-- AuditLog(resource_type='submission') — including this quiz PR branch,
-- which also carries update_grade workflow support.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (
        resource_type IN (
            'assignment',
            'announcement',
            'conversation',
            'quiz',
            'submission'
        )
    );
