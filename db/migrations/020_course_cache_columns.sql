-- Adds courses.course_code and courses.total_students so a locally-cached
-- course row (get_cached_courses(), services/canvas.py) has everything
-- CourseResponse needs to render a full course card without a live Canvas
-- call — previously only get_courses()'s live response carried these two
-- fields, so the dashboard could never paint from local data alone.
--
-- Existing rows get NULL until the next real Canvas sync backfills them;
-- get_cached_courses() coalesces a NULL course_code to "" and leaves
-- total_students as NULL (frontend already treats it as optional).

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS course_code TEXT,
    ADD COLUMN IF NOT EXISTS total_students INTEGER;
