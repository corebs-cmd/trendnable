-- Migration 023: add anime and tmnt fandoms
-- These were added to the app config but were missing from the fandoms table,
-- causing a foreign key violation when assigning them to SKUs via the admin.

insert into fandoms (id, label) values
  ('anime', 'Anime'),
  ('tmnt',  'TMNT')
on conflict (id) do nothing;
