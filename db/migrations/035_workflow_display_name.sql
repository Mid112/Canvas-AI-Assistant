-- Optional instructor-facing workflow label for pause/resume/rename (#1237).
ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS display_name TEXT;
