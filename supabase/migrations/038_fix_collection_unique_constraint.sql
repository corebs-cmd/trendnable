-- Migration 038: fix user_collections unique constraint for upsert ON CONFLICT
--
-- Migration 031 replaced the named UNIQUE CONSTRAINT with a partial index
-- (WHERE sku_id IS NOT NULL). PostgREST/Supabase's upsert ON CONFLICT clause
-- requires a standard named constraint or a non-partial unique index — partial
-- indexes are not resolvable by column name alone.
--
-- PostgreSQL UNIQUE constraints naturally allow multiple NULLs (NULL != NULL),
-- so this constraint still permits multiple catalog-only rows per user while
-- enforcing uniqueness for rows that have a sku_id.

-- Drop the partial index added by migration 031
DROP INDEX IF EXISTS uc_user_sku_idx;

-- Also drop any other known constraint names left by earlier migrations
ALTER TABLE user_collections DROP CONSTRAINT IF EXISTS user_collections_user_id_sku_id_key;
ALTER TABLE user_collections DROP CONSTRAINT IF EXISTS user_collections_user_sku_unique;

-- Add a proper named constraint that ON CONFLICT can reference
ALTER TABLE user_collections
  ADD CONSTRAINT user_collections_user_id_sku_id_key
  UNIQUE (user_id, sku_id);
