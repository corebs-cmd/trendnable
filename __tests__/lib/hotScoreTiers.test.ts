import {
  getTierByScore,
  getTierLabel,
  getTierColor,
  getTierEmoji,
  getTierWithEmoji,
  HOT_SCORE_TIERS,
} from '../../lib/hotScoreTiers';

describe('getTierByScore — tier boundaries', () => {
  it('score 0 → FLAT', () => expect(getTierByScore(0).label).toBe('FLAT'));
  it('score 10 → FLAT', () => expect(getTierByScore(10).label).toBe('FLAT'));
  it('score 11 → COOL', () => expect(getTierByScore(11).label).toBe('COOL'));
  it('score 20 → COOL', () => expect(getTierByScore(20).label).toBe('COOL'));
  it('score 21 → WARM', () => expect(getTierByScore(21).label).toBe('WARM'));
  it('score 30 → WARM', () => expect(getTierByScore(30).label).toBe('WARM'));
  it('score 31 → HOT', () => expect(getTierByScore(31).label).toBe('HOT'));
  it('score 40 → HOT', () => expect(getTierByScore(40).label).toBe('HOT'));
  it('score 41 → VERY HOT', () => expect(getTierByScore(41).label).toBe('VERY HOT'));
  it('score 100 → VERY HOT', () => expect(getTierByScore(100).label).toBe('VERY HOT'));
});

describe('getTierByScore — mid-range scores', () => {
  it('score 5 → FLAT', () => expect(getTierByScore(5).label).toBe('FLAT'));
  it('score 15 → COOL', () => expect(getTierByScore(15).label).toBe('COOL'));
  it('score 25 → WARM', () => expect(getTierByScore(25).label).toBe('WARM'));
  it('score 35 → HOT', () => expect(getTierByScore(35).label).toBe('HOT'));
  it('score 75 → VERY HOT', () => expect(getTierByScore(75).label).toBe('VERY HOT'));
});

describe('getTierLabel', () => {
  it('returns label string for score', () => {
    expect(getTierLabel(0)).toBe('FLAT');
    expect(getTierLabel(50)).toBe('VERY HOT');
  });
});

describe('getTierColor', () => {
  it('returns hex color string', () => {
    expect(getTierColor(0)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(getTierColor(100)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
  it('VERY HOT is orange (#FF5500)', () => expect(getTierColor(50)).toBe('#FF5500'));
  it('FLAT is grey (#9CA3AF)', () => expect(getTierColor(5)).toBe('#9CA3AF'));
});

describe('getTierEmoji', () => {
  it('FLAT returns ⬜', () => expect(getTierEmoji(5)).toBe('⬜'));
  it('VERY HOT returns 🔥', () => expect(getTierEmoji(50)).toBe('🔥'));
});

describe('getTierWithEmoji', () => {
  it('combines emoji and label', () => {
    expect(getTierWithEmoji(50)).toBe('🔥 VERY HOT');
    expect(getTierWithEmoji(5)).toBe('⬜ FLAT');
  });
});

describe('HOT_SCORE_TIERS — min/max ranges are contiguous', () => {
  it('FLAT ends at 10, COOL starts at 11', () => {
    expect(HOT_SCORE_TIERS.FLAT.max).toBe(10);
    expect(HOT_SCORE_TIERS.COOL.min).toBe(11);
  });
  it('COOL ends at 20, WARM starts at 21', () => {
    expect(HOT_SCORE_TIERS.COOL.max).toBe(20);
    expect(HOT_SCORE_TIERS.WARM.min).toBe(21);
  });
  it('WARM ends at 30, HOT starts at 31', () => {
    expect(HOT_SCORE_TIERS.WARM.max).toBe(30);
    expect(HOT_SCORE_TIERS.HOT.min).toBe(31);
  });
  it('HOT ends at 40, VERY HOT starts at 41', () => {
    expect(HOT_SCORE_TIERS.HOT.max).toBe(40);
    expect(HOT_SCORE_TIERS.VERY_HOT.min).toBe(41);
  });
});
