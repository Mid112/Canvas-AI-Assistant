ALTER TABLE grade_history ADD COLUMN IF NOT EXISTS local_assignment_id INTEGER;
ALTER TABLE grade_history ADD COLUMN IF NOT EXISTS student_id INTEGER;

-- Preserve existing Canvas-id history while adding local relationships for
-- rows whose assignment/student mirror records already exist.
UPDATE grade_history gh
SET local_assignment_id = a.id
FROM assignments a
WHERE gh.local_assignment_id IS NULL
  AND gh.course_id = a.course_id
  AND gh.assignment_id = a.canvas_assignment_id;

UPDATE grade_history gh
SET student_id = s.id
FROM students s
WHERE gh.student_id IS NULL
  AND gh.course_id = s.course_id
  AND gh.student_canvas_id = s.canvas_user_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_grade_history_local_assignment_id'
    ) THEN
        ALTER TABLE grade_history
            ADD CONSTRAINT fk_grade_history_local_assignment_id
            FOREIGN KEY (local_assignment_id) REFERENCES assignments(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_grade_history_student_id'
    ) THEN
        ALTER TABLE grade_history
            ADD CONSTRAINT fk_grade_history_student_id
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grade_history_local_assignment_id ON grade_history(local_assignment_id);
CREATE INDEX IF NOT EXISTS idx_grade_history_student_id ON grade_history(student_id);
