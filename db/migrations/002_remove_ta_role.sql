-- Remove the deprecated 'ta' role from existing databases.
-- Fresh installs use db/init/01_schema.sql directly and do not need this file.
-- Local dev databases can also be recreated with docker compose instead.

UPDATE users
SET role = 'instructor'
WHERE role = 'ta';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
ADD CONSTRAINT users_role_check CHECK (role IN ('instructor', 'admin'));
