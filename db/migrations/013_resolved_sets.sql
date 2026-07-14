-- Server-computed recipient sets (e.g. "students missing submissions for
-- assignment 4"), persisted so the LLM only ever sees a compact
-- {count, sample, handle} summary from resolve_missing_submissions --
-- never the raw per-student list -- and a later send_message turn can
-- materialize the real recipient IDs back out via recipient_handle,
-- scoped to the conversation that created the set (see
-- materialize_resolved_set in services/resolved_set.py).
CREATE TABLE IF NOT EXISTS resolved_sets (
    handle                VARCHAR PRIMARY KEY,
    conversation_id       INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind                  VARCHAR NOT NULL,
    query                 JSONB NOT NULL,
    snapshot_recipients   JSONB NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    expires_at            TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resolved_sets_conversation_id ON resolved_sets(conversation_id);
