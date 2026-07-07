-- Redesign workflows/audit_logs to fix a confirmed replay bug: nothing
-- previously marked a confirmed intent_preview as consumed, so replaying
-- the same pending_message_id against POST /chat/confirm re-executed the
-- same Canvas write. workflows is now the action-lifecycle state machine
-- handle_confirmed_action checks before executing anything.
--
-- Both tables are confirmed empty/unused in every existing environment
-- (no runtime code touched them before this change), so this is a clean
-- drop + recreate rather than a column-by-column ALTER.
-- Fresh installs use db/init/01_schema.sql directly and do not need this file.
-- Local dev databases can also be recreated with docker compose instead.

DROP TABLE IF EXISTS audit_logs CASCADE;
ALTER TABLE IF EXISTS audit_logs_session
    DROP CONSTRAINT IF EXISTS audit_logs_session_workflow_id_fkey;
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

CREATE TABLE audit_logs (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    workflow_id       INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    course_id         INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    action            VARCHAR NOT NULL,
    resource_type     VARCHAR NOT NULL CHECK (resource_type IN ('assignment', 'announcement')),
    resource_id       VARCHAR,
    operation         VARCHAR NOT NULL CHECK (operation IN ('create', 'update')),
    status            VARCHAR NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    before_data       JSONB,
    after_data        JSONB,
    request_payload   JSONB,
    timestamp         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_workflow_id ON audit_logs(workflow_id);
CREATE INDEX idx_audit_logs_course_id ON audit_logs(course_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
