-- Seed the 12 mock SKUs so FK constraints on user_collections/user_watchlists work
-- Run this after 001_initial_schema.sql

insert into skus (id, name, short, series, category_id, fandom_id, ebay_query, is_active) values
  ('sku-001', 'Luffy Gear 5 — Awakening',           'Luffy G5',          'Funko Pop · #1583',             'funko',   'onepiece', 'Luffy Gear 5 Funko Pop 1583',          true),
  ('sku-002', 'Charizard ex — 151 Special',          'Charizard ex',      'Pokémon TCG · 199/165',         'tcg',     'pokemon',  'Charizard ex 151 Pokemon card',        true),
  ('sku-003', 'Labubu — Macaron Lychee',             'Labubu Lychee',     'Pop Mart · Exciting Macaron',   'popmart', 'labubu',   'Labubu Macaron Lychee Pop Mart',       true),
  ('sku-004', 'Tanjiro Hinokami — Demon Slayer',     'Tanjiro Hinokami',  'Hot Toys · TMS101',             'hottoys', 'demon',    'Tanjiro Hinokami Hot Toys TMS101',     true),
  ('sku-005', 'Darth Vader — Red Saber Glow',        'Darth Vader',       'Funko Pop · GITD',              'funko',   'starwars', 'Darth Vader GITD Funko Pop',           true),
  ('sku-006', 'Gojo Satoru — Domain Expansion',      'Gojo',              'Funko Pop · #1430',             'funko',   'jjk',      'Gojo Satoru Funko Pop 1430',           true),
  ('sku-007', '''67 Camaro RS — Super Treasure Hunt','67 Camaro STH',     'Hot Wheels · 2024 Set',         'hwheels', 'disney',   '67 Camaro RS Super Treasure Hunt Hot Wheels', true),
  ('sku-008', 'Predator — Ultimate Jungle Hunter',   'Predator UJH',      'NECA · 7" Scale',               'neca',    'marvel',   'Predator Ultimate Jungle Hunter NECA', true),
  ('sku-009', 'Deku — Full Cowling 100%',            'Deku Full Cowling', 'Funko Pop · #1041',             'funko',   'mha',      'Deku Full Cowling Funko Pop 1041',     true),
  ('sku-010', 'Eleven — Season 5 Reveal',            'Eleven S5',         'Funko Pop · #1607',             'funko',   'stranger', 'Eleven Season 5 Funko Pop 1607',       true),
  ('sku-011', 'Pikachu Illustrator — Promo',         'Pikachu Illustrator','Pokémon · 1998 Promo',         'tcg',     'pokemon',  'Pikachu Illustrator 1998 Promo',       true),
  ('sku-012', 'Skull Panda — Tell Me What''s Wrong', 'Skull Panda',       'Pop Mart · The Sound of...',    'popmart', 'labubu',   'Skull Panda Pop Mart The Sound of',    true)
on conflict (id) do nothing;

-- Also seed hot_index with mock scores so queries return data immediately
insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score) values
  ('sku-001', 91,  7,  'up',   28, 22, 24, 17),
  ('sku-002', 87,  12, 'up',   26, 26, 21, 14),
  ('sku-003', 84,  4,  'up',   23, 24, 22, 15),
  ('sku-004', 79,  2,  'up',   19, 21, 23, 16),
  ('sku-005', 73,  -3, 'down', 16, 20, 22, 15),
  ('sku-006', 76,  9,  'up',   24, 19, 19, 14),
  ('sku-007', 68,  1,  'flat', 14, 18, 20, 16),
  ('sku-008', 64,  -2, 'down', 12, 16, 21, 15),
  ('sku-009', 62,  5,  'up',   17, 15, 17, 13),
  ('sku-010', 88,  14, 'up',   30, 21, 22, 15),
  ('sku-011', 81,  3,  'up',   19, 24, 24, 14),
  ('sku-012', 71,  6,  'up',   21, 18, 18, 14)
on conflict (sku_id) do nothing;

-- Seed today's price snapshot for each SKU
insert into daily_snapshots (sku_id, snapshot_date, listing_count, price_low, price_median, price_high)
select s.id, current_date,
  case s.id
    when 'sku-001' then 47 when 'sku-002' then 312 when 'sku-003' then 86
    when 'sku-004' then 23 when 'sku-005' then 128 when 'sku-006' then 64
    when 'sku-007' then 91 when 'sku-008' then 41  when 'sku-009' then 152
    when 'sku-010' then 28 when 'sku-011' then 11  when 'sku-012' then 118
  end,
  case s.id
    when 'sku-001' then 42   when 'sku-002' then 180 when 'sku-003' then 95
    when 'sku-004' then 420  when 'sku-005' then 28  when 'sku-006' then 38
    when 'sku-007' then 22   when 'sku-008' then 38  when 'sku-009' then 18
    when 'sku-010' then 32   when 'sku-011' then 4200 when 'sku-012' then 28
  end,
  case s.id
    when 'sku-001' then 58   when 'sku-002' then 215 when 'sku-003' then 128
    when 'sku-004' then 510  when 'sku-005' then 36  when 'sku-006' then 49
    when 'sku-007' then 34   when 'sku-008' then 52  when 'sku-009' then 24
    when 'sku-010' then 44   when 'sku-011' then 5600 when 'sku-012' then 38
  end,
  case s.id
    when 'sku-001' then 95   when 'sku-002' then 340 when 'sku-003' then 220
    when 'sku-004' then 720  when 'sku-005' then 62  when 'sku-006' then 84
    when 'sku-007' then 68   when 'sku-008' then 95  when 'sku-009' then 38
    when 'sku-010' then 78   when 'sku-011' then 8400 when 'sku-012' then 64
  end
from skus s
where s.id in ('sku-001','sku-002','sku-003','sku-004','sku-005','sku-006',
               'sku-007','sku-008','sku-009','sku-010','sku-011','sku-012')
on conflict (sku_id, snapshot_date) do nothing;
