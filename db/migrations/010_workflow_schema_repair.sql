-- Repair databases where 004_workflow_auditlog_redesign.sql could not drop the
-- legacy workflows table because audit_logs_session still referenced it.
--
-- WARNING: This drops and recreates workflows/audit_logs. Only run when both
-- tables are empty or you accept losing their contents. Prefer `make db-reset`
-- for local dev when a full schema refresh is needed.

DO $$
DECLARE
    rel regclass;
    has_rows boolean;
BEGIN
    rel := to_regclass('public.workflows');
    IF rel IS NOT NULL THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s LIMIT 1)', rel)
            INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION
                '010_workflow_schema_repair.sql refuses to run while workflows contain data. Use make db-reset or migrate manually.';
        END IF;
    END IF;

    rel := to_regclass('public.audit_logs');
    IF rel IS NOT NULL THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s LIMIT 1)', rel)
            INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION
                '010_workflow_schema_repair.sql refuses to run while audit_logs contain data. Use make db-reset or migrate manually.';
        END IF;
    END IF;
END $$;

ALTER TABLE IF EXISTS audit_logs_session
    DROP CONSTRAINT IF EXISTS audit_logs_session_workflow_id_fkey;

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS workflows CASCADE;

CREATE TABLE workflows (
    id                       SERIAL PRIMARY KEY,
    conversation_id          INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id                INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    source_user_message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    preview_message_id       INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    result_message_id        INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    action_name              VARCHAR NOT NULL,
    user_prompt              TEXT NOT NULL,
    proposed_action          JSONB NOT NULL,
    status                   VARCHAR NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled', 'superseded')),
    error_detail             TEXT,
    executed_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_conversation_id ON workflows(conversation_id);
CREATE INDEX idx_workflows_course_id ON workflows(course_id);
CREATE INDEX idx_workflows_status ON workflows(status);

CREATE TABLE IF NOT EXISTS audit_logs (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    workflow_id       INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    course_id         INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    action            VARCHAR NOT NULL,
    resource_type     VARCHAR NOT NULL CHECK (resource_type IN ('assignment', 'announcement', 'conversation')),
    resource_id       VARCHAR,
    operation         VARCHAR NOT NULL CHECK (operation IN ('create', 'update')),
    status            VARCHAR NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    before_data       JSONB,
    after_data        JSONB,
    request_payload   JSONB,
    timestamp         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workflow_id ON audit_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_course_id ON audit_logs(course_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS affected_resources JSONB NOT NULL DEFAULT '[]'::jsonb;
