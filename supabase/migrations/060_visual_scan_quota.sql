-- Visual scan daily quota tracking for free users
-- Same pattern as scan_count_day / scan_count_used (migration 039)
-- Free users get 1 visual scan per day; premium users are unlimited.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS visual_scan_count_day  text,
  ADD COLUMN IF NOT EXISTS visual_scan_count_used integer NOT NULL DEFAULT 0;
