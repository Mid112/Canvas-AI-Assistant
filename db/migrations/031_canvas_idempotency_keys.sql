-- Feature Reliability (FR11.4 / #1189). Stores Canvas write outcomes keyed by
-- an idempotency key so a network retry after a successful mutation does not
-- create a second Canvas object.
CREATE TABLE IF NOT EXISTS canvas_idempotency_keys (
    idempotency_key VARCHAR PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation       VARCHAR NOT NULL,
    response_json   JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_idempotency_keys_user_created
    ON canvas_idempotency_keys(user_id, created_at DESC);
