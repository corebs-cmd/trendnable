// Trendnable Catalog Expansion Pipeline
// 7-day catalog growth sprint. Runs 20 eBay searches in parallel per batch,
// classifies with Claude Haiku, upserts to product_catalog only.
// Pass ?batch=a (default) or ?batch=b to alternate query sets across runs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titlePassesTier1, tcgMultiQty, catalogFingerprint } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// 20 queries per batch — proven to finish in ~30-40s at 10 queries.
// Doubling to 20 should stay well under 90s.

const SEARCHES_A = [
  { category_id: 'tcg',         query: 'Pokemon TCG Charizard rare holo PSA BGS graded' },
  { category_id: 'tcg',         query: 'Pokemon Scarlet Violet rare holo full art secret' },
  { category_id: 'tcg',         query: 'Pokemon 151 Mew Blastoise Venusaur rare' },
  { category_id: 'tcg',         query: 'Pokemon Twilight Masquerade rare holo' },
  { category_id: 'tcg',         query: 'Pokemon Obsidian Flames rare holo ex' },
  { category_id: 'tcg',         query: 'Magic The Gathering reserved list rare' },
  { category_id: 'tcg',         query: 'Magic Commander rare mythic foil' },
  { category_id: 'hottoys',     query: 'Hot Toys Iron Man MMS 1/6 figure' },
  { category_id: 'hottoys',     query: 'Hot Toys Spider-Man MMS 1/6 figure' },
  { category_id: 'hottoys',     query: 'Hot Toys Thor Avengers MMS 1/6' },
  { category_id: 'hottoys',     query: 'Hot Toys Joker DX 1/6 figure' },
  { category_id: 'neca',        query: 'NECA Predator ultimate action figure' },
  { category_id: 'neca',        query: 'NECA Alien Xenomorph ultimate figure' },
  { category_id: 'neca',        query: 'NECA Halloween Michael Myers ultimate figure' },
  { category_id: 'popmart',     query: 'Pop Mart Hirono figure series' },
  { category_id: 'popmart',     query: 'Pop Mart Crybaby Molly figure series' },
  { category_id: 'funko',       query: 'Funko Pop anime exclusive 2024 2025 limited' },
  { category_id: 'funko',       query: 'Funko Pop horror exclusive vaulted retired' },
  { category_id: 'hwheels',     query: 'Hot Wheels Super Treasure Hunt 2023 2024 2025' },
  { category_id: 'hwheels',     query: 'Hot Wheels RLC exclusive members only' },
];

const SEARCHES_B = [
  { category_id: 'tcg',         query: 'Pokemon Paldean Fates shiny rare holo' },
  { category_id: 'tcg',         query: 'Pokemon Paradox Rift ultra rare secret' },
  { category_id: 'tcg',         query: 'Pokemon Temporal Forces rare special art' },
  { category_id: 'tcg',         query: 'Pokemon graded PSA 10 BGS 9.5 vintage base set' },
  { category_id: 'tcg',         query: 'Yu-Gi-Oh Blue Eyes White Dragon rare original' },
  { category_id: 'tcg',         query: 'One Piece TCG rare holo alt art' },
  { category_id: 'tcg',         query: 'Disney Lorcana rare enchanted foil' },
  { category_id: 'hottoys',     query: 'Hot Toys Batman DX 1/6 figure' },
  { category_id: 'hottoys',     query: 'Hot Toys Mandalorian Star Wars MMS 1/6' },
  { category_id: 'hottoys',     query: 'Hot Toys Deadpool MMS Marvel 1/6' },
  { category_id: 'hottoys',     query: 'Hot Toys Captain America MMS Avengers 1/6' },
  { category_id: 'neca',        query: 'NECA Friday 13th Jason Voorhees figure' },
  { category_id: 'neca',        query: 'NECA Freddy Krueger Nightmare Elm Street figure' },
  { category_id: 'neca',        query: 'NECA Aliens Colonial Marines ultimate figure' },
  { category_id: 'popmart',     query: 'Pop Mart Bunny Pucky figure series' },
  { category_id: 'popmart',     query: 'Pop Mart Mega 400% 1000% figure' },
  { category_id: 'funko',       query: 'Funko Pop Marvel exclusive variant 2024' },
  { category_id: 'funko',       query: 'Funko Pop Star Wars exclusive variant 2024' },
  { category_id: 'hwheels',     query: 'Hot Wheels Treasure Hunt T-Hunt premium' },
  { category_id: 'autographed', query: 'signed autographed Pokemon card JSA Beckett CGC authenticated' },
];

// ── eBay ──────────────────────────────────────────────────────────────────────

async function getEbayToken(): Promise<string> {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`eBay auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function searchEbayListings(query: string, token: string): Promise<any[]> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('filter', 'categoryIds:{220,64482,183454,261068},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`eBay search failed for "${query}":`, res.status);
    return [];
  }
  const data = await res.json();
  return data.itemSummaries ?? [];
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function classifyWithClaude(
  items: any[],
  knownNames: string[],
): Promise<{ candidates: any[]; inputTokens: number; outputTokens: number }> {
  const prompt = `You are a collectibles catalog analyst. Identify specific, named collectible items from these eBay listings for a price research catalog.

CATEGORIES: funko, tcg, popmart, hottoys, neca, hwheels, autographed, thrilljoy

ALREADY IN CATALOG (skip): ${knownNames.slice(0, 50).join(' | ')}

APPROVE if: specific named product, physical collectible in listed categories, NOT a lot/bundle/mystery box/accessories/bootleg.
REJECT if: too generic, multi-item lot, or cannot be uniquely identified.

For TCG: extract card_variant ("raw" or "graded"), card_grader (PSA/BGS/CGC), card_grade if visible.
For Funko: extract pop_number as integer if visible — include [#XXXX] in the name if found.

Return ONLY a valid JSON array (empty if nothing qualifies). No markdown.

Each approved item: {"name":"...","short":"max 18 chars","series":"...","category_id":"...","price_median":0,"card_variant":null,"card_grader":null,"card_grade":null,"pop_number":null}

LISTINGS:
${items.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item._category_id}`
).join('\n')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error('Claude API error:', res.status, await res.text());
    return { candidates: [], inputTokens: 0, outputTokens: 0 };
  }

  const data = await res.json();
  const inputTokens  = data.usage?.input_tokens  ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const text: string = data.content?.[0]?.text ?? '[]';

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return { candidates: [], inputTokens, outputTokens };
    return { candidates: JSON.parse(match[0]), inputTokens, outputTokens };
  } catch {
    console.error('Failed to parse Claude response:', text.slice(0, 200));
    return { candidates: [], inputTokens, outputTokens };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const startTime = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url   = new URL(req.url);
  const batch = url.searchParams.get('batch') === 'b' ? 'b' : 'a';
  const searches = batch === 'b' ? SEARCHES_B : SEARCHES_A;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: existingCatalog } = await supabase
      .from('product_catalog')
      .select('name');

    const catalogNames: string[] = (existingCatalog ?? []).map((r: any) => r.name as string);
    const catalogTokens = catalogNames.map((n) =>
      n.toLowerCase().split(' ').slice(0, 2).join(' ')
    );

    const ebayToken = await getEbayToken();

    // Fetch all 10 queries in parallel (no groups needed at this scale)
    const seenTitles = new Set<string>();
    const allItems: any[] = [];

    const results = await Promise.allSettled(
      searches.map((s) =>
        searchEbayListings(s.query, ebayToken).then((items) =>
          items.map((item) => ({ ...item, _category_id: s.category_id }))
        )
      )
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        const key = (item.title ?? '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push(item);
        }
      }
    }

    // Pre-filter
    const filtered: any[] = [];
    for (const item of allItems) {
      const title = item.title ?? '';
      if (!titlePassesTier1(title)) continue;

      let effectiveItem = item;
      if (item._category_id === 'tcg') {
        const { drop, divisor } = tcgMultiQty(title);
        if (drop) continue;
        if (divisor > 1) {
          const rawPrice = parseFloat(item.price?.value ?? '0');
          effectiveItem = { ...item, price: { ...item.price, value: (rawPrice / divisor).toFixed(2) } };
        }
      }

      if (parseFloat(effectiveItem.price?.value ?? '0') < 5) continue;

      const lowerTitle = title.toLowerCase();
      if (catalogTokens.some((token) => lowerTitle.includes(token))) continue;

      filtered.push(effectiveItem);
    }

    // Claude classification — cap 200 items, batch 25 (≤8 API calls)
    const candidates: any[] = [];
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const BATCH_SIZE = 25;
    const CAP        = 200;

    for (let i = 0; i < Math.min(filtered.length, CAP); i += BATCH_SIZE) {
      const chunk = filtered.slice(i, i + BATCH_SIZE);
      const { candidates: approved, inputTokens, outputTokens } = await classifyWithClaude(chunk, catalogNames);
      candidates.push(...approved);
      totalInputTokens  += inputTokens;
      totalOutputTokens += outputTokens;
    }

    // Upsert to product_catalog
    let catalogUpserted = 0;

    for (const c of candidates) {
      if (!c.name || !c.category_id) continue;

      const popNum = c.category_id === 'funko' && c.pop_number ? Number(c.pop_number) : NaN;
      const fp = catalogFingerprint(c.category_id, c.name, {
        popNumber:   !isNaN(popNum) ? popNum : null,
        variantType: c.category_id === 'funko' ? 'common' : null,
        cardVariant: c.card_variant ?? null,
        cardGrader:  c.card_grader  ?? null,
        cardGrade:   c.card_grade != null ? String(c.card_grade) : null,
      });

      const now = new Date().toISOString();
      const { error } = await supabase.from('product_catalog').upsert({
        fingerprint:      fp,
        name:             c.name,
        short:            c.short ?? c.name.slice(0, 18),
        category_id:      c.category_id,
        fandom_id:        null,
        series:           c.series ?? null,
        pop_number:       !isNaN(popNum) ? popNum : null,
        variant_type:     c.category_id === 'funko' ? 'common' : null,
        card_variant:     c.card_variant ?? null,
        card_grader:      c.card_grader  ?? null,
        card_grade:       c.card_grade   ?? null,
        ebay_query:       c.name,
        price_first_seen: c.price_median ?? null,
        price_latest:     c.price_median ?? null,
        price_updated_at: now,
        source:           'catalog-expansion',
        first_seen_at:    now,
        last_seen_at:     now,
      }, { onConflict: 'fingerprint' });

      if (!error) catalogUpserted++;
    }

    const durationMs = Date.now() - startTime;
    const costUsd = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);

    await supabase.from('pipeline_runs').insert({
      pipeline:     'catalog-expansion',
      duration_ms:  durationMs,
      input_tokens:  totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd:     costUsd,
      meta: {
        batch,
        ebay_results:     allItems.length,
        after_filter:     filtered.length,
        claude_approved:  candidates.length,
        catalog_upserted: catalogUpserted,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        batch,
        ebay_results:     allItems.length,
        after_filter:     filtered.length,
        claude_approved:  candidates.length,
        catalog_upserted: catalogUpserted,
        cost_usd:         Number(costUsd.toFixed(6)),
        duration_ms:      durationMs,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Catalog expansion error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
