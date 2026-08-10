-- Normalize Canvas connection authorities before the token uniqueness index is
-- used as an institution key. URL schemes and DNS hostnames are
-- case-insensitive; local Docker aliases are one institution as well.
--
-- This migration intentionally fails instead of silently choosing an owner if
-- canonicalization would make existing rows collide. Resolve the reported
-- rows and rerun the migration; encrypted tokens are never exposed to SQL.
DO $$
BEGIN
    IF EXISTS (
        WITH canonicalized AS (
            SELECT
                user_id,
                token_fingerprint,
                lower(split_part(canvas_url, '://', 1)) || '://' ||
                CASE
                    WHEN lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                        ~ '^(localhost|127\.0\.0\.1|canvas_lms)(:[0-9]+)?$'
                    THEN 'localhost' || COALESCE(
                        substring(
                            lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                            FROM ':[0-9]+$'
                        ),
                        ''
                    )
                    ELSE lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                END ||
                CASE
                    WHEN position('/' IN split_part(canvas_url, '://', 2)) > 0
                    THEN substring(
                        split_part(canvas_url, '://', 2)
                        FROM position('/' IN split_part(canvas_url, '://', 2))
                    )
                    ELSE ''
                END AS canonical_url
            FROM canvas_connections
        )
        SELECT 1
        FROM canonicalized
        GROUP BY user_id, canonical_url
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Canvas connection URLs collide after canonicalization; resolve duplicate rows before applying migration 047';
    END IF;

    IF EXISTS (
        WITH canonicalized AS (
            SELECT
                token_fingerprint,
                lower(split_part(canvas_url, '://', 1)) || '://' ||
                CASE
                    WHEN lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                        ~ '^(localhost|127\.0\.0\.1|canvas_lms)(:[0-9]+)?$'
                    THEN 'localhost' || COALESCE(
                        substring(
                            lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                            FROM ':[0-9]+$'
                        ),
                        ''
                    )
                    ELSE lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                END ||
                CASE
                    WHEN position('/' IN split_part(canvas_url, '://', 2)) > 0
                    THEN substring(
                        split_part(canvas_url, '://', 2)
                        FROM position('/' IN split_part(canvas_url, '://', 2))
                    )
                    ELSE ''
                END AS canonical_url
            FROM canvas_connections
            WHERE token_fingerprint IS NOT NULL
        )
        SELECT 1
        FROM canonicalized
        GROUP BY canonical_url, token_fingerprint
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Canvas token fingerprints collide after URL canonicalization; resolve duplicate rows before applying migration 047';
    END IF;
END
$$;

WITH canonicalized AS (
    SELECT
        id,
        lower(split_part(canvas_url, '://', 1)) || '://' ||
        CASE
            WHEN lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                ~ '^(localhost|127\.0\.0\.1|canvas_lms)(:[0-9]+)?$'
            THEN 'localhost' || COALESCE(
                substring(
                    lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
                    FROM ':[0-9]+$'
                ),
                ''
            )
            ELSE lower(split_part(split_part(canvas_url, '://', 2), '/', 1))
        END ||
        CASE
            WHEN position('/' IN split_part(canvas_url, '://', 2)) > 0
            THEN substring(
                split_part(canvas_url, '://', 2)
                FROM position('/' IN split_part(canvas_url, '://', 2))
            )
            ELSE ''
        END AS canonical_url
    FROM canvas_connections
)
UPDATE canvas_connections AS connection
SET canvas_url = canonicalized.canonical_url
FROM canonicalized
WHERE connection.id = canonicalized.id
  AND connection.canvas_url <> canonicalized.canonical_url;
