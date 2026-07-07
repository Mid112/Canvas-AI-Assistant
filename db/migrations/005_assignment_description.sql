-- Add description column to assignments (present in 01_schema.sql but missing on older DBs).
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS description TEXT;
