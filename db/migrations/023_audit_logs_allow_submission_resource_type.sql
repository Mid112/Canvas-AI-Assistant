-- Confirmed grade updates audit a Canvas submission mutation, so audit_logs
-- must accept submission as a first-class resource type.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN ('assignment', 'announcement', 'conversation', 'submission'));
