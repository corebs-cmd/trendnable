-- Add missing resolved_at column to deferred_consensus.
-- Migration 061 omitted it; resolve-consensus function writes it on every resolution.
ALTER TABLE deferred_consensus
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
