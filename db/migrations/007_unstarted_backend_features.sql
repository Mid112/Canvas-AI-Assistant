-- Notification preferences on user_preferences
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{}';

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Message drafts (standalone messaging service)
CREATE TABLE IF NOT EXISTS message_drafts (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id      INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    subject        VARCHAR NOT NULL,
    body           TEXT NOT NULL,
    template_id    VARCHAR,
    template_name  VARCHAR,
    recipients     JSONB NOT NULL DEFAULT '[]',
    status         VARCHAR NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
    sent_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_drafts_user_id ON message_drafts(user_id);

-- Admin system settings (key-value)
CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Note: this migration used to also replace workflows_status_check with the
-- pre-redesign enum ('pending', 'approved', 'rejected', 'cancelled'). That
-- constraint is obsolete — 004_workflow_auditlog_redesign.sql already
-- establishes the correct one ('pending', 'executing', 'executed', 'failed',
-- 'cancelled', 'superseded') by recreating the table from scratch. Reapplying
-- the old enum here would either fail outright against any row already in
-- 'executing'/'executed'/'superseded', or silently reinstate a constraint
-- that breaks every subsequent confirm/cancel/execute. Removed.
