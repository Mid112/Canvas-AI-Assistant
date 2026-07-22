CREATE TABLE IF NOT EXISTS grade_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assignment_id VARCHAR NOT NULL,
    student_canvas_id VARCHAR NOT NULL,
    previous_grade VARCHAR,
    new_grade VARCHAR NOT NULL,
    previous_score DOUBLE PRECISION,
    reason TEXT,
    risk_level VARCHAR NOT NULL DEFAULT 'high',
    rollback_available BOOLEAN NOT NULL DEFAULT TRUE,
    canvas_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_grade_history_user_id ON grade_history(user_id);
CREATE INDEX IF NOT EXISTS ix_grade_history_course_id ON grade_history(course_id);
CREATE INDEX IF NOT EXISTS ix_grade_history_assignment_id ON grade_history(assignment_id);
CREATE INDEX IF NOT EXISTS ix_grade_history_student_canvas_id ON grade_history(student_canvas_id);
CREATE INDEX IF NOT EXISTS ix_grade_history_created_at ON grade_history(created_at);
