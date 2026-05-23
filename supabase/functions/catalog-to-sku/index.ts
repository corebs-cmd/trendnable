// catalog-to-sku
// Promotes a product_catalog entry to a full, trackable SKU.
// Called the moment a user adds a scanned item to their watchlist or collection —
// so they never see "Pending SKU"; they get a real item page immediately.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

serve(async (req) => {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  const userJwt = authHeader.slice(7);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Body ─────────────────────────────────────────────────────────────────────
  let body: { catalog_id: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const { catalog_id } = body;
  if (!catalog_id) {
    return new Response(JSON.stringify({ error: 'catalog_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });

  try {
    // ── Fetch catalog entry ───────────────────────────────────────────────────
    const { data: cat, error: catErr } = await svc
      .from('product_catalog')
      .select('*')
      .eq('id', catalog_id)
      .single();

    if (catErr || !cat) {
      return json({ error: 'Catalog entry not found' }, 404);
    }

    // Already promoted — return existing SKU id
    if (cat.sku_id) {
      return json({ ok: true, sku_id: cat.sku_id, already_existed: true });
    }

    // ── Generate collision-free SKU id ────────────────────────────────────────
    const { count } = await svc
      .from('skus')
      .select('*', { count: 'exact', head: true });

    let seq = (count ?? 0) + 1;
    let newId = 'sku-' + String(seq).padStart(3, '0');

    while (true) {
      const { data: existing } = await svc
        .from('skus').select('id').eq('id', newId).maybeSingle();
      if (!existing) break;
      seq++;
      newId = 'sku-' + String(seq).padStart(3, '0');
    }

    // ── Insert SKU ────────────────────────────────────────────────────────────
    const { error: skuErr } = await svc.from('skus').insert({
      id:             newId,
      name:           cat.name,
      short:          cat.short ?? cat.name.slice(0, 18),
      series:         cat.series ?? '',
      category_id:    cat.category_id,
      fandom_id:      cat.fandom_id ?? null,
      ebay_query:     cat.ebay_query ?? cat.name,
      pop_number:     cat.pop_number ?? null,
      exclusive_type: cat.exclusive_type ?? null,
      card_variant:   cat.card_variant ?? null,
      card_grader:    cat.card_grader ?? null,
      card_grade:     cat.card_grade ?? null,
      image_url:      cat.image_url ?? null,
      is_active:      true,
    });

    if (skuErr) {
      console.error('SKU insert failed:', skuErr.message);
      return json({ error: 'sku_insert_failed', detail: skuErr.message }, 500);
    }

    const today = new Date().toISOString().split('T')[0];
    const priceMedian = Number(cat.price_latest ?? 0);
    const priceFirst  = Number(cat.price_first_seen ?? priceMedian);

    // ── Initial daily snapshot ────────────────────────────────────────────────
    await svc.from('daily_snapshots').upsert({
      sku_id:            newId,
      snapshot_date:     today,
      listing_count:     0,
      price_low:         priceFirst,
      price_median:      priceMedian,
      price_high:        priceMedian,
      velocity_score:    0,
    }, { onConflict: 'sku_id,snapshot_date' });

    // ── Initial hot_index ─────────────────────────────────────────────────────
    // Neutral starting score; hot-pipeline overwrites on its next run.
    await svc.from('hot_index').upsert({
      sku_id:             newId,
      hot_score:          1,
      delta_24h:          0,
      momentum:           'flat',
      velocity_score:     0,
      volume_score:       0,
      confirmation_score: 0,
      freshness_score:    15,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'sku_id' });

    // ── Link catalog → SKU ────────────────────────────────────────────────────
    await svc.from('product_catalog')
      .update({ sku_id: newId })
      .eq('id', catalog_id);

    // ── Back-fill sku_id on any watchlist / collection rows ───────────────────
    await svc.from('user_watchlists')
      .update({ sku_id: newId })
      .eq('catalog_id', catalog_id)
      .is('sku_id', null);

    await svc.from('user_collections')
      .update({ sku_id: newId })
      .eq('catalog_id', catalog_id)
      .is('sku_id', null);

    return json({ ok: true, sku_id: newId, already_existed: false });

  } catch (err) {
    console.error('catalog-to-sku error:', err);
    return json({ error: String(err) }, 500);
  }
});
