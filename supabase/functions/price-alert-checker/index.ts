// price-alert-checker — runs daily at 6 PM UTC via pg_cron
// Checks all active price alerts against latest daily_snapshots.price_median.
// For triggered alerts: writes in_app_notifications + sends APNs push directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendApnsNotification } from '../_shared/apns.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all active alerts, join SKU names for notification copy
    const { data: alerts, error: alertsErr } = await supabase
      .from('price_alerts')
      .select('id, user_id, sku_id, direction, target_price, skus(name, short)')
      .eq('is_active', true);

    if (alertsErr) throw alertsErr;

    if (!alerts?.length) {
      return new Response(
        JSON.stringify({ ok: true, checked: 0, triggered: 0 }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch latest price snapshot for every affected SKU (last 2 days as buffer)
    const skuIds = [...new Set(alerts.map((a) => a.sku_id))];
    const since  = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];

    const { data: snapshots } = await supabase
      .from('daily_snapshots')
      .select('sku_id, price_median, snapshot_date')
      .in('sku_id', skuIds)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: false });

    // Build latest-price map: skuId → price_median
    const latestPrice: Record<string, number> = {};
    for (const snap of snapshots ?? []) {
      if (!(snap.sku_id in latestPrice)) {
        latestPrice[snap.sku_id] = Number(snap.price_median);
      }
    }

    // Determine which alerts crossed their threshold
    const triggered = alerts.filter((alert) => {
      const price = latestPrice[alert.sku_id];
      if (price == null) return false;
      return alert.direction === 'above'
        ? price >= Number(alert.target_price)
        : price <= Number(alert.target_price);
    });

    if (!triggered.length) {
      return new Response(
        JSON.stringify({ ok: true, checked: alerts.length, triggered: 0 }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch push tokens for all affected users in one query
    const userIds = [...new Set(triggered.map((a) => a.user_id))];
    const { data: userRows } = await supabase
      .from('users')
      .select('id, push_token')
      .in('id', userIds);

    const pushTokenMap: Record<string, string | null> = {};
    for (const u of userRows ?? []) {
      pushTokenMap[u.id] = u.push_token ?? null;
    }

    // Build in-app notification rows + send APNs pushes
    const now           = new Date().toISOString();
    const notifications = triggered.map((alert) => {
      const price    = latestPrice[alert.sku_id];
      const skuData  = alert.skus as { name?: string; short?: string } | null;
      const skuName  = skuData?.short ?? skuData?.name ?? alert.sku_id;
      const dirLabel = alert.direction === 'above' ? 'rose above' : 'dropped below';
      const target   = Number(alert.target_price);
      return {
        user_id:  alert.user_id,
        type:     'price_alert',
        sku_id:   alert.sku_id,
        title:    `${skuName} alert`,
        body:     `Median price ${dirLabel} your $${target.toFixed(0)} target — now $${price.toFixed(0)}`,
        metadata: {
          alert_id:        alert.id,
          direction:       alert.direction,
          target_price:    target,
          triggered_price: price,
        },
        is_read: false,
      };
    });

    // Write in-app notifications
    await supabase.from('in_app_notifications').insert(notifications);

    // Send APNs push to each user that has a registered device token
    const pushResults = await Promise.allSettled(
      triggered.map((alert) => {
        const token = pushTokenMap[alert.user_id];
        if (!token) return Promise.resolve(false);

        const price    = latestPrice[alert.sku_id];
        const skuData  = alert.skus as { name?: string; short?: string } | null;
        const skuName  = skuData?.short ?? skuData?.name ?? alert.sku_id;
        const dirLabel = alert.direction === 'above' ? 'rose above' : 'dropped below';
        const target   = Number(alert.target_price);

        return sendApnsNotification(token, {
          title: `${skuName} alert`,
          body:  `Median price ${dirLabel} your $${target.toFixed(0)} target — now $${price.toFixed(0)}`,
          data:  { skuId: alert.sku_id },
        });
      }),
    );

    const pushSent = pushResults.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;

    // Deactivate triggered alerts (one-shot — user must re-enable)
    await supabase
      .from('price_alerts')
      .update({ is_active: false, triggered_at: now })
      .in('id', triggered.map((a) => a.id));

    return new Response(
      JSON.stringify({ ok: true, checked: alerts.length, triggered: triggered.length, pushSent }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[price-alert-checker]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
