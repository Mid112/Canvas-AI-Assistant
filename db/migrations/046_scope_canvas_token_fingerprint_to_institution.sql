-- A Canvas API token is scoped to its Canvas institution. The same token
-- string in two independent Canvas instances is not the same credential
-- namespace, so uniqueness must include the normalized Canvas URL.
DROP INDEX IF EXISTS uq_canvas_token_fingerprint;

CREATE UNIQUE INDEX IF NOT EXISTS uq_canvas_url_token_fingerprint
    ON canvas_connections(canvas_url, token_fingerprint)
    WHERE token_fingerprint IS NOT NULL;
