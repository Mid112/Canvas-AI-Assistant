-- System Health Monitoring (Feature 9). GET /admin/health runs 4 checks
-- (backend/database/canvas/ai) on every call and writes one row per
-- service here as an audit trail for "Verify monitoring". Also backs
-- GET /admin/health/history's sparkline (Phase 2) -- rows older than
-- services/health.py's retention window are pruned on every live check,
-- so this isn't kept indefinitely.
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
