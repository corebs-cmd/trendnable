-- 031_scan_feature.sql
-- Adds barcode scanning support to the Trendnable collectibles app.
-- Idempotent: safe to run multiple times.

-- ── 1. Add barcode + scan_count columns to product_catalog ───────────────────

DO $$ BEGIN
  ALTER TABLE product_catalog ADD COLUMN barcode text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE product_catalog ADD COLUMN scan_count integer NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS product_catalog_barcode_idx
  ON product_catalog (barcode)
  WHERE barcode IS NOT NULL;

-- ── 2. Add catalog_id FK to user_watchlists ───────────────────────────────────

DO $$ BEGIN
  ALTER TABLE user_watchlists
    ADD COLUMN catalog_id uuid REFERENCES product_catalog(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 3. Add catalog_id FK to user_collections ─────────────────────────────────

DO $$ BEGIN
  ALTER TABLE user_collections
    ADD COLUMN catalog_id uuid REFERENCES product_catalog(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 4. Make sku_id nullable in user_watchlists ────────────────────────────────

ALTER TABLE user_watchlists ALTER COLUMN sku_id DROP NOT NULL;

-- ── 5. Make sku_id nullable in user_collections ───────────────────────────────

ALTER TABLE user_collections ALTER COLUMN sku_id DROP NOT NULL;

-- ── 6. Replace user_watchlists unique constraint ──────────────────────────────
-- Drop both possible names for the old constraint (001 inline + 013 explicit).

ALTER TABLE user_watchlists DROP CONSTRAINT IF EXISTS user_watchlists_user_id_sku_id_key;

-- Partial unique indexes: one row per (user, sku) and one per (user, catalog entry).
CREATE UNIQUE INDEX IF NOT EXISTS uw_user_sku_idx
  ON user_watchlists (user_id, sku_id)
  WHERE sku_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uw_user_catalog_idx
  ON user_watchlists (user_id, catalog_id)
  WHERE catalog_id IS NOT NULL;

-- ── 7. Replace user_collections unique constraint ─────────────────────────────
-- Drop all known names for the old constraint (007 + 013 migrations).

ALTER TABLE user_collections DROP CONSTRAINT IF EXISTS user_collections_user_id_sku_id_key;
ALTER TABLE user_collections DROP CONSTRAINT IF EXISTS user_collections_user_sku_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uc_user_sku_idx
  ON user_collections (user_id, sku_id)
  WHERE sku_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uc_user_catalog_idx
  ON user_collections (user_id, catalog_id)
  WHERE catalog_id IS NOT NULL;
