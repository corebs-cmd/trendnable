// Trendnable — Resolve Consensus
// Nightly sweep of deferred_consensus entries. For each unresolved entry:
//   - If the pipeline now has >= N listings for the SKU:
//       instant-path check: submitted price within ±band% of pipeline median → award +3
//   - If expires_at has passed:
//       if >= min_samples available → final check → award or expire
//       if still thin → expire without bonus
// Also triggered inline at submission via the N-trigger path in submitCommunityPrice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Config defaults — overridden by app_config table rows
const DEFAULT_LISTING_THRESHOLD = 3;
const DEFAULT_MATCH_BAND_PCT    = 20;
const DEFAULT_MIN_SAMPLES       = 3;

function withinBand(submitted: number, median: number, bandPct: number): boolean {
  if (median <= 0) return false;
  return Math.abs(submitted - median) / median <= bandPct / 100;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load config thresholds
  const { data: configRows } = await svc.from('app_config').select('key, value');
  const cfg = Object.fromEntries((configRows ?? []).map((r: any) => [r.key, r.value]));
  const listingThreshold = parseInt(cfg.consensus_listing_threshold ?? String(DEFAULT_LISTING_THRESHOLD));
  const matchBandPct     = parseFloat(cfg.consensus_match_band_pct   ?? String(DEFAULT_MATCH_BAND_PCT));
  const minSamples       = parseInt(cfg.consensus_defer_min_samples   ?? String(DEFAULT_MIN_SAMPLES));

  const now = new Date().toISOString();

  // Fetch all unresolved deferred entries
  const { data: pending, error: fetchErr } = await svc
    .from('deferred_consensus')
    .select('*')
    .eq('resolved', false)
    .order('submitted_at', { ascending: true });

  if (fetchErr) {
    console.error('Failed to fetch deferred_consensus:', fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  let awarded = 0;
  let expired = 0;
  let stillPending = 0;

  for (const entry of pending ?? []) {
    // Fetch current pipeline data for this SKU/catalog
    let listingCount = 0;
    let priceMedian  = 0;

    if (entry.catalog_id) {
      const { data: cat } = await svc
        .from('product_catalog')
        .select('listing_count, price_latest')
        .eq('id', entry.catalog_id)
        .maybeSingle();
      listingCount = cat?.listing_count ?? 0;
      priceMedian  = parseFloat(cat?.price_latest ?? '0');
    } else if (entry.sku_id) {
      const { data: sku } = await svc
        .from('skus')
        .select('price_median')
        .eq('id', entry.sku_id)
        .maybeSingle();
      priceMedian = parseFloat(sku?.price_median ?? '0');
      // For SKUs we trust listing_count in daily_snapshots — use price_median as proxy
      listingCount = priceMedian > 0 ? listingThreshold : 0; // conservative: assume covered if we have a median
    }

    const isExpired      = entry.expires_at <= now;
    const nowCovered     = listingCount >= listingThreshold;
    const qualifies      = priceMedian > 0 && withinBand(entry.submitted_price, priceMedian, matchBandPct);

    if (nowCovered || (isExpired && listingCount >= minSamples)) {
      // Resolve — award or not
      const markAwarded = qualifies;

      await svc.from('deferred_consensus').update({
        resolved: true,
        awarded:  markAwarded,
        resolved_at: now,
      }).eq('id', entry.id);

      if (markAwarded) {
        // Credit +3 sparks
        const { data: userData } = await svc
          .from('users')
          .select('reward_units')
          .eq('id', entry.user_id)
          .single();
        const current = (userData as any)?.reward_units ?? 0;

        await svc.from('users').update({ reward_units: current + 3 }).eq('id', entry.user_id);

        const skuLabel = entry.catalog_id ?? entry.sku_id ?? 'item';
        await svc.from('reward_events').insert({
          user_id:    entry.user_id,
          event_type: 'consensus',
          units:      3,
          catalog_id: entry.catalog_id ?? null,
          sku_id:     entry.sku_id ?? null,
          note:       'Your price matched the market (+3)',
        });

        awarded++;
      } else {
        expired++;
      }
    } else if (isExpired) {
      // Expired and still thin — close without bonus
      await svc.from('deferred_consensus').update({
        resolved: true,
        awarded:  false,
        resolved_at: now,
      }).eq('id', entry.id);
      expired++;
    } else {
      stillPending++;
    }
  }

  console.log(`resolve-consensus: awarded=${awarded} expired=${expired} pending=${stillPending}`);

  return json({ ok: true, awarded, expired, still_pending: stillPending });
});
