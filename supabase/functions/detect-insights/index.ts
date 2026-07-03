// Trendnable — detect-insights Edge Function
// Runs daily at 06:00 UTC. Evaluates 8 detection rules per active SKU,
// generates Claude Haiku narration for changed insights, writes to sku_insights.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;
const COST_CAP_USD      = 20.0;
const NARRATION_CAP     = 30;   // max LLM calls per run
const NARRATION_PARALLEL = 5;   // concurrent Haiku calls

// These insight types use fallback templates only — no LLM needed
const SKIP_LLM_TYPES = new Set(['low_data', 'steady_state']);

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction  = 'rising' | 'holding' | 'cooling' | 'falling';
type Confidence = 'low' | 'medium' | 'high';
type InsightType =
  | 'supply_shock' | 'quiet_accumulation' | 'false_top' | 'confirmed_breakout'
  | 'stagnation_risk' | 'catalyst_spike' | 'low_data' | 'steady_state';

interface Snapshot {
  snapshot_date: string;
  listing_count: number;
  price_median:  number;
  hot_score:     number;
}

interface WeeklySignal {
  week_start:      string;
  reddit_mentions: number;
  watch_count:     number;
  ebay_watchers:   number;
}

interface HotIndex {
  velocity_score:     number;
  volume_score:       number;
  confirmation_score: number;
  freshness_score:    number;
}

interface SkuData {
  id:          string;
  name:        string;
  series:      string;
  category_id: string;
  fandom_id:   string | null;
  hot:         HotIndex;
  snapshots:   Snapshot[];
  signals:     WeeklySignal[];
  currentInsight: { insight_type: string; fired_at: string } | null;
}

interface DetectionResult {
  type:       InsightType;
  direction:  Direction;
  confidence: Confidence;
  payload:    Record<string, unknown>;
}

// ── Detection helpers ─────────────────────────────────────────────────────────

function round(n: number, dp = 1) {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

function snapshotDaysAgo(snapshots: Snapshot[], daysAgo: number): Snapshot | null {
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
  // Find the closest snapshot at or before the cutoff
  const sorted = [...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  return sorted.find((s) => s.snapshot_date <= cutoff) ?? null;
}

function compositConfidence(hot: HotIndex): Confidence {
  const avg = (hot.velocity_score + hot.volume_score + hot.confirmation_score + hot.freshness_score) / 4;
  if (avg >= 18) return 'high';
  if (avg >= 10) return 'medium';
  return 'low';
}

function detectInsight(sku: SkuData): DetectionResult {
  const sorted = [...sku.snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  const today  = sorted[0] ?? null;
  const ago7   = snapshotDaysAgo(sku.snapshots, 7);
  const ago14  = snapshotDaysAgo(sku.snapshots, 14);
  const ago30  = snapshotDaysAgo(sku.snapshots, 30);

  const sortedSig = [...sku.signals].sort((a, b) => b.week_start.localeCompare(a.week_start));
  const thisWeek  = sortedSig[0] ?? null;
  const lastWeek  = sortedSig[1] ?? null;

  // Minimum data thresholds → low_data
  // Note: weekly_signals absence is NOT a gate — social data (Reddit/eBay watchers) is
  // optional. Rules that need it guard with null-checks internally. We only block on
  // insufficient price/listing history which makes score signals unreliable.
  if (
    sku.snapshots.length < 7 ||
    (today?.listing_count ?? 0) < 5
  ) {
    const reason =
      sku.snapshots.length < 7 ? 'insufficient_history'
      : 'low_listing_count';
    return {
      type: 'low_data', direction: 'holding', confidence: 'low',
      payload: { days_tracked: sku.snapshots.length, listing_count: today?.listing_count ?? 0, reason },
    };
  }

  // ── Detection rules — calibrated to actual data (price snapshots + listing counts).
  // Rules requiring Reddit/eBay watcher data are replaced with snapshot-based equivalents
  // since weekly_signals is not populated. confirmation_score is ~0 on most SKUs so any
  // rule requiring it high has been replaced. ────────────────────────────────────────────

  // Rule 1: supply_shock — listings up ≥15% WoW, price flat (±8% 14d), velocity ≤15
  if (today && ago7 && ago14 && ago7.listing_count > 0) {
    const listingChangePct  = ((today.listing_count - ago7.listing_count) / ago7.listing_count) * 100;
    const priceStabilityPct = Math.abs(((today.price_median - ago14.price_median) / (ago14.price_median || 1)) * 100);
    if (listingChangePct >= 15 && priceStabilityPct <= 8 && sku.hot.velocity_score <= 15) {
      return {
        type: 'supply_shock', direction: 'cooling', confidence: 'high',
        payload: {
          listing_count_now:        today.listing_count,
          listing_count_7d_ago:     ago7.listing_count,
          listing_count_change_pct: round(listingChangePct),
          price_median_now:         today.price_median,
          price_median_14d_ago:     ago14.price_median,
          price_stability_pct:      round(priceStabilityPct),
        },
      };
    }
  }

  // Rule 2: confirmed_breakout — price up ≥8% in 7 days.
  // Replaces the old "all 4 sub-scores ≥18" gate which could never fire because
  // confirmation_score is 0 on most SKUs.
  if (today && ago7 && ago7.price_median > 0) {
    const priceChange7d = ((today.price_median - ago7.price_median) / ago7.price_median) * 100;
    if (priceChange7d >= 8) {
      return {
        type: 'confirmed_breakout', direction: 'rising',
        confidence: priceChange7d >= 15 ? 'high' : 'medium',
        payload: {
          price_median_now:    today.price_median,
          price_median_7d_ago: ago7.price_median,
          price_change_7d_pct: round(priceChange7d),
          velocity_now:        sku.hot.velocity_score,
          listing_count_now:   today.listing_count,
        },
      };
    }
  }

  // Rule 3: price_drop — price down ≥8% in 7 days.
  // Replaces catalyst_spike which required Reddit 3x — not tracked.
  if (today && ago7 && ago7.price_median > 0) {
    const priceChange7d = ((today.price_median - ago7.price_median) / ago7.price_median) * 100;
    if (priceChange7d <= -8) {
      return {
        type: 'catalyst_spike', direction: 'cooling',
        confidence: priceChange7d <= -15 ? 'high' : 'medium',
        payload: {
          price_median_now:    today.price_median,
          price_median_7d_ago: ago7.price_median,
          price_change_7d_pct: round(priceChange7d),
          velocity_now:        sku.hot.velocity_score,
          listing_count_now:   today.listing_count,
        },
      };
    }
  }

  // Rule 4: false_top — price up ≥10% in 14 days but velocity is now below its own
  // 14-day average (momentum fading after a run). Reddit requirement removed.
  if (today && ago14 && ago14.price_median > 0) {
    const priceChange14d = ((today.price_median - ago14.price_median) / ago14.price_median) * 100;
    if (priceChange14d >= 10) {
      const snaps14d = sku.snapshots.filter((s) => s.snapshot_date >= ago14.snapshot_date);
      const velocity14dAvg = snaps14d.length > 0
        ? snaps14d.reduce((sum, s) => sum + s.hot_score, 0) / snaps14d.length
        : 0;
      if (velocity14dAvg > 2 && sku.hot.velocity_score < velocity14dAvg * 0.7) {
        return {
          type: 'false_top', direction: 'cooling', confidence: 'medium',
          payload: {
            price_change_14d_pct: round(priceChange14d),
            velocity_now:         sku.hot.velocity_score,
            velocity_14d_avg:     round(velocity14dAvg),
            price_median_now:     today.price_median,
            price_median_14d_ago: ago14.price_median,
          },
        };
      }
    }
  }

  // Rule 5: quiet_accumulation — high velocity (≥15) with stable price and flat/falling listings.
  // Replaces the old watcher-based version (eBay watcher data not tracked).
  if (today && ago7 && ago14 && ago7.listing_count > 0 && ago14.price_median > 0) {
    const priceChange14d    = ((today.price_median - ago14.price_median) / ago14.price_median) * 100;
    const listingChange7d   = ((today.listing_count - ago7.listing_count) / ago7.listing_count) * 100;
    if (sku.hot.velocity_score >= 15 && priceChange14d >= -3 && priceChange14d <= 8 && listingChange7d <= 5) {
      return {
        type: 'quiet_accumulation', direction: 'rising', confidence: 'medium',
        payload: {
          velocity_now:               sku.hot.velocity_score,
          price_change_14d_pct:       round(priceChange14d),
          listing_count_change_7d_pct: round(listingChange7d),
          listing_count_now:          today.listing_count,
          price_median_now:           today.price_median,
        },
      };
    }
  }

  // Rule 6: stagnation_risk — price flat ≥45d (±4%), velocity ≤5, listings up ≥8% 30d.
  // Lowered from 60d to 45d since fewer SKUs have 60+ day history.
  if (today && ago30) {
    const oldest     = sku.snapshots.reduce((min, s) => s.snapshot_date < min.snapshot_date ? s : min, sku.snapshots[0]);
    const dayTracked = Math.floor((Date.now() - new Date(oldest.snapshot_date).getTime()) / 86400000);
    if (dayTracked >= 45) {
      const recentSnaps = sku.snapshots.slice(-45);
      const priceMin    = Math.min(...recentSnaps.map((s) => s.price_median));
      const priceMax    = Math.max(...recentSnaps.map((s) => s.price_median));
      const priceDrift  = priceMin > 0 ? ((priceMax - priceMin) / priceMin) * 100 : 0;
      const listingChange30d = ago30.listing_count > 0
        ? ((today.listing_count - ago30.listing_count) / ago30.listing_count) * 100
        : 0;
      if (priceDrift <= 4 && sku.hot.velocity_score <= 5 && listingChange30d >= 8) {
        return {
          type: 'stagnation_risk', direction: 'falling', confidence: 'medium',
          payload: {
            days_flat:                    dayTracked,
            price_drift_pct:              round(priceDrift),
            velocity_now:                 sku.hot.velocity_score,
            listing_count_change_30d_pct: round(listingChange30d),
          },
        };
      }
    }
  }

  // Rule 8: steady_state (default — no significant movement)
  const priceChange14d = today && ago14
    ? round(((today.price_median - ago14.price_median) / (ago14.price_median || 1)) * 100)
    : 0;
  const listingChange7d = today && ago7 && ago7.listing_count > 0
    ? round(((today.listing_count - ago7.listing_count) / ago7.listing_count) * 100)
    : 0;
  return {
    type: 'steady_state', direction: 'holding', confidence: compositConfidence(sku.hot),
    payload: {
      price_change_14d_pct:      priceChange14d,
      listing_count_change_7d_pct: listingChange7d,
      velocity_now:              sku.hot.velocity_score,
    },
  };
}

// ── Cooldown check ────────────────────────────────────────────────────────────

function shouldSkip(current: { insight_type: string; fired_at: string } | null, newType: InsightType): boolean {
  if (!current) return false;
  if (current.insight_type !== newType) return false;
  const daysSinceFired = (Date.now() - new Date(current.fired_at).getTime()) / 86400000;
  return daysSinceFired < 7;
}

// ── Fallback narration templates ──────────────────────────────────────────────

function fallbackNarration(type: InsightType, payload: Record<string, unknown>): { short: string; long: string } {
  const p = payload as Record<string, number | string>;
  switch (type) {
    case 'supply_shock':
      return {
        short: `Listings up ${p.listing_count_change_pct}% this week while median holds near $${p.price_median_now}.`,
        long:  `Listings rose from ${p.listing_count_7d_ago} to ${p.listing_count_now} (${p.listing_count_change_pct}% change) over the past week, while the median price has held within ${p.price_stability_pct}% of $${p.price_median_now}. Active inventory is building faster than recent demand. This tends to precede price softening if buying interest doesn't pick up. Worth monitoring over the next 7–14 days.`,
      };
    case 'confirmed_breakout':
      return {
        short: `Price up ${p.price_change_7d_pct}% in 7 days — momentum building.`,
        long:  `The median price moved from $${p.price_median_7d_ago} to $${p.price_median_now} (+${p.price_change_7d_pct}%) over the past 7 days. Velocity is currently ${p.velocity_now}/30 with ${p.listing_count_now} active listings. Sustained price moves of this magnitude tend to reflect genuine demand rather than noise, though confirmation over the next week will help distinguish a durable breakout from a brief spike.`,
      };
    case 'false_top':
      return {
        short: `Price up ${p.price_change_14d_pct}% in 14 days but momentum is fading.`,
        long:  `The median price has risen ${p.price_change_14d_pct}% over 14 days (now $${p.price_median_now}), but velocity has dropped from a 14-day average of ${p.velocity_14d_avg} to ${p.velocity_now}/30. Price gains without continued velocity support may be fragile. This pattern — a price run accompanied by fading momentum — tends to precede consolidation or reversal.`,
      };
    case 'quiet_accumulation':
      return {
        short: `Velocity at ${p.velocity_now}/30 with price flat — demand building quietly.`,
        long:  `Velocity is running at ${p.velocity_now}/30 while the median price has moved only ${p.price_change_14d_pct}% over 14 days (currently $${p.price_median_now}). Listings changed ${p.listing_count_change_7d_pct}% over the past 7 days with ${p.listing_count_now} currently active. High velocity alongside stable price and flat supply can indicate accumulation before a price move — though the timeline is uncertain.`,
      };
    case 'catalyst_spike':
      return {
        short: `Price down ${Math.abs(Number(p.price_change_7d_pct))}% in 7 days — market cooling.`,
        long:  `The median price dropped from $${p.price_median_7d_ago} to $${p.price_median_now} (${p.price_change_7d_pct}%) over the past 7 days. Velocity is currently ${p.velocity_now}/30 with ${p.listing_count_now} active listings. Price declines of this magnitude may reflect genuine softening in demand. Watch for whether listings continue to build or whether prices stabilise at this level.`,
      };
    case 'stagnation_risk':
      return {
        short: `Price flat for ${p.days_flat} days while listings slowly accumulate.`,
        long:  `Price has drifted only ${p.price_drift_pct}% over the tracked period, while listings have grown ${p.listing_count_change_30d_pct}% over 30 days. Velocity is running at ${p.velocity_now}/30. Prolonged price stagnation alongside rising supply tends to resolve lower rather than higher. This may be worth monitoring for a buying opportunity at a lower entry point.`,
      };
    case 'low_data':
      return {
        short: 'Not enough history yet to generate a reliable signal.',
        long:  'This item has been tracked for fewer than 14 days or has limited listing data. Directional signals require at least two weeks of pricing and activity history before the detection engine can make a reliable assessment. Check back soon.',
      };
    default: // steady_state
      return {
        short: `Price stable (${p.price_change_14d_pct > 0 ? '+' : ''}${p.price_change_14d_pct}% over 14 days) — no significant move detected.`,
        long:  `No significant directional signal has fired for this item. Price has moved ${p.price_change_14d_pct}% over 14 days and listings have changed ${p.listing_count_change_7d_pct}% over 7 days. Velocity is currently ${p.velocity_now}/30. The market appears to be in a stable holding pattern.`,
      };
  }
}

// ── Claude Haiku narration ────────────────────────────────────────────────────

async function generateNarration(
  type: InsightType,
  payload: Record<string, unknown>,
  skuName: string,
  category: string,
  priceMedian: number,
): Promise<{ short: string; long: string; inputTokens: number; outputTokens: number }> {
  const typeDescriptions: Record<InsightType, string> = {
    supply_shock:       'listings spiked ≥15% week-over-week while price held flat (bearish supply signal)',
    confirmed_breakout: 'price surged ≥8% in 7 days — sustained upward momentum (bullish breakout)',
    false_top:          'price up ≥10% in 14 days but velocity is now fading below its own average (reversal warning)',
    quiet_accumulation: 'high velocity (≥15) with stable price and flat supply — demand absorbing inventory (bullish setup)',
    catalyst_spike:     'price dropped ≥8% in 7 days — market cooling (bearish signal)',
    stagnation_risk:    'price flat ≥45 days with rising supply and low velocity (bearish drift risk)',
    low_data:           'insufficient price or listing history to make a confident assessment',
    steady_state:       'no significant price or listing movement detected (holding pattern)',
  };

  const prompt = `You are Trendnable's market analyst voice — editorial, calm, specific, never hype-y.
You write for collectors who want signal, not noise.
Never use exclamation marks. Never use the words "amazing," "incredible," "huge."
Always cite specific numbers from the detection payload.
Avoid future predictions stated as certainty — use hedged language like "may," "could," "tends to suggest."
Match the editorial tone of a financial newsletter, not a hype account.

SKU: ${skuName} (${category})
Current median price: $${priceMedian}
Signal type: ${type} — ${typeDescriptions[type]}
Detection payload: ${JSON.stringify(payload)}

Write two outputs as JSON:
1. "short" (max 140 chars, one sentence): For a list card. Lead with the key numeric change.
2. "long" (3-5 sentences): For the item detail page. Explain what is happening, what it tends to mean, and what to watch for. Do NOT give direct buy/sell advice.

Return ONLY valid JSON: {"short":"...","long":"..."}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude ${res.status}`);

    const data = await res.json();
    const inputTokens  = data.usage?.input_tokens  ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const text: string = data.content?.[0]?.text ?? '';

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    const parsed = JSON.parse(match[0]);
    return {
      short:        parsed.short ?? '',
      long:         parsed.long  ?? '',
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    console.error('Claude narration failed:', err);
    const fb = fallbackNarration(type, payload);
    return { short: fb.short, long: fb.long, inputTokens: 0, outputTokens: 0 };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── 1. Fetch all active SKUs + hot_index ──────────────────────────────────
    const { data: skuRows, error: skuErr } = await supabase
      .from('skus')
      .select('id, name, series, category_id, fandom_id')
      .eq('is_active', true);

    if (skuErr) throw skuErr;
    const allSkus = (skuRows ?? []) as { id: string; name: string; series: string; category_id: string; fandom_id: string | null }[];
    const skuIds  = allSkus.map((s) => s.id);

    if (skuIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, skus_evaluated: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Bulk fetch hot_index ───────────────────────────────────────────────
    const { data: hotRows } = await supabase
      .from('hot_index')
      .select('sku_id, velocity_score, volume_score, confirmation_score, freshness_score')
      .in('sku_id', skuIds);

    const hotMap = new Map<string, HotIndex>();
    for (const r of (hotRows ?? []) as (HotIndex & { sku_id: string })[]) {
      hotMap.set(r.sku_id, {
        velocity_score:     r.velocity_score ?? 0,
        volume_score:       r.volume_score   ?? 0,
        confirmation_score: r.confirmation_score ?? 0,
        freshness_score:    r.freshness_score ?? 0,
      });
    }

    // ── 3. Bulk fetch last 90 days of daily_snapshots ─────────────────────────
    // 90 days needed so Rule 6 (stagnation_risk, requires 60d) can evaluate correctly.
    const since90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const { data: snapRows } = await supabase
      .from('daily_snapshots')
      .select('sku_id, snapshot_date, listing_count, price_median, hot_score')
      .in('sku_id', skuIds)
      .gte('snapshot_date', since90)
      .order('snapshot_date', { ascending: true });

    const snapMap = new Map<string, Snapshot[]>();
    for (const r of (snapRows ?? []) as (Snapshot & { sku_id: string })[]) {
      const arr = snapMap.get(r.sku_id) ?? [];
      arr.push({ snapshot_date: r.snapshot_date, listing_count: r.listing_count, price_median: r.price_median, hot_score: r.hot_score });
      snapMap.set(r.sku_id, arr);
    }

    // ── 4. Bulk fetch last 4 weeks of weekly_signals ──────────────────────────
    const since28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];
    const { data: sigRows } = await supabase
      .from('weekly_signals')
      .select('sku_id, week_start, reddit_mentions, watch_count, ebay_watchers')
      .in('sku_id', skuIds)
      .gte('week_start', since28)
      .order('week_start', { ascending: true });

    const sigMap = new Map<string, WeeklySignal[]>();
    for (const r of (sigRows ?? []) as (WeeklySignal & { sku_id: string })[]) {
      const arr = sigMap.get(r.sku_id) ?? [];
      arr.push({ week_start: r.week_start, reddit_mentions: r.reddit_mentions ?? 0, watch_count: r.watch_count ?? 0, ebay_watchers: r.ebay_watchers ?? 0 });
      sigMap.set(r.sku_id, arr);
    }

    // ── 5. Fetch current insights (for cooldown check) ────────────────────────
    const { data: curInsightRows } = await supabase
      .from('sku_insights')
      .select('sku_id, insight_type, fired_at')
      .in('sku_id', skuIds)
      .eq('is_current', true);

    const curInsightMap = new Map<string, { insight_type: string; fired_at: string }>();
    for (const r of (curInsightRows ?? []) as { sku_id: string; insight_type: string; fired_at: string }[]) {
      curInsightMap.set(r.sku_id, { insight_type: r.insight_type, fired_at: r.fired_at });
    }

    // ── 6. Detect all SKUs ────────────────────────────────────────────────────
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    interface PendingInsight {
      skuData: SkuData;
      result:  DetectionResult;
      needsLLM: boolean;
    }

    const pending: PendingInsight[] = [];
    let insightsSkipped = 0;

    for (const sku of allSkus) {
      const skuData: SkuData = {
        id:          sku.id,
        name:        sku.name,
        series:      sku.series,
        category_id: sku.category_id,
        fandom_id:   sku.fandom_id,
        hot:         hotMap.get(sku.id) ?? { velocity_score: 0, volume_score: 0, confirmation_score: 0, freshness_score: 0 },
        snapshots:   snapMap.get(sku.id) ?? [],
        signals:     sigMap.get(sku.id)  ?? [],
        currentInsight: curInsightMap.get(sku.id) ?? null,
      };

      const result = detectInsight(skuData);

      if (shouldSkip(skuData.currentInsight, result.type)) {
        insightsSkipped++;
        continue;
      }

      pending.push({
        skuData,
        result,
        needsLLM: !SKIP_LLM_TYPES.has(result.type),
      });
    }

    // ── 7. Generate narration (parallel, capped) ──────────────────────────────
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let costExceeded      = false;
    let llmCount          = 0;

    // Build narration map: sku_id → { short, long }
    const narrationMap = new Map<string, { short: string; long: string }>();

    // Pre-fill fallback narration for all pending
    for (const p of pending) {
      const fb = fallbackNarration(p.result.type, p.result.payload);
      narrationMap.set(p.skuData.id, fb);
    }

    // LLM narration for non-trivial insight types, capped at NARRATION_CAP
    const llmItems = pending.filter((p) => p.needsLLM).slice(0, NARRATION_CAP);

    for (let i = 0; i < llmItems.length; i += NARRATION_PARALLEL) {
      if (costExceeded) break;
      const batch = llmItems.slice(i, i + NARRATION_PARALLEL);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const sortedSnaps = [...p.skuData.snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
          const latestPrice = sortedSnaps[0]?.price_median ?? 0;
          return {
            id: p.skuData.id,
            narration: await generateNarration(p.result.type, p.result.payload, p.skuData.name, p.skuData.category_id, latestPrice),
          };
        })
      );

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { id, narration } = r.value;
        narrationMap.set(id, { short: narration.short, long: narration.long });
        totalInputTokens  += narration.inputTokens;
        totalOutputTokens += narration.outputTokens;
        llmCount++;
      }

      const totalCost = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);
      if (totalCost > COST_CAP_USD) {
        costExceeded = true;
        console.warn('Cost cap reached — halting narration');
      }
    }

    // ── 8. Write insights to DB ───────────────────────────────────────────────
    let insightsWritten = 0;

    for (const p of pending) {
      const { short, long } = narrationMap.get(p.skuData.id) ?? { short: '', long: '' };

      // Mark previous as not current
      if (p.skuData.currentInsight) {
        await supabase
          .from('sku_insights')
          .update({ is_current: false })
          .eq('sku_id', p.skuData.id)
          .eq('is_current', true);
      }

      const { error: insertErr } = await supabase.from('sku_insights').insert({
        sku_id:            p.skuData.id,
        insight_type:      p.result.type,
        direction:         p.result.direction,
        confidence:        p.result.confidence,
        detection_payload: p.result.payload,
        narration_short:   short,
        narration_long:    long,
        fired_at:          now,
        expires_at:        expiresAt,
        is_current:        true,
      });

      if (!insertErr) insightsWritten++;
      else console.error('Insert insight error for', p.skuData.id, ':', insertErr.message);
    }

    // ── 7. Expire stale insights (is_current rows past expires_at) ────────────
    await supabase
      .from('sku_insights')
      .update({ is_current: false })
      .eq('is_current', true)
      .lt('expires_at', now);

    // ── 9. Log to pipeline_runs ───────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const costUsd    = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);

    await supabase.from('pipeline_runs').insert({
      pipeline:      'detect-insights',
      duration_ms:   durationMs,
      input_tokens:  totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd:      costUsd,
      meta: {
        skus_evaluated:   allSkus.length,
        insights_written: insightsWritten,
        insights_skipped: insightsSkipped,
        llm_narrations:   llmCount,
        cost_exceeded:    costExceeded,
      },
    });

    return new Response(JSON.stringify({
      ok:               true,
      skus_evaluated:   allSkus.length,
      insights_written: insightsWritten,
      insights_skipped: insightsSkipped,
      llm_narrations:   llmCount,
      cost_usd:         Number(costUsd.toFixed(6)),
      duration_ms:      durationMs,
      cost_exceeded:    costExceeded,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('detect-insights error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
