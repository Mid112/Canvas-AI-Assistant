-- Convert canvas_course_names from one mutable label per Canvas course into
-- an alias table. Course.name remains the canonical display label; historical
-- aliases stay resolvable when a Canvas rename lands mid-conversation.

ALTER TABLE canvas_course_names
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE canvas_course_names
SET last_seen_at = COALESCE(last_seen_at, created_at, NOW())
WHERE last_seen_at IS NULL;

ALTER TABLE canvas_course_names
    ALTER COLUMN last_seen_at SET DEFAULT NOW(),
    ALTER COLUMN last_seen_at SET NOT NULL;

ALTER TABLE canvas_course_names
    DROP CONSTRAINT IF EXISTS uq_connection_canvas_course;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_connection_canvas_course_name'
          AND conrelid = 'canvas_course_names'::regclass
    ) THEN
        ALTER TABLE canvas_course_names
            ADD CONSTRAINT uq_connection_canvas_course_name
            UNIQUE (canvas_connection_id, canvas_course_id, name);
    END IF;
END $$;
