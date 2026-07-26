-- Feature Assistant Context (#1235). Persists collected/confirmed assistant
-- fields (course refs, draft params) across turns without re-asking.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS field_memory JSONB NOT NULL DEFAULT '{}'::jsonb;
