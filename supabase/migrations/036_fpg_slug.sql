-- 036_fpg_slug.sql
-- Adds fpg_slug column to store the matched Funky Price Guide URL slug per SKU.
-- Also clears all existing price_guide values — they were fetched by FPG internal ID
-- (not Funko Pop #) and are therefore wrong. The updated edge function uses name-search
-- + pop_number matching, which is accurate.

alter table skus add column if not exists fpg_slug text;

-- Clear bad price_guide data fetched under the old (wrong) approach
update skus set price_guide = null, price_guide_updated_at = null, fpg_slug = null
where category_id = 'funko';
