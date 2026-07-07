-- assignments.canvas_assignment_id was globally unique, but two
-- co-instructors on the same real Canvas course get separate local
-- Course rows (courses is unique per (canvas_course_id, instructor_id),
-- not globally) — so both need their own Assignment row for the same
-- Canvas assignment ID. A global unique constraint made the second
-- instructor's get_assignments/get_submissions call either silently
-- reuse the first instructor's row (before the course_id scoping fix in
-- services/canvas.py) or fail outright on insert (after it). This
-- migration makes the constraint composite so each course can have its
-- own row for the same Canvas assignment ID.

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_canvas_assignment_id_key;

ALTER TABLE assignments
    ADD CONSTRAINT uq_assignment_per_course UNIQUE (canvas_assignment_id, course_id);
