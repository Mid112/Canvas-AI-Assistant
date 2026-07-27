-- Admin-side escalation tracking for failed operations (Feature 12, Secure
-- Troubleshooting). One ticket per failed_operation (UNIQUE) — escalating
-- the same failure twice returns the existing ticket instead of creating a
-- duplicate. Read-only/escalate-only for now: no retry/re-trigger action.
CREATE TABLE IF NOT EXISTS support_tickets (
    id                 SERIAL PRIMARY KEY,
    failed_operation_id INTEGER NOT NULL UNIQUE REFERENCES failed_operations(id) ON DELETE CASCADE,
    user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status             VARCHAR NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'investigating', 'resolved')),
    admin_notes        TEXT,
    created_by         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    resolved_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created_at
    ON support_tickets(status, created_at DESC);
