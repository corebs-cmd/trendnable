// Trendnable Funko Pipeline
// Dedicated discovery pipeline for Funko Pop collectibles.
// More targeted queries and a Funko-only Claude prompt to improve
// Pop number accuracy and catch exclusive/chase/GITD finds.
// Feeds the same discovery_candidates table so the hot pipeline picks up promoted SKUs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PIPELINE_SECRET           = Deno.env.get('PIPELINE_SECRET') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// Targeted Funko-specific searches — broader coverage across fandoms and exclusivity types
const FUNKO_SEARCHES = [
  'Funko Pop chase GITD exclusive limited edition',
  'Funko Pop convention exclusive Comic-Con SDCC',
  'Funko Pop GameStop exclusive limited',
  'Funko Pop Target exclusive limited rare',
  'Funko Pop grail HTF vaulted hard to find',
  'Funko Pop anime exclusive One Piece Dragon Ball',
  'Funko Pop horror exclusive Halloween limited',
  'Funko Pop Marvel exclusive rare chase',
  'Funko Pop Disney exclusive limited edition',
  'Funko Pop Star Wars exclusive limited rare',
  'Funko Pop Pokemon exclusive rare',
  'Funko Pop Stranger Things exclusive limited',
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

async function searchEbayWatched(query: string, token: string, limit = 50): Promise<any[]> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('filter', 'categoryIds:{220,64482},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('limit', String(limit));

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

// ── Claude classification (Funko-only prompt) ─────────────────────────────────

async function classifyWithClaude(
  items: any[],
  existingNames: string[]
): Promise<{ candidates: any[]; inputTokens: number; outputTokens: number }> {
  const FANDOMS = 'onepiece, demon (Demon Slayer), starwars, pokemon, marvel, mha (My Hero Academia), stranger (Stranger Things), labubu, disney, jjk (Jujutsu Kaisen), dc, horror, gaming';

  const prompt = `You are a Funko Pop specialist. Evaluate these eBay listings to find specific, trackable Funko Pop figures worth price monitoring.

ALREADY TRACKED (skip these): ${existingNames.slice(0, 60).join(' | ')}

KNOWN FANDOMS: ${FANDOMS}

APPROVE a listing if ALL of the following are true:
- It is a single, specific Funko Pop figure (not a lot, bundle, multi-pack, or mystery box)
- The Pop number is clearly visible in the title (e.g. #1578, #472, No. 1583)
- It is NOT already in the tracked list above
- It has some exclusivity signal: chase, GITD (glow in the dark), exclusive retailer (GameStop, Target, Walmart, Hot Topic, BoxLunch, SDCC, NYCC, FunkonatiCon, Amazon), vaulted, limited edition, or grail/HTF designation

REJECT if:
- No Pop number visible anywhere in the title
- Generic listing with no specific figure identity
- A lot or multi-pack
- Common/widely available non-exclusive figure with no chase variant

⚠️ POP NUMBER IS MANDATORY: You MUST extract the Pop number from the title. If no number is visible (e.g. #1578, #472, or bare number like "1578"), REJECT the item. Do not guess or invent Pop numbers.

For each APPROVED item return:
- name: "Character Name [#XXXX]" — clean canonical name ending with the Pop number in [#XXXX] format
- short: nickname max 18 chars (no Pop number needed here)
- series: product line (e.g. "Funko Pop · Marvel #1234" or "Funko Pop · Horror #567")
- fandom_id: best matching fandom from the known list, or null
- ebay_query: concise eBay search string that includes the bare Pop number (e.g. "Funko Pop Luffy Gear 5 1583 chase")
- ebay_title: original listing title verbatim
- price_median: listing price as a number
- reasoning: one sentence — what makes this worth tracking (exclusivity, demand signal, rarity)
- exclusive_type: one of "chase" | "gitd" | "convention" | "retailer" | "vaulted" | "limited" | "htf" | null

Return ONLY a valid JSON array (can be empty). No markdown, no explanation outside the array.

LISTINGS:
${items.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'}`
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
  const validTokens = [`Bearer ${PIPELINE_SECRET}`, `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`].filter(Boolean);
  if (!authHeader || !validTokens.some((t) => t === authHeader)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Load existing Funko names to avoid duplicates
    const [{ data: existingSkus }, { data: existingCandidates }] = await Promise.all([
      supabase.from('skus').select('name').eq('category_id', 'funko'),
      supabase.from('discovery_candidates').select('name').eq('category_id', 'funko').in('status', ['new', 'approved']),
    ]);
    const existingNames: string[] = [
      ...(existingSkus ?? []).map((s: any) => s.name as string),
      ...(existingCandidates ?? []).map((c: any) => c.name as string),
    ];

    const ebayToken = await getEbayToken();

    // Collect eBay results, deduplicate by title
    const seenTitles = new Set<string>();
    const allItems: any[] = [];

    for (const query of FUNKO_SEARCHES) {
      const results = await searchEbayWatched(query, ebayToken);
      for (const item of results) {
        const key = (item.title ?? '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push(item);
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    // Build title → eBay URL map
    const ebayUrlByTitle = new Map<string, string>();
    for (const item of allItems) {
      if (item.title && item.itemWebUrl) {
        ebayUrlByTitle.set((item.title as string).toLowerCase().trim(), item.itemWebUrl as string);
      }
    }

    // Pre-filter: drop titles that match existing tracked Funko names
    const existingTokens = existingNames.map((n) =>
      n.toLowerCase().replace(/\[#\d+\]/g, '').trim().split(' ').slice(0, 3).join(' ')
    );
    const filtered = allItems.filter((item) => {
      const title = (item.title ?? '').toLowerCase();
      return !existingTokens.some((token) => token.length > 4 && title.includes(token));
    });

    // Classify with Claude in batches of 20
    const candidates: any[] = [];
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const BATCH = 20;

    for (let i = 0; i < Math.min(filtered.length, 400); i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const { candidates: approved, inputTokens, outputTokens } = await classifyWithClaude(batch, existingNames);
      candidates.push(...approved);
      totalInputTokens  += inputTokens;
      totalOutputTokens += outputTokens;
      if (i + BATCH < filtered.length) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // Insert candidates
    let inserted = 0;
    let autoPromoted = 0;
    let rejected = 0;

    for (const c of candidates) {
      if (!c.name) continue;

      // Hard validation — Pop number must be present
      const hasPopNumber = /\[#\d+\]/i.test(c.name);
      if (!hasPopNumber) {
        console.log(`Rejected — no Pop number in name: ${c.name}`);
        rejected++;
        continue;
      }

      const meetsThreshold = Number(c.price_median ?? 0) > 15 && !!c.fandom_id;

      const { data, error } = await supabase
        .from('discovery_candidates')
        .insert({
          name:        c.name,
          category_id: 'funko',
          fandom_id:   c.fandom_id ?? null,
          ebay_count:  0,
          reddit_mentions: 0,
          evidence_json: {
            short:           c.short,
            series:          c.series,
            ebay_query:      c.ebay_query,
            ebay_title:      c.ebay_title,
            ebay_listing_url: c.ebay_title
              ? (ebayUrlByTitle.get((c.ebay_title as string).toLowerCase().trim()) ?? null)
              : null,
            price_median:    c.price_median,
            reasoning:       c.reasoning,
            exclusive_type:  c.exclusive_type ?? null,
          },
          status: 'new',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Insert error:', error.message);
        continue;
      }

      inserted++;

      if (meetsThreshold) {
        const { data: result, error: promoteError } = await supabase
          .rpc('promote_candidate_to_sku', { candidate_id: data.id });

        if (promoteError) {
          console.error('Auto-promote error:', promoteError.message);
        } else if (typeof result === 'string' && !result.startsWith('ERROR')) {
          autoPromoted++;
          const skuId = result.match(/sku-\d+/)?.[0];
          if (skuId && c.reasoning) {
            await supabase.from('sku_narratives').upsert(
              { sku_id: skuId, narrative: c.reasoning },
              { onConflict: 'sku_id', ignoreDuplicates: true }
            );
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const costUsd = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);

    supabase.from('pipeline_runs').insert({
      pipeline: 'funko-pipeline',
      duration_ms: durationMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      meta: {
        ebay_results:     allItems.length,
        after_dedup:      filtered.length,
        claude_approved:  candidates.length,
        rejected_no_pop:  rejected,
        inserted,
        auto_promoted:    autoPromoted,
        held_for_review:  inserted - autoPromoted,
      },
    }).then(({ error: logErr }) => {
      if (logErr) console.error('Failed to log pipeline run:', logErr.message);
    });

    return new Response(
      JSON.stringify({
        ok: true,
        ebay_results:     allItems.length,
        after_dedup:      filtered.length,
        claude_approved:  candidates.length,
        rejected_no_pop:  rejected,
        inserted,
        auto_promoted:    autoPromoted,
        held_for_review:  inserted - autoPromoted,
        input_tokens:     totalInputTokens,
        output_tokens:    totalOutputTokens,
        cost_usd:         Number(costUsd.toFixed(8)),
        duration_ms:      durationMs,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Funko pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
