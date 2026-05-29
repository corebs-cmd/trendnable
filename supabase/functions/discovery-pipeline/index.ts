// Trendnable Discovery Pipeline
// Searches eBay broadly for trending collectibles, uses Claude to identify
// specific trackable SKUs, inserts new candidates into discovery_candidates.
// Logs every run to pipeline_runs with token usage and cost.
//
// Run manually or on a weekly cron. Candidates must be promoted via
// the promote_candidate_to_sku() SQL function before the hot-pipeline tracks them.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titlePassesTier1, tcgMultiQty, catalogFingerprint, exclusiveTypeToVariantType } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PIPELINE_SECRET           = Deno.env.get('PIPELINE_SECRET') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

// Claude Haiku 4.5 pricing (USD per token)
const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// Broad searches per category — Funko Pop handled by dedicated funko-pipeline
const CATEGORY_SEARCHES = [
  { category_id: 'tcg',          query: 'Pokemon card rare holo graded PSA' },
  { category_id: 'tcg',          query: 'Pokemon TCG ex full art secret rare' },
  { category_id: 'popmart',      query: 'Pop Mart Labubu blind box figure' },
  { category_id: 'popmart',      query: 'Pop Mart Skull Panda Dimoo figure' },
  { category_id: 'hottoys',      query: 'Hot Toys 1/6 scale figure MMS' },
  { category_id: 'hottoys',      query: 'Hot Toys Marvel Avengers Iron Man Spider-Man 1/6' },
  { category_id: 'hottoys',      query: 'Hot Toys Star Wars Mandalorian Darth Vader 1/6' },
  { category_id: 'hottoys',      query: 'Hot Toys Disney Pixar 1/6 scale figure MMS' },
  // NECA — general + dedicated franchise/theme lines
  { category_id: 'neca',         query: 'NECA ultimate action figure 7 inch' },
  { category_id: 'neca',         query: 'NECA TMNT Teenage Mutant Ninja Turtles figure' },
  { category_id: 'neca',         query: 'NECA Alien Predator Xenomorph horror figure' },
  { category_id: 'neca',         query: 'NECA Terminator RoboCop Escape New York sci-fi figure' },
  { category_id: 'neca',         query: 'NECA Stranger Things Breaking Bad pop culture figure' },
  { category_id: 'hwheels',      query: 'Hot Wheels Super Treasure Hunt 2024 2025' },
  { category_id: 'hwheels',      query: 'Hot Wheels Real Riders premium' },
  // Signed & Autographed — cross-format signed collectibles with authentication
  { category_id: 'autographed',  query: 'signed autographed sports card COA JSA Beckett BGS' },
  { category_id: 'autographed',  query: 'autographed signed figure COA certificate authenticity JSA' },
  { category_id: 'autographed',  query: 'signed autographed comic book COA JSA Beckett authentication' },
  { category_id: 'autographed',  query: 'signed autographed Pop figure COA JSA rare collectible' },
  // ThrillJoy — designer toy brand
  { category_id: 'thrilljoy',    query: 'ThrillJoy figure collectible blind box' },
  { category_id: 'thrilljoy',    query: 'ThrillJoy toy limited edition rare' },
];

// ── eBay ─────────────────────────────────────────────────────────────────────

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
  url.searchParams.set('filter', 'categoryIds:{220,64482,183454,261068},buyingOptions:{FIXED_PRICE}');
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

// ── Claude classification ─────────────────────────────────────────────────────

async function classifyWithClaude(
  items: any[],
  existingNames: string[]
): Promise<{ candidates: any[]; inputTokens: number; outputTokens: number }> {
  const FANDOMS = 'onepiece (One Piece only), demon (Demon Slayer only), starwars, pokemon, marvel, anime (use for: My Hero Academia/MHA, Jujutsu Kaisen/JJK, Naruto, Dragon Ball/DBZ, Attack on Titan, Bleach, Fairy Tail, Black Clover, Chainsaw Man, Solo Leveling, or any anime franchise not covered by another fandom), labubu, disney, jjk (Jujutsu Kaisen), dc, gaming, tmnt (Teenage Mutant Ninja Turtles — use for any TMNT/Ninja Turtles figure), popcult (Pop Culture — use for: Stranger Things, Terminator, RoboCop, Escape from New York, They Live, Blade Runner, The Warriors, Big Trouble in Little China, Ghostbusters, Back to the Future, Pulp Fiction, Breaking Bad, The Office, Alien, Predator, Halloween, Friday the 13th, Nightmare on Elm Street, IT, The Thing, Hellraiser, Scream, Chucky, any horror franchise, any cult classic TV/film not covered by another fandom)';
  const NECA_FANDOM_HINTS = 'NECA fandom mapping hints — TMNT/Ninja Turtles/Donatello/Leonardo/Raphael/Michelangelo: tmnt. Terminator/RoboCop/Escape from New York/They Live/Blade Runner: popcult. Alien/Predator/AVP/Halloween/Jason/Freddy/Pennywise/Chucky/Leatherface/horror franchise: popcult. Stranger Things: popcult. Star Wars: starwars. Marvel/Spider-Man/Wolverine/X-Men/Deadpool: marvel. DC/Batman/Joker: dc. My Hero Academia/MHA/Deku/Bakugo: anime. Jujutsu Kaisen/JJK/Gojo/Itadori: anime. Naruto/DBZ/Dragon Ball/Attack on Titan/Bleach: anime.';
  const CATEGORIES = 'funko, tcg, popmart, hottoys, neca, hwheels, autographed, thrilljoy';

  const prompt = `You are a collectibles trend analyst. Evaluate these eBay listings to find specific, trackable collectible SKUs worth price monitoring.

CATEGORIES: ${CATEGORIES}
FANDOMS: ${FANDOMS}
${NECA_FANDOM_HINTS}
ALREADY TRACKED (skip): ${existingNames.slice(0, 40).join(' | ')}

APPROVE an item if it is ALL of:
- A specific named product with a clear identity (e.g. "Charizard VMAX Rainbow Rare", "Luffy Gear 5 [#1583]")
- NOT a lot, bundle, "random", "mystery box", accessories pack, or vague category listing
- NOT already in the tracked list above
- A physical collectible in the categories listed

REJECT if: the title is too generic, it's a multi-item lot, it's a reprint/bootleg, or it can't be uniquely identified.

⚠️ FUNKO RULE — MANDATORY: For any funko category item you MUST include the Pop number in the name formatted as [#XXXX] at the end (e.g. "Eleven - Season 5 Reveal [#1578]"). Extract the number from the listing title. If no pop number is visible in the title, REJECT the item — do not approve Funko items without a confirmed pop number. The ebay_query must also include the bare number (e.g. "Funko Pop Stranger Things Eleven 1578").

⚠️ TCG RULE — MANDATORY: For any tcg category item you MUST classify the card variant:
- card_variant: "raw" if the listing is an ungraded card
- card_variant: "graded" if the listing is a professionally graded card (look for PSA, BGS, Beckett, CGC, SGC in the title)
If graded, also extract: card_grader (e.g. "PSA", "BGS", "CGC") and card_grade (e.g. "10", "9.5", "9") when visible in the title. REJECT TCG items where the variant cannot be determined (too generic, no card name visible).

⚠️ AUTOGRAPHED RULE: Use category_id "autographed" for any signed or autographed collectible — cards, figures, comics, Funko Pops, or any other format — where the listing shows authentication (COA, JSA, Beckett, PSA auth) or clearly states it is hand-signed. Name format: "Item Name Signed" (e.g. "Charizard Base Set Signed CGC Auth", "Spider-Man #1 Comic Signed JSA"). REJECT autographed items without any authentication indicator.

⚠️ THRILLJOY RULE: Use category_id "thrilljoy" for any ThrillJoy brand collectible figure or blind box. Name the specific figure/series clearly.

For each APPROVED item return:
- name: clean canonical product name (Funko: must end with [#XXXX]; Autographed: must end with "Signed")
- short: nickname max 18 chars
- series: product line / set (e.g. "Funko Pop · #1583" or "Pokémon TCG · Scarlet & Violet")
- category_id: funko | tcg | popmart | hottoys | neca | hwheels | autographed | thrilljoy
- fandom_id: one of the known fandoms or null
- ebay_query: concise eBay search string (Funko: must include the pop number)
- ebay_title: original listing title verbatim
- price_median: price from listing as number
- reasoning: one sentence why it is worth tracking
- card_variant: (tcg only) "raw" or "graded"
- card_grader: (tcg graded only) grading company abbreviation
- card_grade: (tcg graded only) grade value if present in listing

Return ONLY a valid JSON array (can be empty). No markdown, no explanation outside the array.

LISTINGS:
${items.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'} | ${item._category_id}`
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

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const startTime = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Load existing names + deleted SKU blocklist to avoid duplicates
    const [{ data: existingSkus }, { data: existingCandidates }, { data: deletedSkus }] = await Promise.all([
      supabase.from('skus').select('name'),
      supabase.from('discovery_candidates').select('name').in('status', ['new', 'approved', 'rejected']),
      supabase.from('deleted_skus').select('name'),
    ]);
    const existingNames: string[] = [
      ...(existingSkus ?? []).map((s: any) => s.name as string),
      ...(existingCandidates ?? []).map((c: any) => c.name as string),
    ];
    // Blocklist for post-Claude name filter (normalized: lowercase, punctuation stripped)
    const normalizeName = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const deletedNameSet = new Set<string>(
      (deletedSkus ?? []).map((d: any) => normalizeName(d.name as string))
    );
    // Pass deleted names to Claude so it can skip them during classification
    const allKnownNames = [
      ...existingNames,
      ...(deletedSkus ?? []).map((d: any) => d.name as string),
    ];

    const ebayToken = await getEbayToken();

    // Collect eBay results across all searches, deduplicate by title
    const seenTitles = new Set<string>();
    const allItems: any[] = [];

    for (const search of CATEGORY_SEARCHES) {
      const results = await searchEbayWatched(search.query, ebayToken);
      for (const item of results) {
        const key = (item.title ?? '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push({ ...item, _category_id: search.category_id });
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    // Build title → eBay listing URL map before filtering (itemWebUrl from Browse API)
    const ebayUrlByTitle = new Map<string, string>();
    for (const item of allItems) {
      if (item.title && item.itemWebUrl) {
        ebayUrlByTitle.set((item.title as string).toLowerCase().trim(), item.itemWebUrl as string);
      }
    }

    // Pre-filter: Tier 1 keywords, TCG multi-quantity, price floor, existing-SKU dedup
    const existingTokens = existingNames.map((n) =>
      n.toLowerCase().split(' ').slice(0, 2).join(' ')
    );
    const filtered: any[] = [];
    for (const item of allItems) {
      const title = item.title ?? '';
      if (!titlePassesTier1(title)) continue;

      let effectiveItem = item;

      // TCG multi-quantity: divide price by N or drop entirely
      if (item._category_id === 'tcg') {
        const { drop, divisor } = tcgMultiQty(title);
        if (drop) continue;
        if (divisor > 1) {
          const rawPrice = parseFloat(item.price?.value ?? '0');
          effectiveItem = {
            ...item,
            price: { ...item.price, value: (rawPrice / divisor).toFixed(2) },
          };
        }
      }

      const price = parseFloat(effectiveItem.price?.value ?? '0');
      if (price < 5) continue;

      const lowerTitle = title.toLowerCase();
      if (existingTokens.some((token) => lowerTitle.includes(token))) continue;

      filtered.push(effectiveItem);
    }

    // Classify with Claude in batches of 20 — accumulate token usage
    const candidates: any[] = [];
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const BATCH = 20;

    for (let i = 0; i < Math.min(filtered.length, 320); i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const { candidates: approved, inputTokens, outputTokens } = await classifyWithClaude(batch, allKnownNames);
      candidates.push(...approved);
      totalInputTokens  += inputTokens;
      totalOutputTokens += outputTokens;
      if (i + BATCH < filtered.length) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // Insert into discovery_candidates, auto-promote those meeting the threshold
    let inserted = 0;
    let autoPromoted = 0;
    let skipped = 0;

    for (const c of candidates) {
      if (!c.name) continue;

      // Skip names on the deleted-SKU blocklist (trigger also blocks the insert, but check here first)
      if (deletedNameSet.has(normalizeName(c.name))) {
        console.log(`Blocked — deleted-SKU blocklist: ${c.name}`);
        skipped++;
        continue;
      }

      const missingPopNumber = c.category_id === 'funko' && !/\[#\d+\]/i.test(c.name);
      if (missingPopNumber) {
        console.log(`Funko candidate flagged — pop# missing: ${c.name}`);
      }

      const missingTcgVariant = c.category_id === 'tcg' && !c.card_variant;
      if (missingTcgVariant) {
        console.log(`TCG candidate flagged — card_variant missing: ${c.name}`);
      }

      const meetsThreshold =
        Number(c.price_median ?? 0) >= 25 &&
        !!c.fandom_id &&
        !!c.category_id &&
        !missingTcgVariant &&
        !missingPopNumber;

      const { data, error } = await supabase
        .from('discovery_candidates')
        .insert({
          name: c.name,
          category_id: c.category_id ?? null,
          fandom_id: c.fandom_id ?? null,
          ebay_count: 0,
          reddit_mentions: 0,
          evidence_json: {
            short: c.short,
            series: c.series,
            ebay_query: c.ebay_query,
            ebay_title: c.ebay_title,
            ebay_listing_url: c.ebay_title
              ? (ebayUrlByTitle.get((c.ebay_title as string).toLowerCase().trim()) ?? null)
              : null,
            price_median: c.price_median,
            reasoning: c.reasoning,
            ...(c.category_id === 'tcg' && c.card_variant ? { card_variant: c.card_variant } : {}),
            ...(c.category_id === 'tcg' && c.card_grader  ? { card_grader:  c.card_grader  } : {}),
            ...(c.category_id === 'tcg' && c.card_grade   ? { card_grade:   c.card_grade   } : {}),
            ...(missingPopNumber ? { needs_pop_number: true } : {}),
          },
          status: 'new',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Insert candidate error:', error.message);
        skipped++;
        continue;
      }

      inserted++;

      // Upsert to product_catalog — fire and forget
      {
        const cat     = c.category_id ?? '';
        const popNum  = cat === 'funko' ? parseInt((c.name.match(/\[#(\d+)\]/)?.[1] ?? '')) : NaN;
        const vt      = cat === 'funko' ? exclusiveTypeToVariantType(c.exclusive_type) : null;
        const fp      = catalogFingerprint(cat, c.name, {
          popNumber:   !isNaN(popNum) ? popNum : null,
          variantType: vt,
          cardVariant: c.card_variant ?? null,
          cardGrader:  c.card_grader  ?? null,
          cardGrade:   c.card_grade   ?? null,
        });
        supabase.from('product_catalog').upsert({
          fingerprint:      fp,
          name:             c.name,
          short:            c.short ?? c.name.slice(0, 18),
          category_id:      cat,
          fandom_id:        c.fandom_id   ?? null,
          series:           c.series      ?? null,
          pop_number:       !isNaN(popNum) ? popNum : null,
          variant_type:     vt,
          exclusive_type:   c.exclusive_type ?? null,
          card_variant:     c.card_variant   ?? null,
          card_grader:      c.card_grader    ?? null,
          card_grade:       c.card_grade     ?? null,
          ebay_query:       c.ebay_query ?? c.name,
          price_first_seen: c.price_median ?? null,
          price_latest:     c.price_median ?? null,
          price_updated_at: new Date().toISOString(),
          source:           'discovery',
          last_seen_at:     new Date().toISOString(),
          first_seen_at:    new Date().toISOString(),
        }, { onConflict: 'fingerprint' }).then(({ error: catErr }) => {
          if (catErr) console.error(`[catalog] discovery upsert failed for "${c.name}":`, catErr.message);
        });
      }

      if (meetsThreshold) {
        const { data: result, error: promoteError } = await supabase
          .rpc('promote_candidate_to_sku', { candidate_id: data.id });

        if (promoteError) {
          console.error('Auto-promote error:', promoteError.message);
        } else if (typeof result === 'string' && !result.startsWith('ERROR')) {
          autoPromoted++;
          console.log('Auto-promoted:', result);

          // Seed narrative from Claude's reasoning
          // result format: "promoted → sku-NNN (Name)" — extract just the id
          const skuId = result.match(/sku-\d+/)?.[0];
          if (skuId && c.reasoning) {
            await supabase
              .from('sku_narratives')
              .upsert(
                { sku_id: skuId, narrative: c.reasoning },
                { onConflict: 'sku_id', ignoreDuplicates: true }
              );
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const costUsd = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);

    // Log run — non-blocking
    supabase.from('pipeline_runs').insert({
      pipeline: 'discovery-pipeline',
      duration_ms: durationMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      meta: {
        ebay_results: allItems.length,
        after_dedup: filtered.length,
        claude_approved: candidates.length,
        inserted,
        auto_promoted: autoPromoted,
        held_for_review: inserted - autoPromoted,
        skipped,
      },
    }).then(({ error: logErr }) => {
      if (logErr) console.error('Failed to log pipeline run:', logErr.message);
    });

    return new Response(
      JSON.stringify({
        ok: true,
        ebay_results: allItems.length,
        after_dedup: filtered.length,
        claude_approved: candidates.length,
        inserted,
        auto_promoted: autoPromoted,
        narratives_seeded: autoPromoted,
        held_for_review: inserted - autoPromoted,
        skipped,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: Number(costUsd.toFixed(8)),
        duration_ms: durationMs,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Discovery pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
