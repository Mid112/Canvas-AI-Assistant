-- Direct-execute reads for the chat pipeline (services/chat.py) drop the
-- intent_preview/confirm gate for fetch_courses/fetch_assignments/
-- fetch_students/fetch_submissions -- they now run inside the same turn
-- that proposed them. tool_call_logs tracks the pending/executing/
-- executed/failed lifecycle of each individual Canvas-reading call,
-- including internal sub-calls the app makes on the user's behalf without
-- a separate turn (e.g. the fetch_assignments call inside
-- fetch_submissions' assignment-resolution chain). Deliberately not
-- workflows: that table's preview_message_id is tied 1:1 to a specific
-- assistant message the user reviews and confirms, which no longer
-- applies to reads.
CREATE TABLE IF NOT EXISTS tool_call_logs (
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

CREATE INDEX IF NOT EXISTS idx_tool_call_logs_user_id ON tool_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_conversation_id ON tool_call_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_course_id ON tool_call_logs(course_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_status ON tool_call_logs(status);
