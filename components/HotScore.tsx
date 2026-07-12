import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { SKU } from '@/lib/types';
import { getTierByScore } from '@/lib/hotScoreTiers';
import Sparkline from '@/components/Sparkline';

// ── HotScoreBadge — the new pill badge design ─────────────────────────────────
// Tier-based colors: hot(≥80)=gold, strong(≥65)=blue, cool(≥40)=surface, faint=transparent
type BadgeSize = 'sm' | 'md' | 'lg';

interface HotScoreBadgeProps {
  sku: SKU;
  theme: Theme;
  size?: BadgeSize;
  showSpark?: boolean;
}

const BADGE_DIMS = {
  sm: { h: 26, padX: 9,  fs: 13, arrowFs: 8,  sparkW: 36, sparkH: 14 },
  md: { h: 32, padX: 12, fs: 16, arrowFs: 10, sparkW: 50, sparkH: 18 },
  lg: { h: 44, padX: 16, fs: 22, arrowFs: 14, sparkW: 80, sparkH: 28 },
};

export function HotScoreBadge({ sku, theme, size = 'md', showSpark = true }: HotScoreBadgeProps) {
  const score = sku.hot;
  const dims = BADGE_DIMS[size];
  const tierData = getTierByScore(score);

  const arrow = sku.delta > 0 ? '↑' : sku.delta < 0 ? '↓' : '·';
  const sparkColor = tierData.color;

  return (
    <View style={styles.badgeRow}>
      {showSpark && sku.history.length > 1 && (
        <Sparkline
          data={sku.history}
          theme={theme}
          w={dims.sparkW}
          h={dims.sparkH}
          color={sparkColor}
          fill
        />
      )}
      <View
        style={[
          styles.badgePill,
          {
            height: dims.h,
            paddingHorizontal: dims.padX,
            backgroundColor: tierData.bgColor,
            borderRadius: 999,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tierData.borderColor,
          },
        ]}
      >
        {size === 'lg' && (
          <Text style={{
            fontFamily: 'Inter_700Bold',
            fontSize: Math.round(dims.fs * 0.5),
            color: tierData.color,
            marginRight: 6,
          }}>
            {tierData.emoji}
          </Text>
        )}
        {size !== 'sm' && (
          <Text style={{
            fontFamily: 'Inter_700Bold',
            fontSize: Math.round(dims.fs * 0.42),
            color: tierData.color,
            letterSpacing: 0.5,
            marginRight: 4,
            textTransform: 'uppercase',
          }}>
            {tierData.label}
          </Text>
        )}
        <Text
          style={{
            fontFamily: 'JetBrainsMono_700Bold',
            fontSize: dims.fs,
            color: tierData.color,
            fontVariant: ['tabular-nums'],
            letterSpacing: -0.4,
          }}
        >
          {Math.round(score)}
        </Text>
        <Text
          style={{
            fontFamily: 'JetBrainsMono_400Regular',
            fontSize: Math.round(dims.fs * 0.62),
            color: tierData.color,
            opacity: 0.75,
            marginLeft: 3,
          }}
        >
          {arrow}
        </Text>
      </View>
    </View>
  );
}

// ── Legacy HotScore — kept for SKU detail screen ──────────────────────────────
type HotScoreSize = 'sm' | 'md' | 'lg';

interface HotScoreProps {
  sku: SKU;
  theme: Theme;
  viz?: 'spark' | 'bar' | 'ring' | 'components';
  size?: HotScoreSize;
}

const SIZE_CONFIG: Record<HotScoreSize, {
  fontSize: number; sparkW: number; sparkH: number; barH: number; ringR: number;
}> = {
  lg: { fontSize: 28, sparkW: 120, sparkH: 32, barH: 8, ringR: 28 },
  md: { fontSize: 18, sparkW: 70,  sparkH: 22, barH: 6, ringR: 20 },
  sm: { fontSize: 12, sparkW: 60,  sparkH: 18, barH: 4, ringR: 14 },
};

export default function HotScore({ sku, theme, viz = 'spark', size = 'md' }: HotScoreProps) {
  const cfg = SIZE_CONFIG[size];
  const tierData = getTierByScore(sku.hot);
  const color = tierData.color;

  if (viz === 'bar') {
    const pct = Math.min(100, Math.max(0, sku.hot));
    return (
      <View style={styles.barContainer}>
        <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: cfg.fontSize, color, lineHeight: cfg.fontSize * 1.1, fontVariant: ['tabular-nums'] }}>
          {Math.round(sku.hot)}
        </Text>
        <View style={[styles.barTrack, { width: cfg.sparkW, height: cfg.barH, backgroundColor: theme.hotBarTrack }]}>
          <View style={[styles.barFill, { width: (pct / 100) * cfg.sparkW, height: cfg.barH, backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.sparkContainer}>
      <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: cfg.fontSize, color, lineHeight: cfg.fontSize * 1.1, fontVariant: ['tabular-nums'] }}>
        {Math.round(sku.hot)}
      </Text>
      <View style={{ marginTop: size === 'lg' ? 6 : 4 }}>
        <Sparkline data={sku.history} theme={theme} w={cfg.sparkW} h={cfg.sparkH} color={color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sparkContainer: { alignItems: 'flex-start' },
  barContainer: { alignItems: 'flex-start', gap: 6 },
  barTrack: { borderRadius: 999, overflow: 'hidden' },
  barFill: { borderRadius: 999 },
});
