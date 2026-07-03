// price-alert-checker — runs daily after hot-pipeline (recommended 19:00 UTC)
// to push a notification when a user's price alert target is crossed.
//
// Flow:
//   1. Load all active price_alerts
//   2. Get latest daily_snapshot price for each alerted SKU (4-day window for gaps)
//   3. Find alerts where price crossed the threshold
//   4. Mark triggered alerts (is_active=false, triggered_at=now)
//   5. Write in_app_notifications + notification_history + send APNs push


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendApnsNotification } from '../_shared/apns.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Load all active price alerts with SKU name via join ───────────────
    const { data: alertsRaw, error: alertsErr } = await supabase
      .from('price_alerts')
      .select('id, user_id, sku_id, direction, target_price, skus(name, short)')
      .eq('is_active', true);
    if (alertsErr) throw alertsErr;

    const alerts = (alertsRaw ?? []) as Array<{
      id: string; user_id: string; sku_id: string;
      direction: 'above' | 'below'; target_price: number;
      skus: { name: string; short: string | null } | null;
    }>;

    if (!alerts.length) {
      return ok({ checked: 0, triggered: 0, note: 'no active alerts' });
    }

    // ── 2. Get latest snapshot price for each alerted SKU ────────────────────
    // 4-day window so weekend pipeline gaps don't prevent triggers.
    const skuIds = [...new Set(alerts.map((a) => a.sku_id))];
    const since4d = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0];

    const { data: snapsRaw } = await supabase
      .from('daily_snapshots')
      .select('sku_id, price_median')
      .in('sku_id', skuIds)
      .gte('snapshot_date', since4d)
      .order('snapshot_date', { ascending: false });

    const latestPrice: Record<string, number> = {};
    for (const row of (snapsRaw ?? []) as Array<{ sku_id: string; price_median: number }>) {
      if (!(row.sku_id in latestPrice) && Number(row.price_median) > 0) {
        latestPrice[row.sku_id] = Number(row.price_median);
      }
    }

    // ── 3. Find alerts where price crossed the threshold ─────────────────────
    const triggered = alerts.filter((a) => {
      const price = latestPrice[a.sku_id];
      if (!price) return false;
      return a.direction === 'above'
        ? price >= Number(a.target_price)
        : price <= Number(a.target_price);
    });

    if (!triggered.length) {
      return ok({ checked: alerts.length, triggered: 0 });
    }

    // ── 4. Fetch push tokens for affected users ───────────────────────────────
    const userIds = [...new Set(triggered.map((a) => a.user_id))];
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, push_token')
      .in('id', userIds);

    const pushTokenMap: Record<string, string | null> = {};
    for (const u of (usersRaw ?? []) as Array<{ id: string; push_token: string | null }>) {
      pushTokenMap[u.id] = u.push_token ?? null;
    }

    // ── 5. Build notification payloads ────────────────────────────────────────
    type Payload = {
      user_id: string; sku_id: string; alert_id: string;
      title: string; body: string;
      direction: string; target_price: number; price: number;
    };

    const payloads: Payload[] = triggered.map((alert) => {
      const price  = latestPrice[alert.sku_id];
      const target = Number(alert.target_price);
      const name   = alert.skus?.short?.trim() || alert.skus?.name || alert.sku_id;

      const title = `🎯 ${name}`;
      const body  = alert.direction === 'above'
        ? `Hit your $${target.toFixed(0)} target — now at $${Math.round(price)}`
        : `Dropped to $${Math.round(price)} — your $${target.toFixed(0)} target triggered`;

      return { user_id: alert.user_id, sku_id: alert.sku_id, alert_id: alert.id, title, body, direction: alert.direction, target_price: target, price };
    });

    const now = new Date().toISOString();

    // ── 6. Mark alerts triggered (before sending so state is consistent) ──────
    await supabase
      .from('price_alerts')
      .update({ is_active: false, triggered_at: now })
      .in('id', triggered.map((a) => a.id));

    // ── 7. Write in_app_notifications ─────────────────────────────────────────
    await supabase.from('in_app_notifications').insert(
      payloads.map((p) => ({
        user_id:  p.user_id,
        type:     'price_alert',
        sku_id:   p.sku_id,
        title:    p.title,
        body:     p.body,
        metadata: { alert_id: p.alert_id, direction: p.direction, target_price: p.target_price, price: p.price },
        is_read:  false,
      }))
    );

    // ── 8. Write notification_history (dedup + analytics) ─────────────────────
    await supabase.from('notification_history').insert(
      payloads.map((p) => ({
        user_id:  p.user_id,
        sku_id:   p.sku_id,
        type:     'price_alert',
        variant:  p.direction,
        metadata: { alert_id: p.alert_id, direction: p.direction, target_price: p.target_price, price: p.price },
      }))
    );

    // ── 9. Send APNs pushes ───────────────────────────────────────────────────
    const pushResults = await Promise.allSettled(
      payloads
        .filter((p) => !!pushTokenMap[p.user_id])
        .map((p) =>
          sendApnsNotification(pushTokenMap[p.user_id]!, {
            title: p.title,
            body:  p.body,
            data:  { skuId: p.sku_id, type: 'price_alert' },
          })
        )
    );
    const pushSent = pushResults.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return ok({ checked: alerts.length, triggered: triggered.length, pushSent });
  } catch (err) {
    console.error('[price-alert-checker]', err);
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
