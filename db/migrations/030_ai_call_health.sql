-- Feature 9 Phase 2 (per-instructor AI health). One row per user holding
-- only their most recent observed AI call outcome (message-draft /
-- assignment-draft generation) -- not a log/history table. Written
-- passively wherever a real generate() call already happens
-- (services/messages.py, services/assignment_draft.py); never triggers an
-- AI call on its own.
CREATE TABLE IF NOT EXISTS ai_call_health (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider       VARCHAR NOT NULL,
    status         VARCHAR NOT NULL CHECK (status IN ('ok', 'failed')),
    error_detail   TEXT,
    last_called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
