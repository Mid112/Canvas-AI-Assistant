-- Persist affected Canvas resources on workflow rows (#621, #870).
-- Populated at preview time from write_preview metadata and refreshed
-- after successful confirm from CanvasWriteResult.

ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS affected_resources JSONB NOT NULL DEFAULT '[]'::jsonb;
