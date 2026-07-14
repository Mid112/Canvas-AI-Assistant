-- canvas_course_names is write-once and fetch_courses deliberately
-- includes completed (past-term) courses alongside active ones, so an
-- instructor who has taught the same course code more than once
-- accumulates multiple rows with an identical name -- previously making
-- that name permanently unresolvable by _match_course_name (services/chat.py),
-- since it only ever treated 0 or >1 matches as "couldn't resolve." This
-- column lets duplicate-name matches be narrowed to the still-active
-- offering instead of giving up outright.
ALTER TABLE canvas_course_names ADD COLUMN IF NOT EXISTS workflow_state VARCHAR;
