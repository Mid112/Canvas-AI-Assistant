-- Adds workflows.undone_at so a reversible action (currently just
-- update_assignment) can be marked unambiguously reverted without
-- overloading the existing status column's lifecycle meaning
-- (pending -> executing -> executed/failed/cancelled/superseded). A second
-- undo attempt on the same workflow is rejected by checking
-- undone_at IS NULL, not by adding a new status value that would require
-- touching every existing status-based query.

ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ NULL;
