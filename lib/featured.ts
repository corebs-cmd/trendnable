import { SKU } from './types';

const SLOT_MS = 6 * 60 * 60 * 1000; // 6 hours in ms

/**
 * Pick the hero SKU from an ordered pool (already sorted by hot score descending).
 *
 * Priority:
 *   1. Active force pin (is_featured = true AND pin not expired)
 *   2. Time-slot rotation over the top 5 candidates — slot index changes every 6 h
 *
 * Graceful at any pool size: a pool of 1 always returns that item; a pool of 0 returns undefined.
 */
export function getFeaturedSku(pool: SKU[]): SKU | undefined {
  if (pool.length === 0) return undefined;

  const now = Date.now();

  const pinned = pool.find(
    (s) =>
      s.isFeatured &&
      (!s.forceFeaturedUntil || new Date(s.forceFeaturedUntil).getTime() > now),
  );
  if (pinned) return pinned;

  const candidates = pool.slice(0, 5);
  const slotIdx = Math.floor(now / SLOT_MS);
  return candidates[slotIdx % candidates.length];
}
