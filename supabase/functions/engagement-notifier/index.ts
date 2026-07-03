// engagement-notifier — runs daily (recommended 6 PM UTC via pg_cron, after
// hot-pipeline + detect-insights) to send personalized engagement pushes:
//
//   1. Watchlist Movers  — your watched SKU's price moved significantly
//   2. Insight Flips     — your watched/owned/followed SKU's AI direction changed
//
// Personalization: a SKU is "in user's interest profile" if it's in their
// watchlist/collection OR matches their followed_categories/followed_fandoms.
//
// Free vs Premium gating:
//   - Free users: top 1 mover/day (>=15%) + 1 insight flip/day for watched only.
//                 Daily cap: 1 push total.
//   - Premium:    all movers (>=10%) + insight flips on any interest match.
//                 Daily cap: 5 pushes total.
//
// Dedup: same (user, sku, type, variant) within last 24h is skipped.


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendApnsNotification } from '../_shared/apns.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const FREE_MOVER_THRESHOLD_PCT    = 15;
const PREMIUM_MOVER_THRESHOLD_PCT = 10;
const FREE_DAILY_CAP    = 1;
const PREMIUM_DAILY_CAP = 5;
const DEDUP_WINDOW_HOURS = 24;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserRow {
  id: string;
  push_token: string | null;
  is_premium: boolean;
  notify_movers: boolean;
  notify_insights: boolean;
  followed_categories: string[] | null;
  followed_fandoms:    string[] | null;
}

interface SkuRow {
  id:           string;
  name:         string;
  short:        string | null;
  category_id:  string;
  fandom_id:    string | null;
  fandom_ids:   string[] | null;
  is_active:    boolean;
}

interface SnapshotRow {
  sku_id:        string;
  snapshot_date: string;
  price_median:  number;
}

interface InsightRow {
  id:            string;
  sku_id:        string;
  direction:     string;   // rising | holding | cooling | falling
  insight_type:  string;
  narration_short: string | null;
  created_at:    string;
}

interface Candidate {
  userId:  string;
  skuId:   string;
  type:    'mover' | 'insight_flip';
  variant: string;          // direction for flips, sign for movers
  title:   string;
  body:    string;
  priority: number;          // higher = more important when picking under cap
  metadata: Record<string, unknown>;
}

const DIRECTION_EMOJI: Record<string, string> = {
  rising:  '🟢',
  holding: '🟡',
  cooling: '🟠',
  falling: '🔴',
};

const DIRECTION_LABEL: Record<string, string> = {
  rising:  'rising',
  holding: 'holding',
  cooling: 'cooling',
  falling: 'falling',
};

function skuDisplayName(s: { short?: string | null; name: string }): string {
  return s.short && s.short.trim() ? s.short : s.name;
}

function inInterestProfile(
  sku: SkuRow,
  watched: Set<string>,
  owned: Set<string>,
  followedCats: Set<string>,
  followedFandoms: Set<string>,
): boolean {
  if (watched.has(sku.id) || owned.has(sku.id)) return true;
  if (followedCats.has(sku.category_id)) return true;
  if (sku.fandom_id && followedFandoms.has(sku.fandom_id)) return true;
  if (sku.fandom_ids?.some((f) => followedFandoms.has(f))) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Load notification-eligible users ──────────────────────────────────────
    const { data: usersRaw, error: usersErr } = await supabase
      .from('users')
      .select('id, push_token, is_premium, notify_movers, notify_insights, followed_categories, followed_fandoms')
      .not('push_token', 'is', null);
    if (usersErr) throw usersErr;
    const users = (usersRaw ?? []) as UserRow[];
    if (!users.length) {
      return ok({ checked: 0, sent: 0, note: 'no users with push token' });
    }

    const userIds = users.map((u) => u.id);

    // ── Load user collections + watchlists in two queries ─────────────────────
    const [colRes, watchRes] = await Promise.all([
      supabase.from('user_collections').select('user_id, sku_id').in('user_id', userIds).not('sku_id', 'is', null),
      supabase.from('user_watchlists').select('user_id, sku_id').in('user_id', userIds).not('sku_id', 'is', null),
    ]);

    const watchedByUser: Record<string, Set<string>> = {};
    const ownedByUser:   Record<string, Set<string>> = {};
    for (const id of userIds) {
      watchedByUser[id] = new Set();
      ownedByUser[id]   = new Set();
    }
    for (const r of (watchRes.data ?? []) as { user_id: string; sku_id: string }[]) {
      watchedByUser[r.user_id]?.add(r.sku_id);
    }
    for (const r of (colRes.data ?? []) as { user_id: string; sku_id: string }[]) {
      ownedByUser[r.user_id]?.add(r.sku_id);
    }

    // ── MOVERS: compute 24h price change from daily_snapshots ─────────────────
    // We need today's and yesterday's snapshot for each SKU. Pull last 2 days
    // for any SKU that appears in any user's watchlist.
    const allWatchedSkuIds = new Set<string>();
    for (const u of users) {
      if (!u.notify_movers) continue;
      for (const s of watchedByUser[u.id] ?? []) allWatchedSkuIds.add(s);
    }

    const moverDeltas: Record<string, { pct: number; price: number }> = {};
    if (allWatchedSkuIds.size > 0) {
      // Pull the two most recent snapshots per SKU. We over-fetch a 4-day window
      // to be resilient to weekend pipeline gaps.
      const since = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0];
      const { data: snaps } = await supabase
        .from('daily_snapshots')
        .select('sku_id, snapshot_date, price_median')
        .in('sku_id', [...allWatchedSkuIds])
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: false });

      // Bucket by sku_id: first row = latest, second = prior
      const bySku: Record<string, SnapshotRow[]> = {};
      for (const row of (snaps ?? []) as SnapshotRow[]) {
        if (!bySku[row.sku_id]) bySku[row.sku_id] = [];
        if (bySku[row.sku_id].length < 2) bySku[row.sku_id].push(row);
      }
      for (const [skuId, rows] of Object.entries(bySku)) {
        if (rows.length < 2) continue;
        const latest = Number(rows[0].price_median);
        const prior  = Number(rows[1].price_median);
        if (!isFinite(latest) || !isFinite(prior) || prior <= 0) continue;
        const pct = ((latest - prior) / prior) * 100;
        moverDeltas[skuId] = { pct, price: latest };
      }
    }

    // ── Build a price map from the mover snapshots (already fetched) ──────────
    const priceBySkuId: Record<string, number> = {};
    for (const [id, d] of Object.entries(moverDeltas)) priceBySkuId[id] = d.price;

    // ── FLIPS: load all currently active insights from last 24h ───────────────
    // We dedupe via notification_history so we won't repeat-fire on the same
    // direction within DEDUP_WINDOW_HOURS.
    const insightCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: insightRaw } = await supabase
      .from('sku_insights')
      .select('id, sku_id, direction, insight_type, narration_short, created_at')
      .eq('is_current', true)
      .gte('created_at', insightCutoff);
    const insights = (insightRaw ?? []) as InsightRow[];

    // ── Fetch prices for low_data / steady_state insights not yet in priceMap ─
    // We need a real price to show context ("Holding at $147") instead of
    // the generic "no signal" copy that adds no value.
    const needPrice = [...new Set(
      insights
        .filter((i) => (i.insight_type === 'low_data' || i.insight_type === 'steady_state') && !(i.sku_id in priceBySkuId))
        .map((i) => i.sku_id)
    )];
    if (needPrice.length > 0) {
      const since4d = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0];
      const { data: extraSnaps } = await supabase
        .from('daily_snapshots')
        .select('sku_id, price_median')
        .in('sku_id', needPrice)
        .gte('snapshot_date', since4d)
        .order('snapshot_date', { ascending: false });
      const seen = new Set<string>();
      for (const row of (extraSnaps ?? []) as SnapshotRow[]) {
        if (!seen.has(row.sku_id) && Number(row.price_median) > 0) {
          priceBySkuId[row.sku_id] = Number(row.price_median);
          seen.add(row.sku_id);
        }
      }
    }

    // ── Load SKU metadata for any SKU we might notify about ──────────────────
    const candidateSkuIds = new Set<string>([
      ...Object.keys(moverDeltas),
      ...insights.map((i) => i.sku_id),
    ]);
    let skuMap: Record<string, SkuRow> = {};
    if (candidateSkuIds.size > 0) {
      const { data: skusRaw } = await supabase
        .from('skus')
        .select('id, name, short, category_id, fandom_id, fandom_ids, is_active')
        .in('id', [...candidateSkuIds])
        .eq('is_active', true);
      for (const s of (skusRaw ?? []) as SkuRow[]) skuMap[s.id] = s;
    }

    // ── Load notification_history for dedup + cap ─────────────────────────────
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString();
    const todayUtcStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').toISOString();
    const { data: histRaw } = await supabase
      .from('notification_history')
      .select('user_id, sku_id, type, variant, sent_at')
      .in('user_id', userIds)
      .gte('sent_at', dedupCutoff);
    const history = (histRaw ?? []) as Array<{ user_id: string; sku_id: string | null; type: string; variant: string | null; sent_at: string }>;

    const sentTodayCount: Record<string, number> = {};
    const dedupKeys = new Set<string>();
    for (const h of history) {
      if (h.sent_at >= todayUtcStart) {
        sentTodayCount[h.user_id] = (sentTodayCount[h.user_id] ?? 0) + 1;
      }
      // Dedup key: same user+sku+type+variant within 24h
      dedupKeys.add(`${h.user_id}|${h.sku_id ?? ''}|${h.type}|${h.variant ?? ''}`);
    }

    // ── Build candidate notifications per user ───────────────────────────────
    const allSent: Array<{
      user_id: string; sku_id: string; type: string; variant: string;
      title: string; body: string; metadata: Record<string, unknown>;
      pushToken: string;
    }> = [];

    for (const user of users) {
      const followedCats    = new Set(user.followed_categories ?? []);
      const followedFandoms = new Set(user.followed_fandoms ?? []);
      const watched = watchedByUser[user.id] ?? new Set();
      const owned   = ownedByUser[user.id]   ?? new Set();

      const dailyCap = user.is_premium ? PREMIUM_DAILY_CAP : FREE_DAILY_CAP;
      let remaining  = dailyCap - (sentTodayCount[user.id] ?? 0);
      if (remaining <= 0) continue;

      const moverThreshold = user.is_premium ? PREMIUM_MOVER_THRESHOLD_PCT : FREE_MOVER_THRESHOLD_PCT;

      const candidates: Candidate[] = [];

      // ── Movers (watched SKUs only) ────────────────────────────────────────
      if (user.notify_movers) {
        for (const skuId of watched) {
          const delta = moverDeltas[skuId];
          const sku = skuMap[skuId];
          if (!delta || !sku) continue;
          if (Math.abs(delta.pct) < moverThreshold) continue;

          const variant = delta.pct > 0 ? 'up' : 'down';
          const key = `${user.id}|${skuId}|mover|${variant}`;
          if (dedupKeys.has(key)) continue;

          const name = skuDisplayName(sku);
          const sign = delta.pct > 0 ? '+' : '−';
          const arrow = delta.pct > 0 ? '📈' : '📉';
          candidates.push({
            userId: user.id, skuId, type: 'mover', variant,
            title: `${arrow} ${name}`,
            body:  `${sign}${Math.abs(delta.pct).toFixed(0)}% in 24h — now $${Math.round(delta.price)}`,
            priority: Math.abs(delta.pct),
            metadata: { pct: delta.pct, price: delta.price },
          });
        }
      }

      // ── Insight flips (interest profile match) ────────────────────────────
      if (user.notify_insights) {
        for (const ins of insights) {
          const sku = skuMap[ins.sku_id];
          if (!sku) continue;

          // Free users: only watched/owned (strongest signal).
          // Premium: full interest profile (cat/fandom too).
          let matches: boolean;
          if (user.is_premium) {
            matches = inInterestProfile(sku, watched, owned, followedCats, followedFandoms);
          } else {
            matches = watched.has(sku.id) || owned.has(sku.id);
          }
          if (!matches) continue;

          const key = `${user.id}|${sku.id}|insight_flip|${ins.direction}`;
          if (dedupKeys.has(key)) continue;

          const name = skuDisplayName(sku);
          const emoji = DIRECTION_EMOJI[ins.direction] ?? '⚪';
          const label = DIRECTION_LABEL[ins.direction] ?? ins.direction;
          const currentPrice = priceBySkuId[ins.sku_id];
          const priceStr = currentPrice ? `$${Math.round(currentPrice)}` : null;
          const body = ins.insight_type === 'low_data'
            ? (priceStr ? `Tracking at ${priceStr} — building signal history` : 'Still building price history — check back soon.')
            : ins.insight_type === 'steady_state'
            ? (priceStr ? `Holding at ${priceStr} — no breakout yet` : 'Market holding steady — watching for a move.')
            : (ins.narration_short ?? `Signal just turned ${label}.`);

          // Prioritize owned > watched > followed match
          const priority = owned.has(sku.id) ? 30 : watched.has(sku.id) ? 20 : 10;

          candidates.push({
            userId: user.id, skuId: sku.id, type: 'insight_flip', variant: ins.direction,
            title: `${emoji} ${name} now ${label}`,
            body,
            priority,
            metadata: { direction: ins.direction, insight_type: ins.insight_type, insight_id: ins.id },
          });
        }
      }

      if (candidates.length === 0) continue;

      // Pick the highest-priority N where N is remaining cap.
      // Tie-break: movers above flips (sharper signal), then bigger pct/priority.
      candidates.sort((a, b) => b.priority - a.priority);
      const picks = candidates.slice(0, remaining);

      for (const c of picks) {
        if (!user.push_token) continue;
        allSent.push({
          user_id: user.id,
          sku_id:  c.skuId,
          type:    c.type,
          variant: c.variant,
          title:   c.title,
          body:    c.body,
          metadata: c.metadata,
          pushToken: user.push_token,
        });
      }
    }

    if (allSent.length === 0) {
      return ok({ checked: users.length, sent: 0 });
    }

    // ── Write in_app_notifications (always — also feeds the bell icon) ───────
    const inAppRows = allSent.map((p) => ({
      user_id:  p.user_id,
      type:     p.type,
      sku_id:   p.sku_id,
      title:    p.title,
      body:     p.body,
      metadata: p.metadata,
      is_read:  false,
    }));
    await supabase.from('in_app_notifications').insert(inAppRows);

    // ── Write notification_history (for future dedup + analytics) ────────────
    const histRows = allSent.map((p) => ({
      user_id: p.user_id,
      sku_id:  p.sku_id,
      type:    p.type,
      variant: p.variant,
      metadata: p.metadata,
    }));
    await supabase.from('notification_history').insert(histRows);

    // ── Send APNs pushes in parallel ─────────────────────────────────────────
    const pushResults = await Promise.allSettled(
      allSent.map((p) =>
        sendApnsNotification(p.pushToken, {
          title: p.title,
          body:  p.body,
          data:  { skuId: p.sku_id, type: p.type },
        }),
      ),
    );
    const pushSent = pushResults.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return ok({
      checked: users.length,
      sent:    allSent.length,
      pushSent,
      movers:  allSent.filter((p) => p.type === 'mover').length,
      flips:   allSent.filter((p) => p.type === 'insight_flip').length,
    });
  } catch (err) {
    console.error('[engagement-notifier]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});

function ok(body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ ok: true, ...body }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
}
