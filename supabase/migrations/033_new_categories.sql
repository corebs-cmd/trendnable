-- 033_new_categories.sql
-- Adds "Signed & Autographed" and "ThrillJoy" categories.
-- Autographed: cross-format (cards, figures, comics, pops) signed collectibles.
-- ThrillJoy: designer toy brand similar to Pop Mart.

-- Extend the type check constraint to allow 'signed' for the autographed category
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_type_check;
ALTER TABLE categories ADD CONSTRAINT categories_type_check
  CHECK (type IN ('figure', 'card', 'box', 'car', 'signed'));

INSERT INTO categories (id, label, short, type) VALUES
  ('autographed', 'Signed & Autographed', 'Signed',    'signed'),
  ('thrilljoy',   'ThrillJoy',            'ThrillJoy', 'box')
ON CONFLICT (id) DO NOTHING;
