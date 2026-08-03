-- Instructor Canvas account timezone (IANA name from /api/v1/users/self).
-- Used as the source of truth when interpreting naive due dates (#1435).
ALTER TABLE canvas_connections
    ADD COLUMN IF NOT EXISTS time_zone TEXT;
