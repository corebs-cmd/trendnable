-- Migration 042: community price fields on product_catalog and skus
--
-- Adds community-submitted pricing data to both catalog and SKU rows:
--   • ppg_price             — Pop Price Guide value (Funko only, community-submitted)
--   • retail_price          — retail / MSRP price (any category, community-submitted)
--   • has_community_data    — generated column: true when either price field is set
--   • community_data_reviewed — admin approval flag, defaults false
--   • community_contributor_id — auth.users FK, records who last submitted
--
-- All columns use IF NOT EXISTS so the migration is safe to re-run.

-- ── product_catalog ───────────────────────────────────────────────────────────

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS ppg_price numeric,
  ADD COLUMN IF NOT EXISTS retail_price numeric,
  ADD COLUMN IF NOT EXISTS community_data_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_contributor_id uuid REFERENCES auth.users(id);

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS has_community_data boolean
    GENERATED ALWAYS AS (ppg_price IS NOT NULL OR retail_price IS NOT NULL) STORED;

-- ── skus ──────────────────────────────────────────────────────────────────────

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS ppg_price numeric,
  ADD COLUMN IF NOT EXISTS retail_price numeric,
  ADD COLUMN IF NOT EXISTS community_data_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_contributor_id uuid REFERENCES auth.users(id);

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS has_community_data boolean
    GENERATED ALWAYS AS (ppg_price IS NOT NULL OR retail_price IS NOT NULL) STORED;

-- ── index ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_skus_has_community_data
  ON skus(has_community_data)
  WHERE has_community_data = true;
