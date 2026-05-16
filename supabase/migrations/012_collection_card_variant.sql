-- Migration 012: add card variant fields to user_collections
-- Allows users to record the specific grade/grader of their copy of a TCG card,
-- not just the SKU-level variant. Enables correct P&L when a user owns both
-- a raw copy and a graded copy of the same card.

alter table user_collections
  add column if not exists card_variant text check (card_variant in ('raw', 'graded')),
  add column if not exists card_grader  text,
  add column if not exists card_grade   text;

comment on column user_collections.card_variant is 'Trading Cards only: raw or graded';
comment on column user_collections.card_grader  is 'Grading company for this specific copy (PSA, BGS, CGC, SGC)';
comment on column user_collections.card_grade   is 'Grade value for this specific copy (10, 9.5, 9, etc.)';
