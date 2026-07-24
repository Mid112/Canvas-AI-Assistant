-- Feature Reliability (#1189): reserve-first claims + retention.
--
-- pending rows are inserted before the Canvas mutation so concurrent callers
-- with the same key cannot both write. completed rows keep the cached response.
-- response_json is nullable while status='pending'.
--
-- Retention: completed rows older than 7 days and abandoned pending claims
-- older than 5 minutes are pruned by prune_expired_idempotency_keys().

ALTER TABLE canvas_idempotency_keys
    ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'completed';

ALTER TABLE canvas_idempotency_keys
    ALTER COLUMN response_json DROP NOT NULL;

ALTER TABLE canvas_idempotency_keys
    DROP CONSTRAINT IF EXISTS canvas_idempotency_keys_status_check;

ALTER TABLE canvas_idempotency_keys
    ADD CONSTRAINT canvas_idempotency_keys_status_check
    CHECK (status IN ('pending', 'completed'));

-- Speeds opportunistic TTL deletes that are not user-scoped.
CREATE INDEX IF NOT EXISTS idx_canvas_idempotency_keys_created_at
    ON canvas_idempotency_keys(created_at);
