-- Model-driven, name-only course resolution for the chat pipeline
-- (services/chat.py). The LLM never sees or produces a numeric course
-- ID -- it names a course, and the app resolves that name deterministically
-- against a small, connection-scoped, write-once index.

-- Set once per conversation (at creation or on its first course
-- resolution) and never mutated after -- a subject switch routes to a
-- different conversation row instead of changing this one.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS course_name VARCHAR;

-- Backfill course_name for conversations that already have a course_id.
UPDATE conversations
SET course_name = courses.name
FROM courses
WHERE conversations.course_id = courses.id
  AND conversations.course_name IS NULL;

-- Last time services/canvas.py's sync_courses_if_stale actually hit
-- Canvas for this connection's course list, not just checked the cooldown.
ALTER TABLE canvas_connections
    ADD COLUMN IF NOT EXISTS courses_synced_at TIMESTAMPTZ;

-- canvas_course_id -> name index, scoped per Canvas connection (not
-- per instructor) so two institutions with colliding numeric
-- canvas_course_ids never collide, and never updated in place once a
-- row exists so a Canvas rename doesn't retroactively change what an
-- in-progress conversation has been calling a course.
CREATE TABLE IF NOT EXISTS canvas_course_names (
    id                      SERIAL PRIMARY KEY,
    canvas_connection_id    INTEGER NOT NULL REFERENCES canvas_connections(id) ON DELETE CASCADE,
    canvas_course_id        VARCHAR NOT NULL,
    local_course_id         INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    name                    VARCHAR NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_connection_canvas_course UNIQUE (canvas_connection_id, canvas_course_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_course_names_connection_id ON canvas_course_names(canvas_connection_id);
