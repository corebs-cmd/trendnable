// collection-pulse
// Computes and reads the daily Collection Pulse per user.
//
// GET  — authenticated client read. On-demand compute if no row or stale (> today).
//         Premium users receive full payload (flagged list + demand breakdown).
//         Free users receive only heat_score, verdict, delta_24h, summary, standout, flagged_count.
// POST — batch cron compute for all eligible users (sku_count > 10).
//         Called by pg_cron at 19:30 UTC via service role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;
const COST_CAP_USD      = 5.0;
const BATCH_PARALLEL    = 5;
const MIN_SKU_COUNT     = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

type Verdict = 'hot' | 'warming' | 'cooling';

interface FlaggedItem {
  sku_id:       string;
  name:         string;
  image_url:    string | null;
  reason:       'near_peak' | 'declining';
  urgency:      number;
  price_median: number;
  peak_90d:     number | null;
  avg_30d:      number | null;
  down_days:    number;
}

interface DemandItem {
  sku_id:    string;
  name:      string;
  image_url: string | null;
  hot_score: number;
}

interface ScoringFacts {
  heat_score:      number;
  verdict:         Verdict;
  delta_24h:       number;
  total_value:     number;
  sku_count:       number;
  standout:        { sku_id: string; name: string; image_url: string | null; hot_score: number; delta_24h: number } | null;
  flagged:         FlaggedItem[];
  flagged_count:   number;
  flagged_preview: { sku_id: string; name: string; image_url: string | null }[];
  hottest:         DemandItem[];
  coolest:         DemandItem[];
  top_driver:      { label: string; share_pct: number } | null;
}

interface NarrationFacts {
  verdict:       Verdict;
  heat_score:    number;
  delta_24h:     number;
  standout:      { name: string; delta_24h: number } | null;
  top_driver:    { label: string; share_pct: number } | null;
  flagged_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round(n: number, dp = 1): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── §5.3 Fallback template ────────────────────────────────────────────────────

function templateSummary(f: NarrationFacts): string {
  if (f.top_driver && f.standout && f.standout.delta_24h > 0) {
    const delta = Math.round(Math.abs(f.standout.delta_24h));
    return `**${f.top_driver.label}** is carrying your momentum, with **${f.standout.name}** surging +${delta} today.`;
  }
  if (f.top_driver) {
    return `**${f.top_driver.label}** is carrying your momentum.`;
  }
  if (f.standout) {
    return `**${f.standout.name}** is your standout piece.`;
  }
  const dir = f.verdict === 'hot' ? 'running hot' : f.verdict === 'warming' ? 'warming up' : 'cooling off';
  return `Your collection is ${dir} right now.`;
}

// ── §5.2 Haiku narration ──────────────────────────────────────────────────────

async function generateSummary(
  f: NarrationFacts,
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  if (!ANTHROPIC_API_KEY) {
    return { summary: templateSummary(f), inputTokens: 0, outputTokens: 0 };
  }

  const standoutDelta = f.standout
    ? `${f.standout.delta_24h >= 0 ? '+' : ''}${Math.round(f.standout.delta_24h)}`
    : '';
  const standoutStr = f.standout
    ? `${f.standout.name}, delta ${standoutDelta}`
    : 'none';
  const driverStr = f.top_driver
    ? `${f.top_driver.label} (${f.top_driver.share_pct}% of positive momentum)`
    : 'none';

  const prompt = `You are Trendnable's collection analyst. Write exactly 1–2 short sentences (25 words max) about what is driving a collector's portfolio right now.

Rules — follow strictly:
- Lead with the momentum driver or standout — do NOT open with "Your collection"
- Do NOT state the numeric heat score — it is shown in the gauge directly above this text
- Do NOT name the verdict (hot/warming/cooling) — it is shown in the gauge directly above this text
- NEVER use "may", "will", "could", "potential", "suggests", "limited", "stabilized", "This portfolio"
- State only what the data shows right now — zero forecasts
- If a momentum driver exists, write "[Name] is carrying your momentum" — skip raw percentages
- If a standout has a positive delta, append ", with [Name] surging +[integer] today" — integers only, no decimals
- Bold key driver and item names
- 25 words max

Return ONLY valid JSON: {"summary":"..."}

Target shape: "**Star Wars** is carrying your momentum, with **Boba Fett SDCC 2013** surging +22 today."

Facts:
- top_driver: ${driverStr}
- standout: ${standoutStr}
- sell_candidates: ${f.flagged_count}`;

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
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    const parsed = JSON.parse(match[0]);
    return {
      summary:       parsed.summary ?? templateSummary(f),
      inputTokens:   data.usage?.input_tokens  ?? 0,
      outputTokens:  data.usage?.output_tokens ?? 0,
    };
  } catch (err) {
    console.error('Haiku narration failed:', err);
    return { summary: templateSummary(f), inputTokens: 0, outputTokens: 0 };
  }
}

// ── §4 Scoring ────────────────────────────────────────────────────────────────

async function computeForUser(
  svc: ReturnType<typeof createClient>,
  userId: string,
): Promise<ScoringFacts | null> {
  // 1. Collection rows
  const { data: collRows, error: collErr } = await svc
    .from('user_collections')
    .select('sku_id, qty')
    .eq('user_id', userId)
    .not('sku_id', 'is', null);

  if (collErr || !collRows || collRows.length === 0) return null;

  type CollRow = { sku_id: string; qty: number };
  const rows   = collRows as CollRow[];
  const skuIds = rows.map((r) => r.sku_id);
  const qtyMap = new Map(rows.map((r) => [r.sku_id, r.qty ?? 1]));

  // 2. Parallel bulk fetch
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

  const [hotRes, skuRes, snapRes, fandomRes, catRes] = await Promise.all([
    svc.from('hot_index')
      .select('sku_id, hot_score, delta_24h, momentum')
      .in('sku_id', skuIds),
    svc.from('skus')
      .select('id, name, image_url, fandom_id, category_id')
      .in('id', skuIds),
    svc.from('daily_snapshots')
      .select('sku_id, snapshot_date, price_median, price_high')
      .in('sku_id', skuIds)
      .gte('snapshot_date', since90)
      .order('snapshot_date', { ascending: true }),
    svc.from('fandoms').select('id, label'),
    svc.from('categories').select('id, label'),
  ]);

  // 3. Build maps
  const hotMap = new Map<string, { hot_score: number; delta_24h: number; momentum: string }>();
  for (const r of ((hotRes.data ?? []) as any[])) {
    hotMap.set(r.sku_id, {
      hot_score: Number(r.hot_score ?? 0),
      delta_24h: Number(r.delta_24h ?? 0),
      momentum:  r.momentum ?? 'flat',
    });
  }

  const skuMap = new Map<string, { name: string; image_url: string | null; fandom_id: string | null; category_id: string }>();
  for (const r of ((skuRes.data ?? []) as any[])) {
    skuMap.set(r.id, { name: r.name, image_url: r.image_url ?? null, fandom_id: r.fandom_id ?? null, category_id: r.category_id });
  }

  const fandomLabel = new Map<string, string>();
  for (const r of ((fandomRes.data ?? []) as any[])) fandomLabel.set(r.id, r.label);
  const catLabel = new Map<string, string>();
  for (const r of ((catRes.data ?? []) as any[])) catLabel.set(r.id, r.label);

  // 4. Derived per-sku values from snapshots
  type Snap = { snapshot_date: string; price_median: number; price_high: number };
  const snapsBySkuId = new Map<string, Snap[]>();
  for (const r of ((snapRes.data ?? []) as any[])) {
    const arr = snapsBySkuId.get(r.sku_id) ?? [];
    arr.push({ snapshot_date: r.snapshot_date, price_median: Number(r.price_median ?? 0), price_high: Number(r.price_high ?? 0) });
    snapsBySkuId.set(r.sku_id, arr);
  }

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  const latestPrice = new Map<string, number>();
  const peak90d     = new Map<string, number>();
  const avg30d      = new Map<string, number>();
  const snapCount   = new Map<string, number>();
  const downDaysMap = new Map<string, number>();

  for (const skuId of skuIds) {
    const snaps = snapsBySkuId.get(skuId) ?? [];
    snapCount.set(skuId, snaps.length);
    if (snaps.length === 0) continue;

    latestPrice.set(skuId, snaps[snaps.length - 1].price_median);
    peak90d.set(skuId, Math.max(...snaps.map((s) => s.price_high)));

    const snaps30 = snaps.filter((s) => s.snapshot_date >= since30);
    if (snaps30.length > 0) {
      const avg = snaps30.reduce((sum, s) => sum + s.price_median, 0) / snaps30.length;
      avg30d.set(skuId, avg);
      const snaps14 = snaps.filter((s) => s.snapshot_date >= since14);
      downDaysMap.set(skuId, snaps14.filter((s) => s.price_median < avg).length);
    }
  }

  // 5. §4a — Value-weighted heat score + delta_24h
  let heatNum = 0, deltaNum = 0, denom = 0, totalValue = 0;
  for (const skuId of skuIds) {
    const hot   = hotMap.get(skuId);
    const price = latestPrice.get(skuId) ?? 0;
    const qty   = qtyMap.get(skuId) ?? 1;
    if (!hot || price <= 0) continue;
    const w   = price * qty;
    heatNum  += hot.hot_score * w;
    deltaNum += hot.delta_24h * w;
    denom    += w;
    totalValue += w;
  }
  const heatScore = denom > 0 ? heatNum / denom : 0;
  const delta24h  = denom > 0 ? deltaNum / denom : 0;
  const verdict: Verdict = heatScore >= 65 ? 'hot' : heatScore >= 40 ? 'warming' : 'cooling';

  // 6. §4b — Standout: highest hot_score with momentum='up' and >= 14 snapshots
  let standout: ScoringFacts['standout'] = null;
  let bestScore = -1;
  for (const skuId of skuIds) {
    const hot = hotMap.get(skuId);
    const sku = skuMap.get(skuId);
    const sc  = snapCount.get(skuId) ?? 0;
    if (!hot || !sku) continue;
    if (hot.momentum === 'up' && sc >= 14 && hot.hot_score > bestScore) {
      bestScore = hot.hot_score;
      standout = { sku_id: skuId, name: sku.name, image_url: sku.image_url, hot_score: hot.hot_score, delta_24h: hot.delta_24h };
    }
  }

  // 7. §4c + §4d — Sell signals
  interface RawFlagged extends FlaggedItem { raw_urgency: number; }
  const nearPeakRaw: RawFlagged[] = [];
  const decliningRaw: RawFlagged[] = [];

  for (const skuId of skuIds) {
    const hot   = hotMap.get(skuId);
    const sku   = skuMap.get(skuId);
    const price = latestPrice.get(skuId) ?? 0;
    const sc    = snapCount.get(skuId) ?? 0;
    if (!hot || !sku || sc < 14 || price <= 0) continue;

    // §4c Near-peak: hot >= 80, price >= 90% of 90d high
    const peak = peak90d.get(skuId) ?? 0;
    if (hot.hot_score >= 80 && peak > 0 && price >= 0.90 * peak) {
      nearPeakRaw.push({
        sku_id: skuId, name: sku.name, image_url: sku.image_url,
        reason: 'near_peak', raw_urgency: price / peak, urgency: 0,
        price_median: price, peak_90d: peak, avg_30d: null, down_days: 0,
      });
    }

    // §4d Declining: momentum='down', price < 30d avg
    const avg = avg30d.get(skuId) ?? 0;
    if (hot.momentum === 'down' && avg > 0 && price < avg) {
      decliningRaw.push({
        sku_id: skuId, name: sku.name, image_url: sku.image_url,
        reason: 'declining', raw_urgency: (avg - price) / avg, urgency: 0,
        price_median: price, peak_90d: null, avg_30d: avg, down_days: downDaysMap.get(skuId) ?? 0,
      });
    }
  }

  // §4e — near_peak wins when sku appears in both; normalize urgency per group; top 5
  const nearPeakIds = new Set(nearPeakRaw.map((i) => i.sku_id));
  const filteredDeclining = decliningRaw.filter((i) => !nearPeakIds.has(i.sku_id));

  function normalizeGroup(items: RawFlagged[]): FlaggedItem[] {
    if (items.length === 0) return [];
    const min = Math.min(...items.map((i) => i.raw_urgency));
    const max = Math.max(...items.map((i) => i.raw_urgency));
    return items.map((item) => ({
      ...item,
      urgency: max === min ? 1.0 : (item.raw_urgency - min) / (max - min),
    }));
  }

  const flagged: FlaggedItem[] = [
    ...normalizeGroup(nearPeakRaw),
    ...normalizeGroup(filteredDeclining),
  ].sort((a, b) => b.urgency - a.urgency).slice(0, 5);

  const flaggedCount = nearPeakIds.size + filteredDeclining.length;

  // 8. Fandom/category top driver — for Haiku narration only (not in display payload)
  const withFandom  = skuIds.filter((id) => skuMap.get(id)?.fandom_id).length;
  const useFandom   = withFandom / skuIds.length >= 0.4;
  const groupContribs = new Map<string, { contrib: number; isFandom: boolean }>();
  let totalPositive = 0;

  for (const skuId of skuIds) {
    const hot   = hotMap.get(skuId);
    const sku   = skuMap.get(skuId);
    const price = latestPrice.get(skuId) ?? 0;
    const qty   = qtyMap.get(skuId) ?? 1;
    if (!hot || !sku || price <= 0) continue;
    const posContrib = Math.max(0, hot.delta_24h) * price * qty;
    if (posContrib <= 0) continue;
    const key      = useFandom ? (sku.fandom_id ?? sku.category_id) : sku.category_id;
    const isFandom = useFandom && !!sku.fandom_id;
    const existing = groupContribs.get(key);
    groupContribs.set(key, { contrib: (existing?.contrib ?? 0) + posContrib, isFandom });
    totalPositive += posContrib;
  }

  const topGroupEntry = [...groupContribs.entries()].sort((a, b) => b[1].contrib - a[1].contrib)[0];
  const topDriver = topGroupEntry ? (() => {
    const [key, { contrib, isFandom }] = topGroupEntry;
    const label    = isFandom ? (fandomLabel.get(key) ?? key) : (catLabel.get(key) ?? key);
    const sharePct = totalPositive > 0 ? round((contrib / totalPositive) * 100, 1) : 0;
    return { label, share_pct: sharePct };
  })() : null;

  // 9. Item-level demand ranking — owned SKUs sorted by hot_score for the breakdown display
  const itemRankings: DemandItem[] = skuIds
    .filter((id) => hotMap.has(id) && skuMap.has(id))
    .map((id) => ({
      sku_id:    id,
      name:      skuMap.get(id)!.name,
      image_url: skuMap.get(id)!.image_url,
      hot_score: hotMap.get(id)!.hot_score,
    }))
    .sort((a, b) => b.hot_score - a.hot_score);

  const hottest = itemRankings.slice(0, 3);
  // Coolest = lowest hot_score first (reverse of sorted array)
  const coolest = [...itemRankings].reverse().slice(0, 3);

  // 10. Flagged preview — sku_id + name + image only; no reason/price prevents free-tier leakage
  const flaggedPreview = flagged.slice(0, 3).map((f) => ({
    sku_id:    f.sku_id,
    name:      f.name,
    image_url: f.image_url,
  }));

  return {
    heat_score:      round(heatScore, 1),
    verdict,
    delta_24h:       round(delta24h, 1),
    total_value:     round(totalValue, 2),
    sku_count:       skuIds.length,
    standout,
    flagged,
    flagged_count:   flaggedCount,
    flagged_preview: flaggedPreview,
    hottest,
    coolest,
    top_driver:      topDriver,
  };
}

// ── Compute + upsert a single user ────────────────────────────────────────────

async function buildAndUpsert(
  svc: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ facts: ScoringFacts; summary: string; inputTokens: number; outputTokens: number } | null> {
  const facts = await computeForUser(svc, userId);
  if (!facts || facts.sku_count <= MIN_SKU_COUNT) return null;

  const nf: NarrationFacts = {
    verdict:       facts.verdict,
    heat_score:    facts.heat_score,
    delta_24h:     facts.delta_24h,
    standout:      facts.standout,
    top_driver:    facts.top_driver,
    flagged_count: facts.flagged_count,
  };
  const { summary, inputTokens, outputTokens } = await generateSummary(nf);

  const { error: upsertErr } = await svc.from('collection_insights').upsert({
    user_id:          userId,
    heat_score:       facts.heat_score,
    verdict:          facts.verdict,
    delta_24h:        facts.delta_24h,
    summary,
    standout:         facts.standout,
    flagged_count:    facts.flagged_count,
    payload:          { pv: 2, flagged: facts.flagged, hottest: facts.hottest, coolest: facts.coolest, flagged_preview: facts.flagged_preview },
    sku_count:        facts.sku_count,
    generated_at:     new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (upsertErr) console.error('collection_insights upsert:', userId, upsertErr.message);

  return { facts, summary, inputTokens, outputTokens };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const method = req.method;

  // ── GET: authenticated client read (with on-demand compute if stale) ────────
  if (method === 'GET') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonResp({ error: 'Unauthorized' }, 401);

    const userJwt    = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResp({ error: 'Unauthorized' }, 401);

    const svc   = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    const { data: row } = await svc
      .from('collection_insights')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Also stale if payload uses the old fandom-based demand schema (migration guard)
    // pv:2 = prompt-version stamp; missing means summary was generated with old gauge-recital prompt
    const isStale = !row ||
      (row.generated_at as string).split('T')[0] < today ||
      !(row.payload as any)?.hottest ||
      (row.payload as any)?.pv !== 2;

    let heat_score       = Number(row?.heat_score ?? 0);
    let verdict          = (row?.verdict ?? 'cooling') as Verdict;
    let delta_24h        = Number(row?.delta_24h ?? 0);
    let summary          = row?.summary ?? null;
    let standout         = row?.standout ?? null;
    let flagged_count    = Number(row?.flagged_count ?? 0);
    let sku_count        = Number(row?.sku_count ?? 0);
    let payload          = row?.payload ?? null;
    let flagged_preview  = (row?.payload as any)?.flagged_preview ?? null;
    let generated_at     = row?.generated_at ?? null;

    if (isStale) {
      const result = await buildAndUpsert(svc, user.id);
      if (!result) {
        const { count } = await svc
          .from('user_collections')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('sku_id', 'is', null);
        return jsonResp({ eligible: false, sku_count: count ?? 0 }, 200);
      }
      heat_score      = result.facts.heat_score;
      verdict         = result.facts.verdict;
      delta_24h       = result.facts.delta_24h;
      summary         = result.summary;
      standout        = result.facts.standout;
      flagged_count   = result.facts.flagged_count;
      sku_count       = result.facts.sku_count;
      flagged_preview = result.facts.flagged_preview;
      payload         = { pv: 2, flagged: result.facts.flagged, hottest: result.facts.hottest, coolest: result.facts.coolest, flagged_preview: result.facts.flagged_preview };
      generated_at    = new Date().toISOString();
    }

    if (sku_count <= MIN_SKU_COUNT) {
      return jsonResp({ eligible: false, sku_count }, 200);
    }

    const { data: dbUser } = await svc
      .from('users')
      .select('is_premium')
      .eq('id', user.id)
      .maybeSingle();
    const isPremium = (dbUser as any)?.is_premium ?? false;

    const resp: Record<string, unknown> = {
      eligible: true, heat_score, verdict, delta_24h,
      summary, standout, flagged_count, sku_count, generated_at,
      flagged_preview,  // always included so free users can see blurred items
    };
    if (isPremium) resp.payload = payload;

    return jsonResp(resp, 200);
  }

  // ── POST: batch cron compute for all eligible users ─────────────────────────
  if (method === 'POST') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonResp({ error: 'Unauthorized' }, 401);
    if (authHeader.slice(7) !== SUPABASE_SERVICE_ROLE_KEY) return jsonResp({ error: 'Unauthorized' }, 401);

    const startTime = Date.now();
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: eligibleRows, error: eligibleErr } = await svc.rpc('get_eligible_pulse_users');
    if (eligibleErr) {
      console.error('get_eligible_pulse_users:', eligibleErr.message);
      return jsonResp({ error: eligibleErr.message }, 500);
    }

    const users = (eligibleRows ?? []) as { user_id: string; sku_count: number }[];
    let processed = 0, failed = 0;
    let totalInput = 0, totalOutput = 0;
    let costExceeded = false;

    for (let i = 0; i < users.length; i += BATCH_PARALLEL) {
      if (costExceeded) break;
      const batch = users.slice(i, i + BATCH_PARALLEL);
      const results = await Promise.allSettled(
        batch.map(({ user_id }) => buildAndUpsert(svc, user_id)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          totalInput  += r.value.inputTokens;
          totalOutput += r.value.outputTokens;
          processed++;
        } else {
          failed++;
        }
      }
      const cost = (totalInput * HAIKU_INPUT_RATE) + (totalOutput * HAIKU_OUTPUT_RATE);
      if (cost > COST_CAP_USD) {
        costExceeded = true;
        console.warn('Cost cap reached — halting batch');
      }
    }

    const durationMs = Date.now() - startTime;
    const costUsd    = (totalInput * HAIKU_INPUT_RATE) + (totalOutput * HAIKU_OUTPUT_RATE);

    await svc.from('pipeline_runs').insert({
      pipeline:      'collection-pulse',
      duration_ms:   durationMs,
      input_tokens:  totalInput,
      output_tokens: totalOutput,
      cost_usd:      costUsd,
      meta:          { users_processed: processed, users_failed: failed, cost_exceeded: costExceeded },
    });

    return jsonResp({
      ok: true,
      users_processed: processed,
      users_failed:    failed,
      cost_usd:        Number(costUsd.toFixed(6)),
      duration_ms:     durationMs,
      cost_exceeded:   costExceeded,
    });
  }

  return new Response('Method not allowed', { status: 405 });
});
