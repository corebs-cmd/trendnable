-- 032_catalog_image_url.sql
-- Adds image_url to product_catalog for scan pipeline results.

DO $$ BEGIN
  ALTER TABLE product_catalog ADD COLUMN image_url text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
