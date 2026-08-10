-- User-scoped, expiring cache for safe, non-Canvas assistant responses.
-- Prompts are represented only by a SHA-256 key; raw prompt text is never
-- persisted in this table.

CREATE TABLE IF NOT EXISTS llm_response_cache (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cache_key   VARCHAR(64) NOT NULL,
    provider    VARCHAR(64) NOT NULL,
    model       VARCHAR(255) NOT NULL,
    response    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_llm_response_cache_key UNIQUE (cache_key)
);

CREATE INDEX IF NOT EXISTS idx_llm_response_cache_user_id
    ON llm_response_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_response_cache_expires_at
    ON llm_response_cache(expires_at);
