-- System Health Monitoring (Feature 9). GET /admin/health runs 4 checks
-- (backend/database/canvas/ai) concurrently on every call and writes one
-- row per service here as an audit trail for "Verify monitoring" -- the
-- dashboard itself only ever reads the latest run, this table backs no
-- history/trend UI.
CREATE TABLE IF NOT EXISTS health_checks (
    id            SERIAL PRIMARY KEY,
    service       VARCHAR NOT NULL
                   CHECK (service IN ('backend', 'database', 'canvas', 'ai')),
    status        VARCHAR NOT NULL
                   CHECK (status IN ('healthy', 'degraded', 'down')),
    latency_ms    INTEGER,
    error_detail  TEXT,
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_service_checked_at
    ON health_checks(service, checked_at DESC);
