import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { SKU } from '@/lib/types';
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

  const tier = score >= 80 ? 'hot' : score >= 65 ? 'strong' : score >= 40 ? 'cool' : 'faint';
  const tierBg = {
    hot:    theme.gold,
    strong: theme.accent,
    cool:   theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,30,0.06)',
    faint:  'transparent',
  }[tier];
  const tierColor = {
    hot:    theme.goldInk,
    strong: theme.accentInk,
    cool:   theme.text,
    faint:  theme.muted,
  }[tier];
  const hasBorder = tier === 'faint';

  const arrow = sku.delta > 0 ? '↑' : sku.delta < 0 ? '↓' : '·';
  const sparkColor =
    tier === 'hot' ? theme.gold : tier === 'strong' ? theme.accent : theme.muted;

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
            backgroundColor: tierBg,
            borderRadius: 999,
            borderWidth: hasBorder ? StyleSheet.hairlineWidth : 0,
            borderColor: hasBorder ? theme.hairline : 'transparent',
          },
        ]}
      >
        {tier === 'hot' && (
          <Svg
            width={dims.arrowFs}
            height={dims.arrowFs}
            viewBox="0 0 16 16"
            style={{ marginRight: 4 }}
          >
            <Defs>
              <LinearGradient id="hsFlameGrad" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#FFCC00" />
                <Stop offset="0.5" stopColor="#FF6B00" />
                <Stop offset="1" stopColor="#FF2D00" />
              </LinearGradient>
            </Defs>
            <Path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16z" fill="url(#hsFlameGrad)" />
          </Svg>
        )}
        {size !== 'sm' && (
          <View style={{ flexDirection: 'column', alignItems: 'flex-end', marginRight: 4 }}>
            <Text style={{
              fontFamily: 'Inter_700Bold',
              fontSize: Math.round(dims.fs * 0.44),
              color: tierColor,
              opacity: 0.85,
              letterSpacing: 0.5,
              lineHeight: Math.round(dims.fs * 0.5),
              textTransform: 'uppercase',
            }}>
              Hot
            </Text>
            <Text style={{
              fontFamily: 'Inter_700Bold',
              fontSize: Math.round(dims.fs * 0.44),
              color: tierColor,
              opacity: 0.85,
              letterSpacing: 0.5,
              lineHeight: Math.round(dims.fs * 0.5),
              textTransform: 'uppercase',
            }}>
              Score
            </Text>
          </View>
        )}
        <Text
          style={{
            fontFamily: 'JetBrainsMono_700Bold',
            fontSize: dims.fs,
            color: tierColor,
            fontVariant: ['tabular-nums'],
            letterSpacing: -0.4,
          }}
        >
          {score}
        </Text>
        <Text
          style={{
            fontFamily: 'JetBrainsMono_400Regular',
            fontSize: Math.round(dims.fs * 0.62),
            color: tierColor,
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

function scoreColor(score: number, theme: Theme) {
  return score >= 80 ? theme.gold : score >= 65 ? theme.accent : score >= 40 ? theme.pos : theme.neg;
}

export default function HotScore({ sku, theme, viz = 'spark', size = 'md' }: HotScoreProps) {
  const cfg = SIZE_CONFIG[size];
  const color = scoreColor(sku.hot, theme);

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
