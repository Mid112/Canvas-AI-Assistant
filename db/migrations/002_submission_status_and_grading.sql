-- Migration: expand submissions table for structured status and grading fields
-- PR: feature/submission-retrieval-service
-- Apply to any DB created before this PR (01_schema.sql already includes these changes).

-- Add grading columns (idempotent — no-op if they already exist)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS grade     VARCHAR;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;

-- Expand status CHECK from 3 values to 6
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('missing', 'late', 'submitted', 'graded', 'unsubmitted', 'excused'));
