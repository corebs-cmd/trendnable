-- ── New fandoms + backfill old IDs ───────────────────────────────────────────
-- Adds the three new fandom rows that the app now uses.
-- Must run BEFORE the UPDATE statements so the FK on skus.fandom_id is satisfied.

insert into fandoms (id, label) values
  ('sports',     'Sports'),
  ('videogames', 'Video Games'),
  ('nostalgia',  'Nostalgia')
on conflict (id) do nothing;

-- ── Backfill skus ─────────────────────────────────────────────────────────────

update skus set fandom_id = 'anime'
  where fandom_id in ('onepiece', 'demon');

update skus set fandom_id = 'nostalgia'
  where fandom_id in ('tmnt', 'labubu', 'disney', 'popcult');

update skus set fandom_id = 'videogames'
  where fandom_id = 'gaming';

-- ── Backfill product_catalog (no FK, safe to run freely) ─────────────────────

update product_catalog set fandom_id = 'anime'
  where fandom_id in ('onepiece', 'demon');

update product_catalog set fandom_id = 'nostalgia'
  where fandom_id in ('tmnt', 'labubu', 'disney', 'popcult');

update product_catalog set fandom_id = 'videogames'
  where fandom_id = 'gaming';
