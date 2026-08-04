-- One-time repair for stale/corrupted chat course snapshots after
-- canvas_course_names became an alias table.
--
-- Course.name is the canonical display label. canvas_course_names preserves
-- historical aliases for resolution, so do not rewrite every alias name to the
-- current display name: doing so can collapse multiple aliases into the same
-- unique key and would remove useful rename history. Instead, refresh metadata
-- on existing aliases, ensure a current-name alias exists, and repair existing
-- conversation snapshots from courses.name.

WITH refreshed_aliases AS (
    UPDATE canvas_course_names AS ccn
    SET workflow_state = courses.workflow_state
    FROM courses
    WHERE ccn.local_course_id = courses.id
      AND ccn.workflow_state IS DISTINCT FROM courses.workflow_state
    RETURNING ccn.id
)
SELECT COUNT(*) AS refreshed_canvas_course_name_aliases
FROM refreshed_aliases;

WITH current_course_aliases AS (
    SELECT DISTINCT
        ccn.canvas_connection_id,
        ccn.canvas_course_id,
        courses.id AS local_course_id,
        courses.name,
        courses.workflow_state
    FROM canvas_course_names AS ccn
    JOIN courses ON ccn.local_course_id = courses.id
),
upserted_current_aliases AS (
    INSERT INTO canvas_course_names (
        canvas_connection_id,
        canvas_course_id,
        local_course_id,
        name,
        workflow_state,
        last_seen_at
    )
    SELECT
        canvas_connection_id,
        canvas_course_id,
        local_course_id,
        name,
        workflow_state,
        NOW()
    FROM current_course_aliases
    ON CONFLICT ON CONSTRAINT uq_connection_canvas_course_name
    DO UPDATE SET
        local_course_id = EXCLUDED.local_course_id,
        workflow_state = EXCLUDED.workflow_state,
        last_seen_at = NOW()
    RETURNING id
)
SELECT COUNT(*) AS upserted_current_canvas_course_name_aliases
FROM upserted_current_aliases;

WITH repaired_conversations AS (
    UPDATE conversations AS conv
    SET course_name = courses.name
    FROM courses
    WHERE conv.course_id = courses.id
      AND conv.course_name IS DISTINCT FROM courses.name
    RETURNING conv.id
)
SELECT COUNT(*) AS repaired_conversation_course_names
FROM repaired_conversations;
