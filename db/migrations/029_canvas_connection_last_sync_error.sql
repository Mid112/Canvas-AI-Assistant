-- Feature 9 Phase 2 (per-instructor Canvas health). run_course_sync_sweep
-- already hits every canvas_connections row on its own ~60s cadence
-- (services/canvas.py) -- this just persists the outcome it already
-- computes instead of discarding it after a log line, so the admin System
-- Health page can show "N of M instructor Canvas connections are broken"
-- without any new Canvas calls.
ALTER TABLE canvas_connections
    ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
