-- Migration note: applies the schema change described by 026_deferred_assistant_requests.sql; keep it idempotent-friendly for existing developer databases.

CREATE TABLE IF NOT EXISTS deferred_assistant_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    proposed_action JSONB,
    status VARCHAR NOT NULL DEFAULT 'deferred',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deferred_assistant_requests_user_status
    ON deferred_assistant_requests(user_id, status);
