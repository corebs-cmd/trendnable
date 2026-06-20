// populate_stickers.js — CommonJS, uses local @supabase/supabase-js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL   = process.env.SUPABASE_URL   || '';
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const VISUAL_GUIDE = `
glowChase              – round seal "GLOW CHASE" with lightning bolt, yellow-green glow ring
glowInTheDark          – round seal "GLOWS IN THE DARK", yellow-green circle
flockedChase           – round seal "FLOCKED CHASE", pink fuzzy look
chaseGlossy            – round glossy gold seal "CHASE" bold, gold foil
chaseFlat              – round flat seal "CHASE" simple, gold/orange
specialEditionSeal     – round seal "SPECIAL EDITION" red/white circular badge
specialtySeries        – round seal "SPECIALTY SERIES" teal/blue
funkoShop              – round seal "FUNKO SHOP EXCLUSIVE" with Funko bag logo, blue
specialEditionCard     – rectangular card label "SPECIAL EDITION" blue/white
hotTopic               – rectangular "HOT TOPIC" label, HT logo, orange/black
amazon                 – rectangular "amazon exclusive" label, smile logo, orange
bam                    – rectangular "BAM!" label, red/white
boxlunch               – rectangular "BOXLUNCH EXCLUSIVE" brownish-orange
entertainmentEarth     – rectangular "ENTERTAINMENT EARTH EXCLUSIVE" yellow/black
fye                    – rectangular "FYE" label, grey/blue
galacticToys           – rectangular "GALACTIC TOYS" long label, blue
gamestop               – rectangular "ONLY AT GAMESTOP" red/white
toysrus                – rectangular "TOYSRUS" label, blue giraffe logo
walmart                – rectangular "ONLY AT WALMART" blue/yellow spark
sdcc2011               – round SDCC 2011 medallion, purple/gold
sdcc2012               – round SDCC 2012 medallion, red/yellow
sdcc2013               – round SDCC 2013 medallion, green
sdcc2016               – rectangular SDCC 2016 label, teal
sdcc2018               – rectangular SDCC 2018 label, red
sdcc2020               – rectangular SDCC 2020 label, blue/red
sdcc50                 – rectangular "SDCC 50TH ANNIVERSARY" label, blue
nycc2020               – rectangular NYCC 2020 label, red
fallConvention2022     – rectangular "FALL CONVENTION 2022" label, blue
galacticConvention2022 – rectangular "GALACTIC CONVENTION 2022" label, grey/blue
wondercon2021          – rectangular "WONDERCON 2021" label, orange
starWarsCelebration2022 – rectangular "STAR WARS CELEBRATION ANAHEIM 2022" label, silver/grey
`.trim();

const SKIP_CATEGORIES = new Set(['tcg', 'hwheels', 'hottoys', 'neca', 'popmart', 'thrilljoy', 'autographed']);

function detectFromName(name, exclusiveType) {
  const n = name.toLowerCase();
  const keys = [];

  // Retailer exclusives
  if (n.includes('hot topic'))            keys.push('hotTopic');
  if (n.includes('gamestop'))             keys.push('gamestop');
  if (n.includes('walmart'))              keys.push('walmart');
  if (n.includes(' amazon ') || n.includes('amazon gitd') || n.includes('amazon exclusive')) keys.push('amazon');
  if (n.includes('boxlunch'))             keys.push('boxlunch');
  if (n.includes('entertainment earth')) keys.push('entertainmentEarth');
  if (/\bfye\b/.test(n))                  keys.push('fye');
  if (n.includes('galactic toys'))        keys.push('galacticToys');
  if (n.includes('books-a-million') || n.includes('bam!') || /\bbam\b/.test(n)) keys.push('bam');
  if (n.includes("toys\"r\"us") || n.includes('toys r us') || n.includes('toysrus')) keys.push('toysrus');

  // Funko programs
  if (n.includes('funko shop') || n.includes('droppp')) keys.push('funkoShop');
  if (n.includes('px exclusive') || n.includes('previews exclusive')) keys.push('specialtySeries');
  if (n.includes('specialty series'))     keys.push('specialtySeries');
  if (n.includes('blue box'))             keys.push('specialEditionSeal');
  if (n.includes('freddy funko') && !keys.includes('funkoShop')) keys.push('funkoShop');

  // Convention exclusives — only tag when year matches catalog
  if (/sdcc\s*2011/.test(n))              keys.push('sdcc2011');
  if (/sdcc\s*2012/.test(n))              keys.push('sdcc2012');
  if (/sdcc\s*2013/.test(n))              keys.push('sdcc2013');
  if (/sdcc\s*2016/.test(n))              keys.push('sdcc2016');
  if (/sdcc\s*2018/.test(n))              keys.push('sdcc2018');
  if (/sdcc\s*2020/.test(n))              keys.push('sdcc2020');
  if (/sdcc\s*50|comic.con 50/.test(n))   keys.push('sdcc50');
  if (/nycc\s*2020/.test(n))              keys.push('nycc2020');
  if (n.includes('fall convention 2022')) keys.push('fallConvention2022');
  if (n.includes('galactic convention 2022')) keys.push('galacticConvention2022');
  if (n.includes('wondercon 2021'))       keys.push('wondercon2021');
  if (n.includes('star wars celebration 2022')) keys.push('starWarsCelebration2022');

  // Chase + glow logic (don't add if already have a retailer/convention sticker)
  const isGlowChase = n.includes('glow chase');
  const isFlocked   = n.includes('flocked chase') || n.includes('flocked');
  const isGitd      = n.includes('gitd') || exclusiveType === 'gitd' ||
                      (n.includes('glow') && !isGlowChase);
  const isChase     = exclusiveType === 'chase' || / chase/.test(n);

  if (isGlowChase) {
    if (!keys.includes('glowChase')) keys.push('glowChase');
  } else if (isFlocked) {
    if (!keys.includes('flockedChase')) keys.push('flockedChase');
  } else {
    if (isChase && !keys.some(k => k.toLowerCase().includes('chase'))) keys.push('chaseFlat');
    if (isGitd && !keys.includes('glowChase')) keys.push('glowInTheDark');
  }

  return [...new Set(keys)].slice(0, 3);
}

function isSignedOnly(name) {
  const n = name.toLowerCase();
  const hasExclusiveSignal = detectFromName(name, null).length > 0;
  const isSigned = / signed/.test(n) || /signed by/.test(n);
  return isSigned && !hasExclusiveSignal;
}

async function detectWithVision(sku) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: sku.image_url } },
          { type: 'text', text: `Product: "${sku.name}" (Funko Pop)

Identify which exclusive sticker labels are VISIBLE on the box in this image. Look for stickers on the outside of the packaging. Return ONLY JSON: {"keys":["key1"],"reasoning":"brief"}

Sticker guide:
${VISUAL_GUIDE}

Max 3 keys. Empty array if nothing clearly visible.` }
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const text = (body.content?.[0]?.text ?? '').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { keys: [], reasoning: 'no JSON' };
  const parsed = JSON.parse(m[0]);
  return { keys: (parsed.keys ?? []).slice(0, 3), reasoning: parsed.reasoning ?? '' };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { data: skus, error } = await supabase
    .from('skus')
    .select('id, name, category_id, exclusive_type, image_url, sticker_keys')
    .eq('is_active', true)
    .order('id');

  if (error) { console.error('DB error:', error.message); process.exit(1); }
  console.log(`Loaded ${skus.length} active SKUs\n`);

  const updates   = [];
  const needVision = [];
  const counts = { det: 0, skip: 0, none: 0 };

  for (const sku of skus) {
    if (sku.sticker_keys?.length > 0) {
      console.log(`SKIP already tagged   ${sku.id} | ${sku.name.slice(0,55)}`);
      counts.skip++; continue;
    }
    if (SKIP_CATEGORIES.has(sku.category_id)) {
      console.log(`SKIP ${sku.category_id.padEnd(13)} ${sku.id} | ${sku.name.slice(0,55)}`);
      counts.skip++; continue;
    }
    if (isSignedOnly(sku.name)) {
      console.log(`SKIP signed-only      ${sku.id} | ${sku.name.slice(0,55)}`);
      counts.skip++; continue;
    }

    const keys = detectFromName(sku.name, sku.exclusive_type);

    if (keys.length > 0) {
      const pad = keys.join(', ').padEnd(42);
      console.log(`DET  [${pad}] ${sku.id} | ${sku.name.slice(0,50)}`);
      updates.push({ id: sku.id, keys, method: 'det' });
      counts.det++;
    } else if (sku.category_id === 'funko' && sku.image_url) {
      needVision.push(sku);
    } else {
      console.log(`NONE                  ${sku.id} | ${sku.name.slice(0,55)}`);
      counts.none++;
    }
  }

  console.log(`\n── Vision queue: ${needVision.length} Funko Pops ──`);
  for (const s of needVision) console.log(`  ${s.id} | ${s.name.slice(0,70)}`);
  console.log('');

  let vFound = 0, vEmpty = 0;
  for (const sku of needVision) {
    process.stdout.write(`VIS  ${sku.id} | ${sku.name.slice(0,50).padEnd(52)} … `);
    try {
      await sleep(900);
      const { keys, reasoning } = await detectWithVision(sku);
      if (keys.length > 0) {
        process.stdout.write(`[${keys.join(', ')}]\n    "${reasoning.slice(0,80)}"\n`);
        updates.push({ id: sku.id, keys, method: 'vision' });
        vFound++;
      } else {
        process.stdout.write(`(none) "${reasoning.slice(0,70)}"\n`);
        vEmpty++;
      }
    } catch (e) {
      process.stdout.write(`ERR: ${e.message.slice(0,60)}\n`);
    }
  }

  console.log(`\n── Saving ${updates.length} records to DB… ──`);
  let saved = 0;
  for (const u of updates) {
    const { error: e } = await supabase.from('skus').update({ sticker_keys: u.keys }).eq('id', u.id);
    if (e) console.log(`  FAIL ${u.id}: ${e.message}`);
    else saved++;
  }

  console.log(`\n═══════════════════════════════`);
  console.log(`  Deterministic tagged: ${counts.det}`);
  console.log(`  Vision found:         ${vFound}`);
  console.log(`  Vision empty:         ${vEmpty}`);
  console.log(`  Skipped (no sticker): ${counts.none}`);
  console.log(`  Skipped (category):   ${counts.skip}`);
  console.log(`  Saved to DB:          ${saved}`);
  console.log(`═══════════════════════════════`);
}

main().catch(e => { console.error(e); process.exit(1); });
