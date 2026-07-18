
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const event = body.event;
  const appUserId = event?.app_user_id;
  const type = event?.type;

  if (!appUserId) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Handle export consumable purchase — increment credit, don't touch premium
  const isExportPurchase = type === 'INITIAL_PURCHASE' &&
    event?.product_id === 'com.trendnable.app.export_single';

  if (isExportPurchase) {
    await supabase.rpc('increment_export_credits', { user_id_input: appUserId });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isPremium = [
    'INITIAL_PURCHASE',
    'RENEWAL',
    'PRODUCT_CHANGE',
    'UNCANCELLATION',
  ].includes(type);

  const isNotPremium = [
    'CANCELLATION',
    'EXPIRATION',
    'BILLING_ISSUE',
    'SUBSCRIBER_ALIAS',
  ].includes(type);

  if (isPremium || isNotPremium) {
    const expiresAt = event?.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    await supabase
      .from('users')
      .update({
        is_premium: isPremium,
        premium_expires_at: isPremium ? expiresAt : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appUserId);

    if (isPremium) {
      const plan = event?.product_id?.includes('annual') ? 'annual' : 'monthly';
      await supabase.from('user_subscriptions').upsert({
        user_id: appUserId,
        plan,
        status: 'active',
        revenuecat_id: event?.id,
        current_period_start: event?.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
        current_period_end: expiresAt,
      }, { onConflict: 'user_id' });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
