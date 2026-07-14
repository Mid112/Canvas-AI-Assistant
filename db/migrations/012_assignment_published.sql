-- Adds assignments.published, Canvas's own draft/published distinction.
-- A draft (unpublished) assignment is invisible to students and cannot have
-- real submissions, so data-analysis surfaces (missing/late counts, average
-- grade, completion rate) need to exclude them rather than counting every
-- student as "missing" something they were never actually assigned.
--
-- Existing rows default to published=true until their next Canvas sync
-- corrects them — same self-healing rationale as 011's workflow_state/is_active
-- defaults.

ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
