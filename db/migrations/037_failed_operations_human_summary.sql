-- Adds a plain-language summary alongside the raw error_detail on
-- failed_operations, generated at write time by
-- services/failed_operations.py::summarize_failure so the admin dashboard
-- never has to translate error codes on the fly at render time (Feature 12,
-- Secure Troubleshooting).
ALTER TABLE failed_operations
    ADD COLUMN IF NOT EXISTS human_summary VARCHAR NOT NULL DEFAULT 'An operation failed.';

ALTER TABLE failed_operations
    ALTER COLUMN human_summary DROP DEFAULT;
