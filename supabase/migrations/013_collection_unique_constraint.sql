-- Migration 013: add unique constraint to user_collections(user_id, sku_id)
-- Required for the upsert ON CONFLICT clause in api.ts to work correctly.
-- Without this, Supabase throws "no unique or exclusion constraint matching".

-- Remove any accidental duplicate rows first (keeps the most recently created copy)
DELETE FROM user_collections a
USING user_collections b
WHERE a.created_at < b.created_at
  AND a.user_id = b.user_id
  AND a.sku_id = b.sku_id;

ALTER TABLE user_collections
  ADD CONSTRAINT user_collections_user_id_sku_id_key UNIQUE (user_id, sku_id);
