-- Rename the auto-generated UNIQUE constraint from older 01_schema.sql
-- snapshots (cache_key VARCHAR UNIQUE → llm_response_cache_cache_key_key)
-- to the named constraint used by the SQLAlchemy model. Idempotent when
-- the named constraint already exists (migration 021 / current init).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'llm_response_cache_cache_key_key'
          AND conrelid = 'public.llm_response_cache'::regclass
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_llm_response_cache_key'
          AND conrelid = 'public.llm_response_cache'::regclass
    ) THEN
        ALTER TABLE llm_response_cache
            RENAME CONSTRAINT llm_response_cache_cache_key_key
            TO uq_llm_response_cache_key;
    END IF;
END $$;
