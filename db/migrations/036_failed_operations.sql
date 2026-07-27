-- Failed Operation Monitoring (Feature 11, UR1.6). Append-only log of
-- Canvas read/write failures and AI call failures for the admin dashboard.
CREATE TABLE IF NOT EXISTS failed_operations (
    id               SERIAL PRIMARY KEY,
    source           VARCHAR NOT NULL CHECK (source IN ('canvas', 'ai')),
    operation        VARCHAR NOT NULL,
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    course_id        INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    conversation_id  INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    workflow_id      INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    tool_call_id     INTEGER REFERENCES tool_call_logs(id) ON DELETE SET NULL,
    provider         VARCHAR,
    human_summary    TEXT NOT NULL DEFAULT 'Operation failed',
    error_detail     TEXT NOT NULL,
    context_json     JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE failed_operations ADD COLUMN IF NOT EXISTS human_summary TEXT;

UPDATE failed_operations
SET human_summary = COALESCE(NULLIF(human_summary, ''), LEFT(error_detail, 240), 'Operation failed')
WHERE human_summary IS NULL OR human_summary = '';

ALTER TABLE failed_operations
    ALTER COLUMN human_summary SET DEFAULT 'Operation failed',
    ALTER COLUMN human_summary SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_operations_created_at
    ON failed_operations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failed_operations_source_created_at
    ON failed_operations(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failed_operations_user_created_at
    ON failed_operations(user_id, created_at DESC);
