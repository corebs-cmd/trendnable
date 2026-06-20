-- Migration 039: free-tier scan quota
--
-- Tracks daily scan usage for free users so the scan-pipeline edge function
-- can enforce a per-day limit. Premium users bypass the check.
--
-- scan_count_day  — UTC date the current count applies to (NULL = never scanned)
-- scan_count_used — number of scans used on that day
--
-- Reset is implicit: if scan_count_day != today (UTC), the edge function treats
-- used as 0 and updates the row. No background job needed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS scan_count_day  date,
  ADD COLUMN IF NOT EXISTS scan_count_used integer NOT NULL DEFAULT 0;
