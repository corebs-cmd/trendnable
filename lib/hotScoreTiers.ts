// Hot Score Tier System
// Maps numeric hot scores (0-100) to visual tiers with colors, emojis, and labels

export interface HotScoreTier {
  label: string;        // e.g., "VERY HOT"
  emoji: string;        // e.g., "🔥"
  color: string;        // RGB hex, e.g., "#FF5500"
  bgColor: string;      // Semi-transparent background
  borderColor: string;  // Semi-transparent border
  min: number;          // Minimum score (inclusive)
  max: number;          // Maximum score (inclusive)
}

export const HOT_SCORE_TIERS: Record<string, HotScoreTier> = {
  VERY_HOT: {
    label: 'VERY HOT',
    emoji: '🔥',
    color: '#FF5500',
    bgColor: 'rgba(255, 85, 0, 0.12)',
    borderColor: 'rgba(255, 85, 0, 0.32)',
    min: 41,
    max: 100,
  },
  HOT: {
    label: 'HOT',
    emoji: '🟥',
    color: '#E64545',
    bgColor: 'rgba(230, 69, 69, 0.12)',
    borderColor: 'rgba(230, 69, 69, 0.32)',
    min: 31,
    max: 40,
  },
  WARM: {
    label: 'WARM',
    emoji: '🟨',
    color: '#FFD700',
    bgColor: 'rgba(255, 215, 0, 0.12)',
    borderColor: 'rgba(255, 215, 0, 0.32)',
    min: 21,
    max: 30,
  },
  COOL: {
    label: 'COOL',
    emoji: '🟦',
    color: '#5B9BD5',
    bgColor: 'rgba(91, 155, 213, 0.12)',
    borderColor: 'rgba(91, 155, 213, 0.32)',
    min: 11,
    max: 20,
  },
  FLAT: {
    label: 'FLAT',
    emoji: '⬜',
    color: '#9CA3AF',
    bgColor: 'rgba(156, 163, 175, 0.12)',
    borderColor: 'rgba(156, 163, 175, 0.32)',
    min: 0,
    max: 10,
  },
};

export function getTierByScore(score: number): HotScoreTier {
  if (score >= 41) return HOT_SCORE_TIERS.VERY_HOT;
  if (score >= 31) return HOT_SCORE_TIERS.HOT;
  if (score >= 21) return HOT_SCORE_TIERS.WARM;
  if (score >= 11) return HOT_SCORE_TIERS.COOL;
  return HOT_SCORE_TIERS.FLAT;
}

export function getTierLabel(score: number): string {
  return getTierByScore(score).label;
}

export function getTierColor(score: number): string {
  return getTierByScore(score).color;
}

export function getTierEmoji(score: number): string {
  return getTierByScore(score).emoji;
}

export function getTierWithEmoji(score: number): string {
  const tier = getTierByScore(score);
  return `${tier.emoji} ${tier.label}`;
}
