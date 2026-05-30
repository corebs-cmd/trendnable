// fetch-price-guide — fetches Funky Price Guide prices for all active Funko Pop SKUs.
// Uses FPG's search API (/api/search?query=...) to find items by name, then matches
// by confirming our pop_number appears as the first token in the result's name.
// Stores avgPriceUSD in skus.price_guide and the matched slug in skus.fpg_slug.
//
// Run weekly via pg_cron or invoke manually from the Supabase dashboard.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CONCURRENCY   = 5;
const FPG_SEARCH    = 'https://funkypriceguide.com/api/search';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Search FPG by name, match by pop_number ───────────────────────────────────

async function searchFPGPrice(
  name: string,
  popNumber: number,
): Promise<{ price: number; slug: string } | null> {
  // Strip trailing [#XXXX] bracket added by our pipeline
  const query = name.replace(/\s*\[#\d+\]$/, '').trim();

  try {
    const res = await fetch(`${FPG_SEARCH}?query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Trendnable/1.0)',
        'Accept':     'application/json',
      },
    });
    if (!res.ok) return null;

    const data        = await res.json();
    const collectibles: any[] = data?.collectibles ?? [];
    const popStr      = String(popNumber);

    // FPG names items with the Funko Pop # as the first token: "1858 Muichiro Tokito Chase"
    // We only accept a result if our pop_number appears at the start of the name.
    const match = collectibles.find((c) => {
      const n: string = c.name ?? '';
      return n.startsWith(`${popStr} `) || n.includes(` ${popStr} `) || n.includes(`#${popStr}`);
    });

    if (!match || match.avgPriceUSD == null) return null;

    const price = parseFloat(String(match.avgPriceUSD));
    if (isNaN(price) || price <= 0) return null;

    return { price, slug: match.slug };
  } catch (err) {
    console.warn(`searchFPGPrice(${popNumber}) error:`, err);
    return null;
  }
}

// ── Batch helper ──────────────────────────────────────────────────────────────

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  skus: Array<{ id: string; name: string; pop_number: number }>,
): Promise<{ updated: number; failed: number; unmatched: number }> {
  let updated   = 0;
  let failed    = 0;
  let unmatched = 0;

  for (let i = 0; i < skus.length; i += CONCURRENCY) {
    const wave = skus.slice(i, i + CONCURRENCY);

    await Promise.all(wave.map(async ({ id, name, pop_number }) => {
      const result = await searchFPGPrice(name, pop_number);

      if (result === null) {
        unmatched++;
        return;
      }

      const { error } = await supabase
        .from('skus')
        .update({
          price_guide:            result.price,
          price_guide_updated_at: new Date().toISOString(),
          fpg_slug:               result.slug,
        })
        .eq('id', id);

      if (error) {
        console.error(`update failed for ${id}:`, error.message);
        failed++;
      } else {
        updated++;
      }
    }));

    // Polite delay between waves
    if (i + CONCURRENCY < skus.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return { updated, failed, unmatched };
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: { sku_id?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    let query = supabase
      .from('skus')
      .select('id, name, pop_number')
      .eq('category_id', 'funko')
      .eq('is_active', true)
      .gt('pop_number', 0);

    if (body.sku_id) {
      query = query.eq('id', body.sku_id) as typeof query;
    }

    const startedAt = Date.now();
    const { data: skus, error } = await query;
    if (error) throw error;
    if (!skus?.length) {
      await supabase.from('pipeline_runs').insert({
        pipeline: 'fetch-price-guide', ran_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, input_tokens: 0, output_tokens: 0, cost_usd: 0,
        meta: { total: 0, processed: 0, skipped: 0, errors: 0 },
      });
      return new Response(
        JSON.stringify({ ok: true, total: 0, updated: 0, failed: 0, unmatched: 0 }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }
    const { updated, failed, unmatched } = await processBatch(supabase, skus);
    const duration_ms = Date.now() - startedAt;

    await supabase.from('pipeline_runs').insert({
      pipeline:      'fetch-price-guide',
      ran_at:        new Date().toISOString(),
      duration_ms,
      input_tokens:  0,
      output_tokens: 0,
      cost_usd:      0,
      meta:          { total: skus.length, processed: updated, skipped: unmatched, errors: failed },
    });

    return new Response(
      JSON.stringify({ ok: true, total: skus.length, updated, failed, unmatched, duration_ms }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[fetch-price-guide]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
