-- Migration note: applies the schema change described by 025_instructor_llm_connections.sql; keep it idempotent-friendly for existing developer databases.

CREATE TABLE IF NOT EXISTS instructor_llm_connections (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id VARCHAR NOT NULL,
    model VARCHAR,
    base_url VARCHAR,
    -- never store the raw key — always Fernet-encrypted before insert
    -- (same CANVAS_TOKEN_ENCRYPTION_KEY as canvas_connections.encrypted_token)
    encrypted_api_key TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_llm_connections_user_id
    ON instructor_llm_connections(user_id);
