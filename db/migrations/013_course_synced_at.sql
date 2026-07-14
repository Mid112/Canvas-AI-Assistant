-- Adds courses.synced_at, so set_active_course() can tell a row that has been
-- confirmed against a real Canvas response (services/canvas.py's get_courses())
-- apart from one that is merely trusting 011's workflow_state backfill default.
--
-- Existing rows get NULL (never synced under this column) rather than NOW() —
-- set_active_course() now refuses to select a course whose synced_at is NULL,
-- forcing a real Canvas sync (which every course-fetch call performs) before
-- that row's workflow_state can be trusted for the active-course check.

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
