-- Adds courses.workflow_state and assignments.is_active, needed for:
-- - set_active_course() to reject unpublished/non-selectable courses without a
--   live Canvas call (services/canvas.py)
-- - get_assignments()/get_students() to reconcile rows Canvas no longer returns
--   (deleted assignment, unenrolled student) instead of leaving them counted
--   as active forever (services/canvas.py, services/student.py)
--
-- Existing rows default to workflow_state='available' / is_active=true until
-- their next Canvas sync corrects them — ActiveCourseProvider re-syncs on every
-- app load, so this self-heals within one page load per user rather than
-- requiring a backfill pass.

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS workflow_state VARCHAR NOT NULL DEFAULT 'available';

ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
