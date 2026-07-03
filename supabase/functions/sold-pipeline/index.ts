// Trendnable Sold Pipeline — enriches daily_snapshots with real sold price data.
// Uses RapidAPI eBay Average Selling Price (ecommet) for completed/sold listings.
//
// Modes:
//   default    — full refresh of all active SKUs (run bi-weekly)
//   new_only=true — only SKUs with no sold data yet (run daily for new discoveries)
//
// Concurrency: processes CONCURRENCY SKUs in parallel so total runtime stays
// well under Supabase's 150s timeout regardless of catalog size.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titlePassesTier1, isLooseCondition, tcgMultiQty, effectivePrice, iqrMedian, soldTitleMatchesQuery } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RAPIDAPI_KEY              = Deno.env.get('RAPIDAPI_KEY') ?? '';

const CONCURRENCY = 10; // parallel RapidAPI calls per wave

// ── RapidAPI fetch ────────────────────────────────────────────────────────────

async function fetchSoldProducts(query: string): Promise<any[]> {
  const res = await fetch('https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'ebay-average-selling-price.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
    },
    body: JSON.stringify({
      keywords: query,
      max_search_results: 240,
      remove_outliers: false,
      site_id: '0',
    }),
  });

  if (!res.ok) {
    console.error(`[sold] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const data = await res.json();
  if (!data.success) {
    console.error(`[sold] API error for "${query}":`, JSON.stringify(data).slice(0, 200));
    return [];
  }

  return data.products ?? [];
}

// ── Per-SKU processor ─────────────────────────────────────────────────────────

async function processSku(
  sku: any,
  supabase: any,
  today: string,
): Promise<'processed' | 'skipped' | 'error'> {
  try {
    let query = sku.ebay_query || sku.name;
    if (sku.category_id === 'tcg' && sku.card_variant) {
      if (sku.card_variant === 'graded' && sku.card_grader) {
        query += sku.card_grade ? ` ${sku.card_grader} ${sku.card_grade}` : ` ${sku.card_grader}`;
      } else if (sku.card_variant === 'raw') {
        query += ' -PSA -BGS -CGC -SGC';
      }
    }

    const products = await fetchSoldProducts(query);

    const mintPrices:  number[] = [];
    const loosePrices: number[] = [];

    for (const p of products) {
      const title: string = p.title ?? '';
      if (!titlePassesTier1(title)) continue;
      // Require all meaningful query words to appear in the sold listing title.
      // Prevents cross-contamination between variants (e.g. SP sales inflating base card median).
      if (!soldTitleMatchesQuery(title, query)) continue;

      if (sku.category_id === 'tcg') {
        const { drop, divisor } = tcgMultiQty(title);
        if (drop) continue;
        const rawPrice = parseFloat(p.sale_price ?? '0') / divisor;
        if (rawPrice < 5) continue;
        const shippingCost = parseFloat(p.shipping_price ?? '0') || null;
        const ep = effectivePrice(rawPrice, shippingCost, shippingCost != null ? 'FLAT' : null, sku.category_id);
        isLooseCondition(title) ? loosePrices.push(ep) : mintPrices.push(ep);
        continue;
      }

      const itemPrice = parseFloat(p.sale_price ?? '0');
      if (itemPrice < 5) continue;

      const shippingCost = parseFloat(p.shipping_price ?? '0') || null;
      const ep = effectivePrice(
        itemPrice,
        shippingCost,
        shippingCost != null ? 'FLAT' : null,
        sku.category_id,
      );
      isLooseCondition(title) ? loosePrices.push(ep) : mintPrices.push(ep);
    }

    const allPrices = [...mintPrices, ...loosePrices];

    if (allPrices.length === 0) {
      console.log(`[sold] No valid prices for "${sku.name}" — skipping`);
      return 'skipped';
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const { median: priceMedian, low: priceLow, high: priceHigh } = iqrMedian(allPrices);
    const mintResult  = iqrMedian(mintPrices);
    const looseResult = iqrMedian(loosePrices);

    await supabase.from('daily_snapshots').upsert({
      sku_id:            sku.id,
      snapshot_date:     today,
      price_median:      r2(priceMedian),
      price_low:         r2(priceLow),
      price_high:        r2(priceHigh),
      price_mint:        mintResult.count  > 0 ? r2(mintResult.median)  : null,
      price_mint_count:  mintResult.count  > 0 ? mintResult.count       : null,
      price_loose:       looseResult.count > 0 ? r2(looseResult.median) : null,
      price_loose_count: looseResult.count > 0 ? looseResult.count      : null,
    }, { onConflict: 'sku_id,snapshot_date' });

    console.log(`[sold] "${sku.name}" → ${allPrices.length} sales, median $${priceMedian.toFixed(2)} (mint: ${mintResult.count}, loose: ${looseResult.count})`);
    return 'processed';
  } catch (err) {
    console.error(`[sold] Failed SKU ${sku.id}:`, err);
    return 'error';
  }
}

// ── Pipeline runner (runs in background after response is sent) ───────────────

async function runPipeline(newOnly: boolean) {
  const startTime = Date.now();
  const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const today = new Date().toISOString().split('T')[0];

    // new_only mode: SKUs with no sold data in the last 30 days
    // default mode: all active SKUs
    let skuQuery = supabase
      .from('skus')
      .select('id, name, category_id, ebay_query, card_variant, card_grader, card_grade')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (newOnly) {
      const { data: processedIds } = await supabase
        .from('daily_snapshots')
        .select('sku_id')
        .gte('snapshot_date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
        .or('price_mint_count.gt.0,price_loose_count.gt.0');

      const alreadyProcessed = new Set((processedIds ?? []).map((r: any) => r.sku_id));
      const { data: allSkus, error } = await skuQuery;
      if (error) throw error;

      const skus = (allSkus ?? []).filter((s: any) => !alreadyProcessed.has(s.id));
      console.log(`[sold] new_only mode — ${skus.length} SKUs without sold data`);

      let processed = 0, skipped = 0, errors = 0;
      for (let i = 0; i < skus.length; i += CONCURRENCY) {
        const wave = skus.slice(i, i + CONCURRENCY);
        const results = await Promise.all(wave.map((sku: any) => processSku(sku, supabase, today)));
        processed += results.filter(r => r === 'processed').length;
        skipped   += results.filter(r => r === 'skipped').length;
        errors    += results.filter(r => r === 'error').length;
      }

      const durationMs = Date.now() - startTime;
      const apiCalls = processed + skipped + errors;
      await supabase.from('pipeline_runs').insert({ pipeline: 'sold-pipeline', duration_ms: durationMs, meta: { mode: 'new_only', processed, skipped, errors, api_calls: apiCalls, date: today } });
      console.log(`[sold] new_only done — ${processed} processed, ${skipped} skipped, ${errors} errors, ${apiCalls} API calls in ${durationMs}ms`);
      return;
    }

    // Full refresh — all active SKUs
    const { data: skus, error } = await skuQuery;
    if (error) throw error;

    console.log(`[sold] full refresh — ${skus?.length ?? 0} active SKUs`);

    let processed = 0, skipped = 0, errors = 0;
    for (let i = 0; i < (skus?.length ?? 0); i += CONCURRENCY) {
      const wave = skus!.slice(i, i + CONCURRENCY);
      const results = await Promise.all(wave.map((sku: any) => processSku(sku, supabase, today)));
      processed += results.filter(r => r === 'processed').length;
      skipped   += results.filter(r => r === 'skipped').length;
      errors    += results.filter(r => r === 'error').length;
    }

    const durationMs = Date.now() - startTime;
    const apiCalls = processed + skipped + errors;
    await supabase.from('pipeline_runs').insert({ pipeline: 'sold-pipeline', duration_ms: durationMs, meta: { mode: 'full', processed, skipped, errors, api_calls: apiCalls, date: today } });
    console.log(`[sold] full done — ${processed} processed, ${skipped} skipped, ${errors} errors, ${apiCalls} API calls in ${durationMs}ms`);

  } catch (err) {
    console.error('[sold] Pipeline error:', err);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url     = new URL(req.url);
  const newOnly = url.searchParams.get('new_only') === 'true';
  const mode    = newOnly ? 'new_only' : 'full';

  // Return immediately — processing runs in background so no timeout
  EdgeRuntime.waitUntil(runPipeline(newOnly));

  return new Response(
    JSON.stringify({ ok: true, started: true, mode }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
