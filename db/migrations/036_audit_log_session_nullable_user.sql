-- Allow logging failed login attempts for emails that do not map to a user.
-- Known-user events still carry user_id; anonymous attempts keep the
-- attempted email in details.
ALTER TABLE IF EXISTS audit_logs_session
    ALTER COLUMN user_id DROP NOT NULL;
