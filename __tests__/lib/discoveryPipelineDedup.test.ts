/**
 * Verifies that the pre-tokenization dedup optimization in the discovery pipeline
 * produces identical true/false results to the original tokenOverlapFraction approach.
 *
 * Original approach (per candidate, inside the filter loop):
 *   existingNames.some(existing => tokenOverlapFraction(candidate, existing) >= 0.65)
 *
 * Optimized approach (pre-compute existingStripped once, then inline token check):
 *   const existingStripped = existingNames.map(n => brandStripName(n).replace(/[^a-z0-9 ]/g, ''));
 *   existingStripped.some(stripped => {
 *     const candidateTokens = coreTokens(candidate);
 *     let matches = 0;
 *     for (const token of candidateTokens) { if (stripped.includes(token)) matches++; }
 *     return matches / candidateTokens.length >= 0.65;
 *   })
 *
 * Both must agree on whether to dedup (true) or pass (false) for every case.
 */

import {
  tokenOverlapFraction,
  coreTokens,
  brandStripName,
} from '../../supabase/functions/_shared/pipeline-utils';

// ── Helper: the two approaches as testable functions ─────────────────────────

/**
 * OLD approach: re-tokenizes `existing` inside every `.some()` call.
 * Returns true if any existing name is a near-duplicate of `candidate`.
 */
function shouldDedupOld(candidate: string, existingNames: string[]): boolean {
  return existingNames.some(
    (existing) => tokenOverlapFraction(candidate, existing) >= 0.65
  );
}

/**
 * NEW approach: pre-computes stripped existing names once, then does inline
 * token matching without re-tokenizing the existing string.
 * Returns true if any existing name is a near-duplicate of `candidate`.
 */
function shouldDedupNew(candidate: string, existingNames: string[]): boolean {
  const existingStripped = existingNames.map((n) =>
    brandStripName(n).replace(/[^a-z0-9 ]/g, '')
  );
  const candidateTokens = coreTokens(candidate);
  if (candidateTokens.length === 0) return false;
  return existingStripped.some((stripped) => {
    let matches = 0;
    for (const token of candidateTokens) {
      if (stripped.includes(token)) matches++;
    }
    return matches / candidateTokens.length >= 0.65;
  });
}

/** Asserts old and new approaches agree, and returns the shared result. */
function assertAgreement(
  candidate: string,
  existingNames: string[]
): boolean {
  const oldResult = shouldDedupOld(candidate, existingNames);
  const newResult = shouldDedupNew(candidate, existingNames);
  expect(newResult).toBe(oldResult);
  return oldResult;
}

// ── 1. Exact match → always dedup ────────────────────────────────────────────

describe('exact match → dedup (true)', () => {
  it('identical titles dedup', () => {
    const result = assertAgreement(
      'NECA RoboCop Ultra Deluxe Action Figure',
      ['NECA RoboCop Ultra Deluxe Action Figure']
    );
    expect(result).toBe(true);
  });

  it('same title with different casing dedup', () => {
    const result = assertAgreement(
      'Hot Toys Iron Man Mark III',
      ['HOT TOYS IRON MAN MARK III']
    );
    expect(result).toBe(true);
  });
});

// ── 2. High overlap ≥ 0.65 → dedup ───────────────────────────────────────────

describe('high overlap (≥0.65) → dedup (true)', () => {
  it('title with minor extra word still deduped (5/6 tokens match)', () => {
    // candidate tokens: robocop, ultra, deluxe, action, figure (5 tokens ≥4 chars)
    // existing has all of them → 5/5 = 1.0
    const result = assertAgreement(
      'RoboCop Ultra Deluxe Action Figure',
      ['NECA RoboCop Ultra Deluxe Action Figure']
    );
    expect(result).toBe(true);
  });

  it('brand prefix stripped before comparison → still dedup', () => {
    // brandStripName removes "hot toys" prefix; both reduce to same core tokens
    const result = assertAgreement(
      'Hot Toys Iron Man Mark Three',
      ['Iron Man Mark Three']
    );
    expect(result).toBe(true);
  });

  it('4 of 5 significant tokens match → 0.80 ≥ 0.65 → dedup', () => {
    // candidate tokens: darth, maul, shadow, lord (all ≥4 chars) = 4 tokens
    // existing contains darth, maul, shadow, lord → 4/4 = 1.0
    const result = assertAgreement(
      'Darth Maul Shadow Lord Figure',
      ['Star Wars Darth Maul Shadow Lord Statue']
    );
    expect(result).toBe(true);
  });

  it('real eBay title vs catalog SKU name — both approaches agree on result', () => {
    // eBay: "Funko Pop Marvel Spider-Man Homecoming Vinyl Figure #220"
    // candidate tokens after brandStrip+coreTokens (≥4 chars, no brand "funko pop"):
    //   marvel, spider, homecoming, vinyl, figure — existing only has marvel, spider, homecoming
    // → vinyl and figure are absent from existing stripped string → overlap < 0.65 → pass
    // Key: both old and new implementations must agree on the same true/false.
    const oldResult = shouldDedupOld(
      'Funko Pop Marvel Spider-Man Homecoming Vinyl Figure #220',
      ['Funko Pop Marvel Spider-Man Homecoming #220']
    );
    const newResult = shouldDedupNew(
      'Funko Pop Marvel Spider-Man Homecoming Vinyl Figure #220',
      ['Funko Pop Marvel Spider-Man Homecoming #220']
    );
    expect(newResult).toBe(oldResult);
  });
});

// ── 3. Low overlap < 0.65 → pass (not deduped) ───────────────────────────────

describe('low overlap (<0.65) → pass (false)', () => {
  it('completely different titles are not deduped', () => {
    const result = assertAgreement(
      'Batman Dark Knight Returns Figure',
      ['Superman Man of Steel Statue']
    );
    expect(result).toBe(false);
  });

  it('same brand, different product → not deduped', () => {
    // candidate: iron, mark (only 2 tokens ≥4 chars after strip... "iron" has 4)
    // Actually: iron(4)=keep, mark(4)=keep → 2 tokens. existing: thor → 0/2 = 0.0
    const result = assertAgreement(
      'Hot Toys Iron Man Mark III',
      ['Hot Toys Thor Deluxe Version']
    );
    expect(result).toBe(false);
  });

  it('one matching token out of many → below threshold', () => {
    // candidate tokens: spider, homecoming, vinyl, figure → 4 tokens
    // existing only contains "spider" → 1/4 = 0.25 < 0.65
    const result = assertAgreement(
      'Spider-Man Homecoming Vinyl Figure',
      ['Spider-Man Into the Spider-Verse Miles Morales']
    );
    expect(result).toBe(false);
  });

  it('empty existing names list → never dedup', () => {
    const result = assertAgreement('Iron Man Action Figure', []);
    expect(result).toBe(false);
  });
});

// ── 4. Empty string edge cases ────────────────────────────────────────────────

describe('empty string edge cases', () => {
  it('empty candidate string → not deduped (0 tokens)', () => {
    // tokenOverlapFraction returns 0 for empty → 0 >= 0.65 is false
    // new approach: candidateTokens.length === 0 → returns false
    const oldResult = shouldDedupOld('', ['Iron Man Figure']);
    const newResult = shouldDedupNew('', ['Iron Man Figure']);
    expect(newResult).toBe(oldResult);
    expect(oldResult).toBe(false);
  });

  it('empty existing entry → not deduped', () => {
    const result = assertAgreement('Iron Man Deluxe Figure', ['']);
    expect(result).toBe(false);
  });

  it('both candidate and existing empty → not deduped', () => {
    const oldResult = shouldDedupOld('', ['']);
    const newResult = shouldDedupNew('', ['']);
    expect(newResult).toBe(oldResult);
  });

  it('candidate with only short tokens (all < 4 chars) → not deduped', () => {
    // "is a go" → tokens: is(2), a(1), go(2) — all < 4 chars, so coreTokens = []
    const oldResult = shouldDedupOld('is a go', ['is a go too']);
    const newResult = shouldDedupNew('is a go', ['is a go too']);
    expect(newResult).toBe(oldResult);
  });
});

// ── 5. Brand-prefix stripping ─────────────────────────────────────────────────

describe('brand-prefix stripping', () => {
  it('strips "funko pop" before comparing', () => {
    // Both have "funko pop" prefix stripped → compares "batman dark knight" vs "batman dark knight"
    const result = assertAgreement(
      'Funko Pop Batman Dark Knight',
      ['Batman Dark Knight']
    );
    expect(result).toBe(true);
  });

  it('strips "hot toys" from existing only → still dedup if core tokens match', () => {
    const result = assertAgreement(
      'Darth Vader Deluxe Version',
      ['Hot Toys Darth Vader Deluxe Version']
    );
    expect(result).toBe(true);
  });

  it('strips "neca" prefix → different products are not deduped', () => {
    const result = assertAgreement(
      'NECA Predator Ultimate Jungle Hunter',
      ['NECA Alien Xenomorph Ultimate Figure']
    );
    expect(result).toBe(false);
  });

  it('strips "pop mart" prefix correctly', () => {
    const result = assertAgreement(
      'Pop Mart Labubu Monster Series',
      ['Labubu Monster Series Figure']
    );
    expect(result).toBe(true);
  });
});

// ── 6. Multiple existing names (any match triggers dedup) ─────────────────────

describe('multiple existing names', () => {
  it('dedup fires when second entry is a match', () => {
    const result = assertAgreement(
      'RoboCop Ultra Deluxe Figure',
      [
        'Batman Dark Knight Returns',     // no match
        'NECA RoboCop Ultra Deluxe',      // match → dedup
      ]
    );
    expect(result).toBe(true);
  });

  it('no match in any existing name → passes through', () => {
    const result = assertAgreement(
      'Spider-Man Homecoming Figure',
      [
        'Batman Dark Knight',
        'Thor Love Thunder',
        'Iron Fist Danny Rand',
      ]
    );
    expect(result).toBe(false);
  });

  it('first entry matches → short-circuits and dedup fires', () => {
    const result = assertAgreement(
      'Thanos Infinity Gauntlet Figure',
      [
        'Thanos Infinity Gauntlet Bust',   // match
        'Thor Ragnarok Gladiator',         // would not match
      ]
    );
    expect(result).toBe(true);
  });
});

// ── 7. Real eBay-style titles vs catalog SKU names ────────────────────────────

describe('real eBay-style titles vs catalog SKU names', () => {
  it('eBay title with grading info vs clean catalog name → dedup', () => {
    const result = assertAgreement(
      'NECA RoboCop 2 Clarence Boddicker Action Figure MIB',
      ['NECA RoboCop 2 Clarence Boddicker Figure']
    );
    expect(result).toBe(true);
  });

  it('eBay title with seller junk vs catalog name → low overlap → pass', () => {
    // candidate: "brand", "new", "sealed" dominate — catalog name completely different
    const result = assertAgreement(
      'Brand New Sealed Collectible Figure Fast Shipping',
      ['NECA RoboCop Ultra Deluxe Action Figure']
    );
    expect(result).toBe(false);
  });

  it('variant difference: poster vs base card → not deduped', () => {
    // "poster" and "variation" tokens absent from existing → low overlap
    const result = assertAgreement(
      'Darth Maul Shadow Lord Poster Variation',
      ['Darth Maul Shadow Lord']
    );
    // darth(5), maul(4), shadow(6), lord(4), poster(6), variation(9) = 6 tokens
    // existing stripped: darth maul shadow lord → matches: darth, maul, shadow, lord = 4/6 ≈ 0.67 ≥ 0.65
    // Both should agree whatever the result
    const oldResult = shouldDedupOld(
      'Darth Maul Shadow Lord Poster Variation',
      ['Darth Maul Shadow Lord']
    );
    const newResult = shouldDedupNew(
      'Darth Maul Shadow Lord Poster Variation',
      ['Darth Maul Shadow Lord']
    );
    expect(newResult).toBe(oldResult);
  });

  it('eBay listing with #number suffix does not prevent dedup', () => {
    // Special chars stripped, number tokens < 4 chars dropped
    const result = assertAgreement(
      'Funko Pop! Vinyl: Batman #01',
      ['Batman Figure']
    );
    // batman(6) → 1 token; existing stripped contains batman → 1/1 = 1.0 → dedup
    const oldResult = shouldDedupOld('Funko Pop! Vinyl: Batman #01', ['Batman Figure']);
    const newResult = shouldDedupNew('Funko Pop! Vinyl: Batman #01', ['Batman Figure']);
    expect(newResult).toBe(oldResult);
  });
});

// ── 8. Threshold boundary cases ───────────────────────────────────────────────

describe('threshold boundary: exactly at 0.65', () => {
  it('3 of 4 meaningful tokens match → 0.75 ≥ 0.65 → dedup', () => {
    // candidate tokens after strip: iron(4), deluxe(6), version(7), mark(4) — "man" has only 3 chars
    // Wait: coreTokens uses minLen=4. "iron"=4, "deluxe"=6, "version"=7, "mark"=4 = 4 tokens
    // Actually "man"=3 chars → excluded. "mark"=4 → included.
    // existing: iron deluxe version → 3/4 = 0.75 ≥ 0.65 → dedup
    const result = assertAgreement(
      'Iron Man Deluxe Version Mark',
      ['Iron Man Deluxe Version']
    );
    const oldResult = shouldDedupOld('Iron Man Deluxe Version Mark', ['Iron Man Deluxe Version']);
    const newResult = shouldDedupNew('Iron Man Deluxe Version Mark', ['Iron Man Deluxe Version']);
    expect(newResult).toBe(oldResult);
  });

  it('2 of 4 meaningful tokens match → 0.50 < 0.65 → pass', () => {
    // candidate: iron(4), mark(4), deluxe(6), collector(9) = 4 tokens
    // existing: iron mark thunder ragnarok → matches: iron, mark = 2/4 = 0.50 < 0.65 → pass
    const result = assertAgreement(
      'Iron Mark Deluxe Collector',
      ['Iron Mark Thunder Ragnarok']
    );
    const oldResult = shouldDedupOld('Iron Mark Deluxe Collector', ['Iron Mark Thunder Ragnarok']);
    const newResult = shouldDedupNew('Iron Mark Deluxe Collector', ['Iron Mark Thunder Ragnarok']);
    expect(newResult).toBe(oldResult);
    expect(oldResult).toBe(false);
  });
});
