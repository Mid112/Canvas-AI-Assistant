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
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    canvas_url       VARCHAR NOT NULL,
    encrypted_token  TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
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
    instructor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    -- composite unique: the same Canvas course can exist once per instructor (co-instructors allowed)
    CONSTRAINT uq_course_per_instructor UNIQUE (canvas_course_id, instructor_id)
);

CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);

-- ─────────────────────────────────────────────
-- Assignments
-- ─────────────────────────────────────────────
CREATE TABLE assignments (
    id                   SERIAL PRIMARY KEY,
    canvas_assignment_id VARCHAR UNIQUE NOT NULL,
    course_id            INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title                VARCHAR NOT NULL,
    due_date             TIMESTAMPTZ,
    points_possible      FLOAT,
    created_at           TIMESTAMPTZ DEFAULT NOW()
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
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
-- ─────────────────────────────────────────────
CREATE TABLE workflows (
    id               SERIAL PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    intent           VARCHAR NOT NULL,
    generated_query  JSONB,
    preview_data     JSONB,
    status           VARCHAR NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_conversation_id ON workflows(conversation_id);
CREATE INDEX idx_workflows_status ON workflows(status);

-- ─────────────────────────────────────────────
-- Audit Logs
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    workflow_id  INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
    action       VARCHAR NOT NULL,
    details      JSONB,
    timestamp    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

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
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);