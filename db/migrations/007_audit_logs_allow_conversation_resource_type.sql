-- Allow 'conversation' as a valid audit_logs.resource_type, alongside the
-- existing 'assignment'/'announcement' values. send_message now produces a
-- private Canvas conversation instead of a public announcement when
-- recipient_canvas_user_ids is set, and audit rows must reflect which one
-- actually happened rather than assuming announcement.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_check;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN ('assignment', 'announcement', 'conversation'));
