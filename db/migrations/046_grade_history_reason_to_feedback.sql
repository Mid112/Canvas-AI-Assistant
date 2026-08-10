-- `reason` was never a reason: the column holds the student-facing submission
-- comment posted alongside a grade change. One name for it everywhere.
--
-- A rename rather than add-column-and-copy, so existing history keeps its text
-- and there is no window where two columns disagree. Guarded on both sides so
-- re-running is a no-op and a database created from the current 01_schema.sql
-- (which already has `feedback`) is left alone.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'grade_history' AND column_name = 'reason'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'grade_history' AND column_name = 'feedback'
    ) THEN
        ALTER TABLE grade_history RENAME COLUMN reason TO feedback;
    END IF;
END $$;
