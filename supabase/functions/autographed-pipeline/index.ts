// Trendnable Autographed Pipeline
// Discovery pipeline for signed & autographed collectibles across all media:
// sports cards, jerseys, photos, comics, Funko Pops, music memorabilia, etc.
// Requires verifiable authentication (JSA, Beckett, PSA, SGC, COA).
//
// Diverse search queries ensure the Autographed category is balanced — NOT
// dominated by any one item type. Feeds discovery_candidates with category_id='autographed'.


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { catalogFingerprint, tokenOverlapFraction } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// Diverse searches across collectible types. Trimmed to 12 queries to keep
// the function under Supabase's edge function wall-time limit while still
// hitting every major item category. Authentication keywords (JSA/Beckett/PSA/COA)
// are required in every title via the post-filter regex.
const AUTOGRAPHED_SEARCHES = [
  // Sports cards (highest volume — 3 queries)
  'signed autographed sports card PSA DNA authenticated',
  'autographed baseball basketball football card signed PSA Beckett rookie',
  'autographed Pokemon trading card PSA DNA signed authenticated',

  // Sports memorabilia (2 queries)
  'signed jersey autographed JSA Beckett authenticated',
  'autographed photo baseball basketball football signed JSA Beckett COA',

  // Entertainment (2 queries)
  'signed actor musician Hollywood autograph photo JSA Beckett COA',
  'signed anime voice actor autograph COA authenticated',

  // Comics (1 query)
  'signed autographed comic CGC SS CBCS signature series',

  // Film & TV franchises (2 queries)
  'signed Star Wars Marvel autograph cast COA Beckett authenticated',
  'signed horror cult autograph COA Beckett authenticated',

  // Funko Pops (1 query — intentionally minimal so category 25% cap rarely binds)
  'signed Funko Pop autographed JSA Beckett COA PSA authenticated',
];

const MAX_ITEMS_FOR_CLAUDE = 200; // was 500 — cap so total Claude batches stay under 10

const AUTHENTICATORS = /\b(jsa|beckett|bgs|psa(\/dna|\s*auth|\s*dna)?|sgc|coa|cgc\s*(ss|signature\s*series)?|cbcs|certificate\s+of\s+authenticity|upper\s+deck\s+authent|fanatics\s+authentic|tristar|hollywood\s+show)\b/i;

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
  url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');
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

// ── Claude classification — Autographed-only prompt ───────────────────────────

async function classifyWithClaude(
  items: any[],
  existingNames: string[]
): Promise<{ candidates: any[]; inputTokens: number; outputTokens: number }> {
  const FANDOMS = 'onepiece (One Piece only), demon (Demon Slayer only), starwars, pokemon, marvel, anime (My Hero Academia/MHA, Jujutsu Kaisen/JJK, Naruto, Dragon Ball/DBZ, Attack on Titan, Bleach, or any other anime not covered by onepiece/demon), labubu, disney, dc, gaming, tmnt, popcult (Pop Culture: Stranger Things, Terminator, RoboCop, Ghostbusters, Back to the Future, Alien, Predator, Halloween, Friday 13th, Nightmare on Elm Street, IT, any horror franchise, cult classics, movies & shows), sports (sports memorabilia: baseball/basketball/football/hockey/soccer)';

  const prompt = `You are a signed-collectibles authenticator and price-tracking specialist. Evaluate these eBay listings to find SPECIFIC signed/autographed collectibles worth monitoring for resale value.

ALREADY TRACKED (skip): ${existingNames.slice(0, 60).join(' | ')}

KNOWN FANDOMS: ${FANDOMS}

━━ WHAT TO APPROVE ━━

APPROVE if the listing is a single specific signed collectible AND all of these:

1. AUTHENTICATION is explicit and verifiable. Look for one or more of:
   - JSA, Beckett (BGS), PSA, PSA/DNA, SGC, CGC SS / CGC Signature Series, CBCS
   - "COA" or "Certificate of Authenticity" from a recognized authenticator
   - Upper Deck Authenticated, Fanatics Authentic, Tristar, Hollywood Show
   REJECT if authentication is "guaranteed by seller", "pre-print", "stamp signature", "auto-pen", or unverifiable.

2. SPECIFIC ITEM — a named person signed a specific named item. Not lots, mystery boxes, multi-signed team balls (unless every signer is famous).

3. RESALE-WORTHY — $50 floor for cards/photos, $100+ for jerseys/balls/figures. Cheap signed items don't track well.

━━ ITEM TYPES (in order of market volume — keep balanced) ━━

- SPORTS CARDS — signed/auto rookie cards, vintage, modern
- SPORTS MEMORABILIA — jerseys, balls, photos, bats
- ENTERTAINMENT PHOTOS — actor/musician 8x10 signed
- COMICS — CGC SS, CBCS signature, key issues signed by creators
- TRADING CARDS — signed Pokemon, MTG, gaming
- FILM/TV MERCH — Star Wars, Marvel, horror franchise signed items
- SIGNED FUNKO POPS — keep these to a SMALL share (no more than ~20% of approvals)

If many signed Funko Pops appear in this batch, be selective — approve only the ones with clear rarity (convention exclusive + signed by character voice actor, etc.).

━━ MANDATORY RULES ━━

⚠️ AUTHENTICATION REQUIRED — Reject anything without a recognized authenticator name in the title.
⚠️ NO LOTS, BUNDLES, MYSTERY BOXES, or pre-print "signature stamps."
⚠️ FOR FUNKO POPS — extract the Pop number into the name. Format: "Character Name [#XXXX] SIGNED"

━━ OUTPUT FORMAT ━━

For each APPROVED item return a JSON object:
- name: canonical name. For Funkos: "Character Name [#XXXX] SIGNED". For cards: "Player Year Set Card Name SIGNED" (e.g. "Tom Brady 2000 Rookie Bowman Chrome SIGNED"). For memorabilia: "Person Item Year SIGNED" (e.g. "Michael Jordan 1996 Bulls Jersey SIGNED"). Keep names concise.
- short: nickname max 18 chars
- series: type + authenticator (e.g. "Funko Pop · JSA Auth", "Topps Rookie · PSA Auth", "Signed Photo · Beckett Auth")
- category_id: ALWAYS "autographed"
- item_type: one of "card" | "memorabilia" | "photo" | "comic" | "funko" | "jersey" | "other"
- fandom_id: best match from known fandoms or null
- ebay_query: search string including signer + item + authenticator (e.g. "Tom Brady 2000 Bowman PSA Auth rookie")
- ebay_title: original listing title verbatim
- price_median: listing price as a number
- reasoning: one sentence on why this is worth tracking — cite the signer + authenticator
- authenticator: which authenticator handled it (JSA, Beckett, PSA, SGC, CGC, CBCS, COA, other)

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

Deno.serve(async (req) => {
  const startTime = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Load existing autographed names + deleted SKU blocklist
    const [{ data: existingSkus }, { data: existingCandidates }, { data: deletedSkus }] = await Promise.all([
      supabase.from('skus').select('name').eq('category_id', 'autographed'),
      supabase.from('discovery_candidates').select('name').eq('category_id', 'autographed').in('status', ['new', 'approved', 'rejected']),
      supabase.from('deleted_skus').select('name'),
    ]);
    const existingNames: string[] = [
      ...(existingSkus ?? []).map((s: any) => s.name as string),
      ...(existingCandidates ?? []).map((c: any) => c.name as string),
    ];
    const deletedNameSet = new Set<string>(
      (deletedSkus ?? []).map((d: any) => (d.name as string).toLowerCase())
    );
    const allKnownNames = [
      ...existingNames,
      ...(deletedSkus ?? []).map((d: any) => d.name as string),
    ];

    const ebayToken = await getEbayToken();

    // Collect eBay results in parallel, deduplicate by title
    const seenTitles = new Set<string>();
    const allItems: any[] = [];

    const searchResults = await Promise.all(AUTOGRAPHED_SEARCHES.map((q) => searchEbayWatched(q, ebayToken)));
    for (const results of searchResults) {
      for (const item of results) {
        const key = (item.title ?? '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push(item);
        }
      }
    }

    // Build title → eBay URL map
    const ebayUrlByTitle = new Map<string, string>();
    for (const item of allItems) {
      if (item.title && item.itemWebUrl) {
        ebayUrlByTitle.set((item.title as string).toLowerCase().trim(), item.itemWebUrl as string);
      }
    }

    // Pre-filter: require authentication keyword in title + price floor + dedup
    const filtered = allItems.filter((item) => {
      const title = item.title ?? '';
      if (!AUTHENTICATORS.test(title)) return false;
      const price = parseFloat(item.price?.value ?? '0');
      if (price < 50) return false;
      if (existingNames.some((existing) => tokenOverlapFraction(title, existing) >= 0.65)) return false;
      return true;
    });

    // Classify with Claude in batches of 40 to reduce API calls
    const candidates: any[] = [];
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const BATCH = 40;

    for (let i = 0; i < Math.min(filtered.length, MAX_ITEMS_FOR_CLAUDE); i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const { candidates: approved, inputTokens, outputTokens } = await classifyWithClaude(batch, allKnownNames);
      candidates.push(...approved);
      totalInputTokens  += inputTokens;
      totalOutputTokens += outputTokens;
      if (i + BATCH < filtered.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Insert candidates — enforce diversity cap so signed Funkos can't dominate
    const FUNKO_SHARE_CAP = 0.25; // max 25% of inserts may be signed Funkos
    let inserted = 0;
    let autoPromoted = 0;
    let rejected = 0;
    let funkoInserted = 0;
    const insertedNames = new Set<string>();

    for (const c of candidates) {
      if (!c.name) continue;

      // Block deleted-SKU names
      if (deletedNameSet.has(c.name.toLowerCase())) {
        console.log(`Blocked — deleted-SKU blocklist: ${c.name}`);
        rejected++;
        continue;
      }

      // Within-batch dedup by name
      if (insertedNames.has(c.name.toLowerCase())) {
        console.log(`Rejected — duplicate name in batch: ${c.name}`);
        rejected++;
        continue;
      }

      // Diversity guard — cap signed Funkos at FUNKO_SHARE_CAP of total inserts.
      // If we've already inserted enough and this is another Funko, skip it.
      const isFunko = c.item_type === 'funko' || /\[#\d+\]/.test(c.name);
      if (isFunko && inserted > 0) {
        const currentFunkoShare = funkoInserted / inserted;
        if (currentFunkoShare >= FUNKO_SHARE_CAP) {
          console.log(`Rejected — Funko share cap (${Math.round(FUNKO_SHARE_CAP * 100)}%) reached: ${c.name}`);
          rejected++;
          continue;
        }
      }

      const meetsThreshold = Number(c.price_median ?? 0) >= 50;

      const { data, error } = await supabase
        .from('discovery_candidates')
        .insert({
          name:        c.name,
          category_id: 'autographed',
          fandom_id:   c.fandom_id ?? null,
          ebay_count:  0,
          reddit_mentions: 0,
          evidence_json: {
            short:            c.short,
            series:           c.series,
            ebay_query:       c.ebay_query,
            ebay_title:       c.ebay_title,
            ebay_listing_url: c.ebay_title
              ? (ebayUrlByTitle.get((c.ebay_title as string).toLowerCase().trim()) ?? null)
              : null,
            price_median:     c.price_median,
            reasoning:        c.reasoning,
            item_type:        c.item_type ?? null,
            authenticator:    c.authenticator ?? null,
          },
          status: 'new',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Insert error:', error.message);
        continue;
      }

      insertedNames.add(c.name.toLowerCase());
      inserted++;
      if (isFunko) funkoInserted++;

      // Upsert to product_catalog
      const fp = catalogFingerprint('autographed', c.name, {});
      supabase.from('product_catalog').upsert({
        fingerprint:      fp,
        name:             c.name,
        short:            c.short ?? c.name.slice(0, 18),
        category_id:      'autographed',
        fandom_id:        c.fandom_id ?? null,
        series:           c.series    ?? null,
        ebay_query:       c.ebay_query ?? c.name,
        price_first_seen: c.price_median ?? null,
        price_latest:     c.price_median ?? null,
        price_updated_at: new Date().toISOString(),
        source:           'autographed',
        last_seen_at:     new Date().toISOString(),
        first_seen_at:    new Date().toISOString(),
      }, { onConflict: 'fingerprint' }).then(({ error: catErr }) => {
        if (catErr) console.error(`[catalog] autographed upsert failed for "${c.name}":`, catErr.message);
      });

      // Auto-promote if it clears the value threshold
      if (meetsThreshold) {
        const { data: result, error: promoteError } = await supabase
          .rpc('promote_candidate_to_sku', { candidate_id: data.id });

        if (promoteError) {
          console.error('Auto-promote error:', promoteError.message);
        } else if (typeof result === 'string' && result.startsWith('ERROR')) {
          console.log('Auto-promote rejected by gate:', result);
        } else if (typeof result === 'string') {
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
      pipeline: 'autographed-pipeline',
      duration_ms: durationMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      meta: {
        ebay_results:    allItems.length,
        after_dedup:     filtered.length,
        claude_approved: candidates.length,
        rejected,
        inserted,
        funko_inserted:  funkoInserted,
        funko_share_pct: inserted > 0 ? Math.round((funkoInserted / inserted) * 100) : 0,
        auto_promoted:   autoPromoted,
        held_for_review: inserted - autoPromoted,
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
        rejected,
        inserted,
        funko_inserted:   funkoInserted,
        funko_share_pct:  inserted > 0 ? Math.round((funkoInserted / inserted) * 100) : 0,
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
    console.error('Autographed pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
