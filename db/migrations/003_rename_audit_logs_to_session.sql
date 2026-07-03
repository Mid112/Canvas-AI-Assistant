-- Rename audit_logs to audit_logs_session, freeing up the audit_logs name for
-- feature/workflow-auditlog-update's new audit-log design to land as a clean
-- additive table rather than a conflicting edit to this one.
-- Fresh installs use db/init/01_schema.sql directly and do not need this file.
-- Local dev databases can also be recreated with docker compose instead.

ALTER TABLE audit_logs RENAME TO audit_logs_session;
ALTER TABLE audit_logs_session RENAME CONSTRAINT audit_logs_pkey TO audit_logs_session_pkey;
ALTER TABLE audit_logs_session RENAME CONSTRAINT audit_logs_user_id_fkey TO audit_logs_session_user_id_fkey;
ALTER TABLE audit_logs_session RENAME CONSTRAINT audit_logs_workflow_id_fkey TO audit_logs_session_workflow_id_fkey;

ALTER SEQUENCE audit_logs_id_seq RENAME TO audit_logs_session_id_seq;

ALTER INDEX idx_audit_logs_user_id RENAME TO idx_audit_logs_session_user_id;
ALTER INDEX idx_audit_logs_timestamp RENAME TO idx_audit_logs_session_timestamp;
