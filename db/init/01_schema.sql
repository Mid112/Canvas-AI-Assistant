-- ─────────────────────────────────────────────
-- Safe AI-Powered Canvas Workflow Assistant
-- Team 16 - Database Schema
-- File: db/init/01_schema.sql
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    canvas_user_id   VARCHAR UNIQUE,                          -- nullable for admin (no Canvas account)
    name             VARCHAR NOT NULL,
    email            VARCHAR UNIQUE NOT NULL,
    hashed_password  TEXT NOT NULL,                          -- bcrypt hashed
    role             VARCHAR NOT NULL CHECK (role IN ('instructor', 'admin')), -- was ('instructor', 'ta', 'admin'); see db/migrations/002_remove_ta_role.sql
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Canvas Connections (one row per user per Canvas instance)
-- ─────────────────────────────────────────────
CREATE TABLE canvas_connections (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    canvas_url          VARCHAR NOT NULL,
    encrypted_token     TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    -- Last time services/canvas.py's sync_courses_if_stale actually hit
    -- Canvas for this connection's course list, not just checked the
    -- cooldown. Null until the first sync ever runs.
    courses_synced_at   TIMESTAMPTZ,
    CONSTRAINT uq_user_canvas_url UNIQUE (user_id, canvas_url)
);

CREATE INDEX idx_canvas_connections_user_id ON canvas_connections(user_id);

-- ─────────────────────────────────────────────
-- Sessions
-- ─────────────────────────────────────────────
CREATE TABLE sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);

-- ─────────────────────────────────────────────
-- Courses
-- ─────────────────────────────────────────────
CREATE TABLE courses (
    id               SERIAL PRIMARY KEY,
    canvas_course_id VARCHAR NOT NULL,
    -- canvas_url tracks which Canvas instance this course came from (e.g. UBC vs SFU)
    -- so the AI layer always knows which endpoint to call for assignments/submissions
    canvas_url       VARCHAR NOT NULL,
    name             VARCHAR NOT NULL,
    term             VARCHAR,
    -- Canvas's course state ("available", "unpublished", "completed", ...) — lets
    -- set_active_course reject non-selectable courses without a live Canvas call.
    workflow_state   VARCHAR NOT NULL DEFAULT 'available',
    -- Last time this row was written from a real Canvas response — NULL means
    -- workflow_state above has never been confirmed against Canvas and
    -- set_active_course must refuse to select it (see db/migrations/013).
    synced_at        TIMESTAMPTZ,
    instructor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    -- composite unique: the same Canvas course can exist once per instructor (co-instructors allowed)
    CONSTRAINT uq_course_per_instructor UNIQUE (canvas_course_id, instructor_id)
);

CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);

-- ─────────────────────────────────────────────
-- Canvas Course Names
-- A small, connection-scoped, write-once canvas_course_id -> name index
-- used only by the chat/LLM course-resolution pathway (services/chat.py).
-- Separate from `courses` because it's keyed by canvas_connection_id (so
-- two institutions with colliding numeric canvas_course_ids never
-- collide) and rows are never overwritten once inserted (so a rename on
-- Canvas mid-conversation doesn't retroactively change what an
-- in-progress conversation has been calling a course).
-- ─────────────────────────────────────────────
CREATE TABLE canvas_course_names (
    id                      SERIAL PRIMARY KEY,
    canvas_connection_id    INTEGER NOT NULL REFERENCES canvas_connections(id) ON DELETE CASCADE,
    canvas_course_id        VARCHAR NOT NULL,
    -- Populated from the Course row the same Canvas fetch upserts
    -- (services/canvas.py get_courses) -- lets the chat resolver go
    -- straight from a matched name to something dispatcher.py can
    -- execute against, no extra query.
    local_course_id         INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    name                    VARCHAR NOT NULL,
    -- Canvas's own workflow_state at insert time ("available",
    -- "unpublished", "completed") -- lets _match_course_name narrow a
    -- duplicate-name match (same course code taught in multiple terms) to
    -- the still-active offering instead of giving up outright.
    workflow_state          VARCHAR,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_connection_canvas_course UNIQUE (canvas_connection_id, canvas_course_id)
);

CREATE INDEX idx_canvas_course_names_connection_id ON canvas_course_names(canvas_connection_id);

-- ─────────────────────────────────────────────
-- Assignments
-- ─────────────────────────────────────────────
CREATE TABLE assignments (
    id                   SERIAL PRIMARY KEY,
    canvas_assignment_id VARCHAR NOT NULL,
    course_id            INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title                VARCHAR NOT NULL,
    description          TEXT,
    due_date             TIMESTAMPTZ,
    points_possible      FLOAT,
    -- False once a Canvas refresh no longer returns this assignment (deleted on
    -- Canvas) — kept rather than deleted so historical submissions/audit rows
    -- still resolve; excluded from active counts/aggregates.
    is_active            BOOLEAN NOT NULL DEFAULT true,
    -- Canvas's own draft/published distinction — a draft assignment is invisible
    -- to students and can't have real submissions, so data-analysis surfaces
    -- (missing/late counts, average grade, completion rate) exclude drafts.
    published            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    -- Unique per course, not globally — two co-instructors on the same real
    -- Canvas course get separate local Course rows, and each needs its own
    -- Assignment row for the same Canvas assignment ID.
    CONSTRAINT uq_assignment_per_course UNIQUE (canvas_assignment_id, course_id)
);

CREATE INDEX idx_assignments_course_id ON assignments(course_id);

-- ─────────────────────────────────────────────
-- Submissions
-- ─────────────────────────────────────────────
CREATE TABLE submissions (
    id                    SERIAL PRIMARY KEY,
    canvas_submission_id  VARCHAR UNIQUE NOT NULL,
    assignment_id         INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_canvas_id     VARCHAR NOT NULL,
    student_name          VARCHAR,
    status                VARCHAR NOT NULL CHECK (status IN ('missing', 'late', 'submitted', 'graded', 'unsubmitted', 'excused')),
    score                 FLOAT,
    grade                 VARCHAR,
    graded_at             TIMESTAMPTZ,
    submitted_at          TIMESTAMPTZ
);

CREATE INDEX idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX idx_submissions_student_canvas_id ON submissions(student_canvas_id);

-- ─────────────────────────────────────────────
-- Conversations
-- ─────────────────────────────────────────────
CREATE TABLE conversations (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Set once (at creation or on this conversation's first course
    -- resolution) and never mutated after -- a subject switch routes to a
    -- different conversation row instead (see services/chat.py
    -- _find_or_fork_conversation_for_course).
    course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    -- Denormalized snapshot of course.name at the time course_id was set.
    course_name VARCHAR,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);

-- ─────────────────────────────────────────────
-- Messages
-- ─────────────────────────────────────────────
CREATE TABLE messages (
    id               SERIAL PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             VARCHAR NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- ─────────────────────────────────────────────
-- Workflows
-- Action-lifecycle state machine for LLM-proposed actions. `messages` is
-- the chat transcript; this table is what handle_confirmed_action checks
-- to guarantee an action executes at most once, no matter how many times
-- its pending_message_id is replayed.
-- ─────────────────────────────────────────────
CREATE TABLE workflows (
    id                       SERIAL PRIMARY KEY,
    conversation_id          INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id                INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    -- The user message that originally started this preview chain — stays
    -- pinned across "modify" revisions.
    source_user_message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    -- The assistant message holding the current intent_preview. Unique —
    -- this is the join key handle_confirmed_action looks the workflow up by.
    preview_message_id       INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    result_message_id        INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    action_name              VARCHAR NOT NULL,
    user_prompt              TEXT NOT NULL,
    proposed_action          JSONB NOT NULL,
    affected_resources       JSONB NOT NULL DEFAULT '[]'::jsonb,
    status                   VARCHAR NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled', 'superseded')),
    error_detail             TEXT,
    executed_at              TIMESTAMPTZ,
    -- Set when a reversible action (currently update_assignment only) has
    -- been undone — kept separate from `status` so its lifecycle meaning
    -- isn't overloaded with a new terminal value.
    undone_at                TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_conversation_id ON workflows(conversation_id);
CREATE INDEX idx_workflows_course_id ON workflows(course_id);
CREATE INDEX idx_workflows_status ON workflows(status);

-- ─────────────────────────────────────────────
-- Tool Call Logs
-- Tracks the pending/executing/executed/failed lifecycle of a single
-- Canvas-reading call (fetch_courses, fetch_assignments, fetch_students,
-- fetch_submissions), including internal sub-calls the app makes on the
-- user's behalf without a separate turn (e.g. the fetch_assignments call
-- inside fetch_submissions' assignment-resolution chain). Deliberately
-- separate from workflows: that table's preview_message_id is tied 1:1 to
-- a specific assistant message the user reviews and confirms, which no
-- longer applies now that reads execute immediately with no review step.
-- ─────────────────────────────────────────────
CREATE TABLE tool_call_logs (
    id                      SERIAL PRIMARY KEY,
    conversation_id         INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id               INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    triggering_message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    action_name             VARCHAR NOT NULL,
    parameters               JSONB NOT NULL,
    status                  VARCHAR NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'executing', 'executed', 'failed')),
    error_detail            TEXT,
    completed_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tool_call_logs_user_id ON tool_call_logs(user_id);
CREATE INDEX idx_tool_call_logs_conversation_id ON tool_call_logs(conversation_id);
CREATE INDEX idx_tool_call_logs_course_id ON tool_call_logs(course_id);
CREATE INDEX idx_tool_call_logs_status ON tool_call_logs(status);

-- ─────────────────────────────────────────────
-- Resolved Sets
-- Server-computed recipient sets (e.g. "students missing submissions for
-- assignment 4"), persisted so the LLM only ever sees a compact
-- {count, sample, handle} summary from resolve_missing_submissions --
-- never the raw per-student list -- and a later send_message turn can
-- materialize the real recipient IDs back out via recipient_handle,
-- scoped to the conversation that created the set.
-- ─────────────────────────────────────────────
CREATE TABLE resolved_sets (
    handle                VARCHAR PRIMARY KEY,
    conversation_id       INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind                  VARCHAR NOT NULL,
    query                 JSONB NOT NULL,
    snapshot_recipients   JSONB NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    expires_at            TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_resolved_sets_conversation_id ON resolved_sets(conversation_id);

-- ─────────────────────────────────────────────
-- Audit Logs
-- Records an actual Canvas data mutation performed by a confirmed
-- Workflow. Only written on success.
-- NOTE: workflow_id is required, so deleting a conversation would cascade
-- through its workflows to its audit rows too — backwards for a feature
-- whose point is outliving what it describes. No delete-conversation
-- endpoint exists today, so this is dormant; flagging for whoever builds one.
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    workflow_id       INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    course_id         INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    action            VARCHAR NOT NULL,
    resource_type     VARCHAR NOT NULL CHECK (resource_type IN ('assignment', 'announcement', 'conversation')),
    resource_id       VARCHAR,
    operation         VARCHAR NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
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

-- ─────────────────────────────────────────────
-- Audit Log Sessions
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs_session (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    workflow_id  INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    action       VARCHAR NOT NULL,
    details      JSONB,
    timestamp    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_session_user_id ON audit_logs_session(user_id);
CREATE INDEX idx_audit_logs_session_timestamp ON audit_logs_session(timestamp);

-- ─────────────────────────────────────────────
-- Message Templates
-- ─────────────────────────────────────────────
CREATE TABLE message_templates (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    title      VARCHAR NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_templates_user_id ON message_templates(user_id);

-- ─────────────────────────────────────────────
-- Students (enrolled students per course, synced from Canvas)
-- ─────────────────────────────────────────────
CREATE TABLE students (
    id               SERIAL PRIMARY KEY,
    canvas_user_id   VARCHAR NOT NULL,
    course_id        INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name             VARCHAR NOT NULL,
    sortable_name    VARCHAR,
    -- login_id is the institution-issued identifier (typically email); may be absent
    -- when the Canvas instance restricts personal info visibility
    login_id         VARCHAR,
    enrollment_state VARCHAR NOT NULL,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_student_per_course UNIQUE (canvas_user_id, course_id)
);

CREATE INDEX idx_students_course_id ON students(course_id);

-- ─────────────────────────────────────────────
-- User Preferences (one row per user)
-- ─────────────────────────────────────────────
CREATE TABLE user_preferences (
    user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_course_id        INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    notification_settings   JSONB NOT NULL DEFAULT '{}',
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Message drafts
CREATE TABLE message_drafts (
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

CREATE INDEX idx_message_drafts_user_id ON message_drafts(user_id);

-- Admin system settings
CREATE TABLE system_settings (
    key         VARCHAR PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Schema Migrations
-- Tracks which db/migrations/*.sql files have been applied — read and
-- written by app/backend/app/core/migrations.py on every backend startup,
-- so an existing database picks up a schema change automatically instead
-- of crashing the first time a query touches a column/table that isn't
-- there yet (Base.metadata.create_all() alone only creates missing
-- tables, it never ALTERs an existing one). A database created fresh from
-- this file already reflects every migration listed below directly, so
-- they're pre-stamped here rather than left for the app to re-discover.
-- Whenever a new migration file is added, add its filename to both this
-- INSERT and the CREATE TABLE/ALTER TABLE it describes above.
-- ─────────────────────────────────────────────
CREATE TABLE schema_migrations (
    filename    VARCHAR PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (filename) VALUES
    ('002_remove_ta_role.sql'),
    ('002_submission_status_and_grading.sql'),
    ('003_rename_audit_logs_to_session.sql'),
    ('004_workflow_auditlog_redesign.sql'),
    ('005_assignment_description.sql'),
    ('006_workflow_affected_resources.sql'),
    ('007_audit_logs_allow_conversation_resource_type.sql'),
    ('008_unstarted_backend_features.sql'),
    ('009_assignment_unique_per_course.sql'),
    ('010_workflow_schema_repair.sql'),
    ('011_course_name_tracking.sql'),
    ('012_tool_call_logs.sql'),
    ('013_resolved_sets.sql'),
    ('014_canvas_course_names_workflow_state.sql');