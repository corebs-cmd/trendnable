// Trendnable Funko Pipeline
// Dedicated discovery pipeline for Funko Pop collectibles.
// More targeted queries and a Funko-only Claude prompt to improve
// Pop number accuracy and catch exclusive/chase/GITD finds.
// Feeds the same discovery_candidates table so the hot pipeline picks up promoted SKUs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titlePassesTier1 } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PIPELINE_SECRET           = Deno.env.get('PIPELINE_SECRET') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// 18 targeted searches — exclusives, grails, rare variants, and fandom-specific
const FUNKO_SEARCHES = [
  // Exclusivity & chase
  'Funko Pop chase exclusive GITD limited edition',
  'Funko Pop SDCC NYCC convention exclusive 2024 2025',
  'Funko Pop GameStop exclusive limited edition',
  'Funko Pop Target Walmart Hot Topic BoxLunch exclusive',
  // Grails & rare finds
  'Funko Pop grail rare HTF vaulted retired',
  'Funko Pop vaulted discontinued retired out of print',
  'Funko Pop metallic flocked glow holographic chrome rare',
  'Funko Pop signed autographed certificate authenticity',
  'Funko Pop diamond chrome translucent pearlescent rare',
  'Funko Pop 1000 pcs limited sticker rare',
  // Fandom grails & exclusives
  'Funko Pop One Piece rare exclusive chase grail',
  'Funko Pop Demon Slayer rare exclusive chase grail',
  'Funko Pop anime MHA My Hero Academia JJK Naruto Dragon Ball rare exclusive',
  'Funko Pop TMNT Teenage Mutant Ninja Turtles rare exclusive',
  'Funko Pop horror rare exclusive Halloween vaulted',
  'Funko Pop Marvel rare exclusive chase variant grail',
  'Funko Pop Disney rare exclusive vaulted retired',
  'Funko Pop Star Wars rare exclusive variant grail',
  'Funko Pop Pokemon rare exclusive grail',
  'Funko Pop DC rare exclusive variant chase',
  'Funko Pop Stranger Things exclusive rare grail',
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
  const FANDOMS = 'onepiece (One Piece only), demon (Demon Slayer only), starwars, pokemon, marvel, anime (My Hero Academia/MHA, Jujutsu Kaisen/JJK, Naruto, Dragon Ball/DBZ, Attack on Titan, Bleach, or any other anime not covered by onepiece/demon), labubu, disney, jjk (Jujutsu Kaisen), dc, gaming, tmnt (Teenage Mutant Ninja Turtles — use for any TMNT/Ninja Turtles Funko Pop), popcult (Pop Culture: Stranger Things, Terminator, RoboCop, Ghostbusters, Back to the Future, Alien, Predator, Halloween, Friday 13th, Nightmare on Elm Street, IT, any horror franchise, cult classics, movies & shows)';

  const prompt = `You are a Funko Pop grail specialist and price tracker. Evaluate these eBay listings to find specific, trackable Funko Pop figures worth monitoring — including exclusives, rare variants, and community grails.

ALREADY TRACKED (skip): ${existingNames.slice(0, 60).join(' | ')}

KNOWN FANDOMS: ${FANDOMS}

━━ WHAT TO APPROVE ━━

APPROVE if the listing is a single specific Funko Pop AND matches at least one of these rarity signals:

EXCLUSIVES
- Retailer exclusives: GameStop, Target, Walmart, Hot Topic, BoxLunch, FYE, Amazon, Walgreens, Barnes & Noble
- Convention exclusives: SDCC, NYCC, ECCC, C2E2, FunkonatiCon, Emerald City, WonderCon, D23

CHASE & VARIANTS
- Chase variant (sticker or title says "chase")
- GITD — Glow in the Dark variant
- Metallic finish
- Flocked (fuzzy texture)
- Holographic
- Chrome / diamond / translucent / pearlescent / jeweled
- Signed or autographed (with or without COA)

GRAILS & HARD TO FIND
- Vaulted, retired, or discontinued — no longer produced, drives secondary market prices up
- HTF (Hard to Find) or out of print
- Limited print run — listings mentioning "1000 pcs", "LE500", stickered quantity limits
- Price signal: if the listing is $75 or more for a single figure it is almost certainly rare or a grail — approve it
- Community-recognized grails: figures the Funko community widely considers rare trophies even if the listing doesn't use the word "grail"

━━ MANDATORY RULES ━━

⚠️ POP NUMBER IS MANDATORY — You MUST extract the Pop number from the title (e.g. #1578, #472, or bare number 1578). If no Pop number is anywhere in the title, REJECT. Never guess or invent a number.

REJECT if:
- No Pop number visible in the title
- A lot, bundle, multi-pack, or mystery box
- Bootleg, knock-off, or custom (not official Funko)
- Common mass-market figure with no rarity signal and price under $30

━━ OUTPUT FORMAT ━━

For each APPROVED item return:
- name: "Character Name [#XXXX]" — canonical name ending with Pop number in [#XXXX] format
- short: nickname max 18 chars
- series: product line (e.g. "Funko Pop · Marvel #1234")
- fandom_id: best match from known fandoms or null
- ebay_query: search string including bare Pop number + rarity keyword (e.g. "Funko Pop Luffy 1583 chase GITD")
- ebay_title: original listing title verbatim
- price_median: listing price as a number
- reasoning: one sentence on why this is worth tracking — cite the specific rarity signal
- exclusive_type: one of "chase" | "gitd" | "convention" | "retailer" | "vaulted" | "grail" | "rare_variant" | "signed" | "limited" | "htf" | null

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
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Load existing Funko names + pop numbers + deleted SKU blocklist
    const [{ data: existingSkus }, { data: existingCandidates }, { data: deletedSkus }] = await Promise.all([
      supabase.from('skus').select('name, pop_number').eq('category_id', 'funko'),
      supabase.from('discovery_candidates').select('name').eq('category_id', 'funko').in('status', ['new', 'approved', 'rejected']),
      supabase.from('deleted_skus').select('name'),
    ]);
    const existingNames: string[] = [
      ...(existingSkus ?? []).map((s: any) => s.name as string),
      ...(existingCandidates ?? []).map((c: any) => c.name as string),
    ];
    // Blocklist for post-Claude name filter (exact, case-insensitive)
    const deletedNameSet = new Set<string>(
      (deletedSkus ?? []).map((d: any) => (d.name as string).toLowerCase())
    );
    // Include deleted names in the Claude "ALREADY TRACKED" list
    const allKnownNames = [
      ...existingNames,
      ...(deletedSkus ?? []).map((d: any) => d.name as string),
    ];
    // Set of pop numbers already tracked — used to skip same-number variants
    const existingPopNumbers = new Set<number>(
      (existingSkus ?? []).map((s: any) => s.pop_number).filter(Boolean)
    );

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

    // Pre-filter: Tier 1 keywords, price floor, existing-name dedup, existing pop-number dedup
    const existingTokens = existingNames.map((n) =>
      n.toLowerCase().replace(/\[#\d+\]/g, '').trim().split(' ').slice(0, 3).join(' ')
    );
    const filtered = allItems.filter((item) => {
      const title = item.title ?? '';
      if (!titlePassesTier1(title)) return false;
      const price = parseFloat(item.price?.value ?? '0');
      if (price < 5) return false;
      const lowerTitle = title.toLowerCase();
      if (existingTokens.some((token) => token.length > 4 && lowerTitle.includes(token))) return false;
      const popMatch = lowerTitle.match(/#?(\d{3,5})\b/);
      if (popMatch) {
        const n = parseInt(popMatch[1]);
        if (existingPopNumbers.has(n)) return false;
      }
      return true;
    });

    // Classify with Claude in batches of 20
    const candidates: any[] = [];
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const BATCH = 20;

    for (let i = 0; i < Math.min(filtered.length, 500); i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const { candidates: approved, inputTokens, outputTokens } = await classifyWithClaude(batch, allKnownNames);
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
    // Track pop numbers seen in this batch to prevent within-batch duplicates
    const batchPopNumbers = new Set<number>(existingPopNumbers);

    for (const c of candidates) {
      if (!c.name) continue;

      // Skip names on the deleted-SKU blocklist
      if (deletedNameSet.has(c.name.toLowerCase())) {
        console.log(`Blocked — deleted-SKU blocklist: ${c.name}`);
        rejected++;
        continue;
      }

      // Hard validation — Pop number must be present
      const popMatch = c.name.match(/\[#(\d+)\]/i);
      if (!popMatch) {
        console.log(`Rejected — no Pop number in name: ${c.name}`);
        rejected++;
        continue;
      }

      // Reject if this Pop number is already tracked (existing SKU or earlier in this batch)
      const popNum = parseInt(popMatch[1]);
      if (batchPopNumbers.has(popNum)) {
        console.log(`Rejected — duplicate Pop number #${popNum}: ${c.name}`);
        rejected++;
        continue;
      }
      batchPopNumbers.add(popNum);

      const meetsThreshold = Number(c.price_median ?? 0) >= 20 && !!c.fandom_id;

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
