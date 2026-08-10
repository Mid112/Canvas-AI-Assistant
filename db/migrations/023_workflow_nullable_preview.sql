-- Allow form-created workflows that have no chat preview / source message
-- and may not be tied to a conversation (quiz creation form path).

ALTER TABLE workflows ALTER COLUMN preview_message_id DROP NOT NULL;
ALTER TABLE workflows ALTER COLUMN source_user_message_id DROP NOT NULL;
ALTER TABLE workflows ALTER COLUMN conversation_id DROP NOT NULL;

-- Recreate unique index as partial (only enforce when not null)
DROP INDEX IF EXISTS ix_workflows_preview_message_id;
CREATE UNIQUE INDEX ix_workflows_preview_message_id
    ON workflows (preview_message_id)
    WHERE preview_message_id IS NOT NULL;
