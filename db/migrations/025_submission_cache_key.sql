-- Canvas submission IDs are not reliable as a global key in local/dev
-- Canvas data. Scope the cache key to the local assignment so different
-- assignments/courses can safely cache the same Canvas-side submission id.
DELETE FROM submissions a
USING submissions b
WHERE a.assignment_id = b.assignment_id
  AND a.canvas_submission_id = b.canvas_submission_id
  AND a.id > b.id;

ALTER TABLE submissions
    DROP CONSTRAINT IF EXISTS submissions_canvas_submission_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_submission_per_assignment'
          AND conrelid = 'public.submissions'::regclass
    ) THEN
        ALTER TABLE submissions
            ADD CONSTRAINT uq_submission_per_assignment
            UNIQUE (assignment_id, canvas_submission_id);
    END IF;
END $$;
