-- Canvas course IDs are only unique within one Canvas instance. An instructor
-- connected to two institutions can sync the same numeric canvas_course_id on
-- both hosts and must keep a separate local courses row per canvas_url.
-- Widen uq_course_per_instructor from (canvas_course_id, instructor_id) to
-- (canvas_course_id, instructor_id, canvas_url) so those rows no longer collide.

ALTER TABLE courses
    DROP CONSTRAINT IF EXISTS uq_course_per_instructor;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_course_per_instructor'
          AND conrelid = 'public.courses'::regclass
    ) THEN
        ALTER TABLE courses
            ADD CONSTRAINT uq_course_per_instructor
            UNIQUE (canvas_course_id, instructor_id, canvas_url);
    END IF;
END $$;
