import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InsightDirection, InsightType } from '@/lib/types';
import { Theme } from '@/lib/theme';

// ── Collector-friendly pill labels ────────────────────────────────────────────
export const INSIGHT_LABELS: Record<InsightType, string> = {
  supply_shock:       'SUPPLY BUILDING',
  confirmed_breakout: 'BREAKOUT CONFIRMED',
  false_top:          'FADING MOMENTUM',
  quiet_accumulation: 'QUIET DEMAND',
  catalyst_spike:     'BUZZ BUILDING',
  stagnation_risk:    'LOSING STEAM',
  low_data:           'EARLY DATA',
  steady_state:       'HOLDING STEADY',
};

// ── Personalized action lines (used on detail page) ───────────────────────────
export const ACTION_LINES: Record<'owns' | 'watches', Record<InsightDirection, string>> = {
  owns: {
    rising:  "You're holding well — momentum favors you.",
    holding: 'Position is stable. No action suggested.',
    cooling: 'Consider listing in the next 7–14 days before further softening.',
    falling: 'Momentum has turned. List immediately or hold long-term.',
  },
  watches: {
    rising:  'Buy window may be closing. Acting soon could cost less.',
    holding: 'Stable entry point. No urgency.',
    cooling: 'Better buy window may open in the next few weeks.',
    falling: 'Wait for price to settle before entering.',
  },
};

// ── Direction config ──────────────────────────────────────────────────────────
const DIRECTION_CONFIG: Record<InsightDirection, { emoji: string; color: string; bg: string; label: string }> = {
  rising:  { emoji: '🟢', color: '#34d399', bg: 'rgba(16,185,129,0.12)', label: 'Rising' },
  holding: { emoji: '🟡', color: '#fcd34d', bg: 'rgba(251,191,36,0.10)', label: 'Holding' },
  cooling: { emoji: '🟠', color: '#fb923c', bg: 'rgba(249,115,22,0.12)', label: 'Cooling' },
  falling: { emoji: '🔴', color: '#fb7185', bg: 'rgba(244,63,94,0.12)',  label: 'Falling' },
};

const DIMS = {
  sm: { h: 26, padX: 8,  scoreFs: 13, arrowFs: 8,  emojiFs: 11 },
  md: { h: 32, padX: 11, scoreFs: 16, arrowFs: 10, emojiFs: 13 },
  lg: { h: 44, padX: 14, scoreFs: 22, arrowFs: 14, emojiFs: 15 },
};

interface DirectionBadgeProps {
  direction: InsightDirection;
  hotScore: number;
  delta24h?: number;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  theme: Theme;
}

export function DirectionBadge({
  direction,
  hotScore,
  delta24h = 0,
  size = 'md',
  showScore = true,
  theme,
}: DirectionBadgeProps) {
  const cfg  = DIRECTION_CONFIG[direction];
  const dims = DIMS[size];
  const arrow = direction === 'rising' ? '↑'
              : direction === 'falling' ? '↓'
              : direction === 'cooling' ? '↓'
              : delta24h > 0 ? '↑' : delta24h < 0 ? '↓' : '·';

  return (
    <View style={[styles.pill, { height: dims.h, paddingHorizontal: dims.padX, backgroundColor: cfg.bg }]}>
      <Text style={{ fontSize: dims.emojiFs, lineHeight: dims.h }}>
        {cfg.emoji}
      </Text>
      {size === 'lg' && (
        <Text style={{
          fontFamily: 'Inter_700Bold', fontSize: 11,
          color: cfg.color, opacity: 0.9,
          marginLeft: 5, letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          {cfg.label}
        </Text>
      )}
      {showScore && (
        <Text style={{
          fontFamily: 'JetBrainsMono_700Bold',
          fontSize: dims.scoreFs,
          color: cfg.color,
          fontVariant: ['tabular-nums'],
          letterSpacing: -0.4,
          marginLeft: size === 'sm' ? 3 : 6,
        }}>
          {hotScore}
        </Text>
      )}
      <Text style={{
        fontFamily: 'JetBrainsMono_400Regular',
        fontSize: Math.round(dims.scoreFs * 0.62),
        color: cfg.color,
        opacity: 0.75,
        marginLeft: 3,
      }}>
        {arrow}
      </Text>
    </View>
  );
}

// ── Insight type pill (used on detail page) ───────────────────────────────────
interface InsightTypePillProps {
  insightType: InsightType;
  theme: Theme;
}

export function InsightTypePill({ insightType, theme }: InsightTypePillProps) {
  const direction = typeToDirection(insightType);
  const cfg = DIRECTION_CONFIG[direction];
  return (
    <View style={[styles.typePill, { backgroundColor: cfg.bg, borderColor: cfg.color + '33' }]}>
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: 10,
        color: cfg.color, letterSpacing: 1.0, textTransform: 'uppercase',
      }}>
        {INSIGHT_LABELS[insightType]}
      </Text>
    </View>
  );
}

function typeToDirection(type: InsightType): InsightDirection {
  const map: Record<InsightType, InsightDirection> = {
    supply_shock:       'cooling',
    confirmed_breakout: 'rising',
    false_top:          'cooling',
    quiet_accumulation: 'rising',
    catalyst_spike:     'rising',
    stagnation_risk:    'falling',
    low_data:           'holding',
    steady_state:       'holding',
  };
  return map[type];
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
