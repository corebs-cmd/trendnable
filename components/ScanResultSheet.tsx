import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';

import Sheet from '@/components/Sheet';
import { Theme, categoryColor } from '@/lib/theme';
import { ScanResult } from '@/lib/types';
import { catById, fmtPrice } from '@/lib/appConfig';

// ── Inline category thumb ─────────────────────────────────────────────────────

function CatalogThumb({ categoryId, size, theme }: { categoryId: string; size: number; theme: Theme }) {
  const c   = categoryColor(categoryId, theme.dark);
  const cat = catById(categoryId);
  return (
    <View style={{
      width: size, height: size,
      borderRadius: Math.max(8, size * 0.18),
      backgroundColor: c.tint,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Text style={{
        fontFamily: 'Inter_700Bold',
        fontSize: size * 0.24,
        color: c.ink,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        {cat?.short?.slice(0, 3) ?? '???'}
      </Text>
    </View>
  );
}

function ResultImage({ uri, size, theme }: { uri: string; size: number; theme: Theme }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <CatalogThumb categoryId="" size={size} theme={theme} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: Math.max(8, size * 0.18) }}
      resizeMode="cover"
      onError={() => setErrored(true)}
    />
  );
}

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ categoryId, theme }: { categoryId: string; theme: Theme }) {
  const c   = categoryColor(categoryId, theme.dark);
  const cat = catById(categoryId);
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.tint }}>
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: 10, color: c.ink,
        letterSpacing: 0.08 * 10, textTransform: 'uppercase',
      }}>
        {cat?.short ?? categoryId}
      </Text>
    </View>
  );
}

// ── Hot score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ score, theme }: { score: number; theme: Theme }) {
  const fillColor =
    score >= 80 ? theme.gold :
    score >= 65 ? theme.accent :
    score >= 40 ? theme.text :
    theme.faint;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.surface2, overflow: 'hidden' }}>
        <View style={{
          width: `${Math.min(100, Math.max(0, score))}%`,
          height: '100%',
          backgroundColor: fillColor,
          borderRadius: 5,
        }} />
      </View>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: fillColor, minWidth: 28, textAlign: 'right' }}>
        {score}
      </Text>
    </View>
  );
}

// ── Sellability helpers ───────────────────────────────────────────────────────

const SCALE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'] as const;

function sellabilityColor(pct: number): string {
  if (pct >= 75) return '#22C55E';
  if (pct >= 60) return '#84CC16';
  if (pct >= 45) return '#EAB308';
  if (pct >= 30) return '#F97316';
  return '#EF4444';
}

function sellabilityTier(pct: number): { label: string; description: string } {
  if (pct >= 75) return { label: 'Very High Demand', description: 'Typically sells within days' };
  if (pct >= 60) return { label: 'High Demand',      description: "Strong seller's market"      };
  if (pct >= 45) return { label: 'Moderate',         description: 'Healthy market activity'     };
  if (pct >= 30) return { label: 'Slow Market',      description: 'More supply than demand'     };
  return              { label: 'Oversaturated',      description: 'Difficult to sell quickly'   };
}

function calcQuickSalePct(soldCount: number, activeCount: number): number {
  // Bayesian smoothing: prior of 40% with weight 10
  return Math.round((4 + soldCount) / (10 + soldCount + activeCount) * 100);
}

// ── Sellability card ──────────────────────────────────────────────────────────

interface SellabilityCardProps {
  soldCount: number;
  activeCount: number;
  theme: Theme;
  isPremium: boolean;
  onUnlock: () => void;
}

function SellabilityCard({ soldCount, activeCount, theme, isPremium, onUnlock }: SellabilityCardProps) {
  const hasData   = soldCount + activeCount > 0;
  const quickPct  = hasData ? calcQuickSalePct(soldCount, activeCount) : 0;
  const inkColor  = sellabilityColor(quickPct);
  const tier      = sellabilityTier(quickPct);
  // Keep indicator 2–98 so it never clips outside the bar ends
  const indicatorPct = Math.max(2, Math.min(98, quickPct));

  return (
    <View style={[styles.card, { backgroundColor: theme.surface2 }]}>

      {/* ── Actual content (always rendered; opacity dimmed for free users) ── */}
      <View style={{ padding: 14, gap: 12, opacity: isPremium ? 1 : 0.07 }}
        pointerEvents={isPremium ? 'auto' : 'none'}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
            Sellability Score
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.premium + '28', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 }}>
            <Svg width={9} height={9} viewBox="0 0 12 12">
              <Path d="M6 0L7.5 4.5H12L8.5 7L10 12L6 9L2 12L3.5 7L0 4.5H4.5Z" fill={theme.premium} />
            </Svg>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.premium, letterSpacing: 0.6 }}>
              PREMIUM
            </Text>
          </View>
        </View>

        {hasData ? (
          <>
            {/* Scale bar + indicator */}
            <View style={{ gap: 6 }}>
              <View style={{ position: 'relative', height: 20 }}>
                {/* Coloured track */}
                <View style={{
                  position: 'absolute', left: 0, right: 0,
                  top: 6, height: 8, borderRadius: 4,
                  flexDirection: 'row', overflow: 'hidden',
                }}>
                  {SCALE_COLORS.map((c) => (
                    <View key={c} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </View>
                {/* Indicator dot */}
                <View style={{
                  position: 'absolute',
                  top: 0,
                  left: `${indicatorPct}%` as any,
                  marginLeft: -10,
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: theme.surface,
                  borderWidth: 3,
                  borderColor: inkColor,
                  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, elevation: 4,
                }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.faint }}>Very Low</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.faint }}>Very High</Text>
              </View>
            </View>

            {/* Big percentage */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 40, color: inkColor, letterSpacing: -1.5, lineHeight: 42 }}>
                {quickPct}%
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, paddingBottom: 5, lineHeight: 18 }}>
                likely to{'\n'}sell quickly
              </Text>
            </View>

            {/* Sold / active stats + tier */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 11, color: theme.muted }}>
                {soldCount} sold  ·  {activeCount} active
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: inkColor }} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: inkColor }}>
                  {tier.label}
                </Text>
              </View>
            </View>

            {/* Tier description */}
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted }}>
              {tier.description}
            </Text>
          </>
        ) : (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.faint, textAlign: 'center', paddingVertical: 12 }}>
            Not enough data for this scan
          </Text>
        )}
      </View>

      {/* ── Premium gate overlay ── */}
      {!isPremium && (
        <BlurView
          intensity={22}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFillObject, styles.blurOverlay]}
        >
          <View style={[styles.lockCard, {
            backgroundColor: theme.dark ? 'rgba(15,26,46,0.88)' : 'rgba(255,255,255,0.88)',
            borderColor: theme.border,
          }]}>
            {/* Lock icon */}
            <View style={[styles.lockIconWrap, { backgroundColor: theme.premium + '1A' }]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                stroke={theme.premium} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              >
                <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
                <Path d="M7 11V7a5 5 0 0110 0v4" />
              </Svg>
            </View>

            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.text, textAlign: 'center' }}>
              Sellability Analysis
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, textAlign: 'center', lineHeight: 19 }}>
              See sell-through rate, demand tier,{'\n'}and quick-sale probability.
            </Text>

            <Pressable
              onPress={onUnlock}
              style={({ pressed }) => [styles.unlockBtn, { backgroundColor: theme.premium, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.premiumInk }}>
                Unlock Premium  →
              </Text>
            </Pressable>
          </View>
        </BlurView>
      )}
    </View>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface ScanResultSheetProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  result: ScanResult | null;
  isPremium: boolean;
  onUnlockSellability: () => void;
  onWatch: () => void;
  onCollect: () => void;
  onDiscard: () => void;
}

export default function ScanResultSheet({
  open, onClose, theme, result, isPremium, onUnlockSellability,
  onWatch, onCollect, onDiscard,
}: ScanResultSheetProps) {
  const router = useRouter();

  if (!result) return null;

  const isHot = result.scoreEstimate >= 65;

  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Scan Result">
        {/* ── Identity ──────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
          {result.imageUrl
            ? <ResultImage uri={result.imageUrl} size={64} theme={theme} />
            : <CatalogThumb categoryId={result.categoryId} size={64} theme={theme} />
          }
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            <Text
              style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: theme.text, letterSpacing: -0.3, lineHeight: 22 }}
              numberOfLines={2}
            >
              {result.name}
            </Text>
            {!!result.series && (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted }} numberOfLines={1}>
                {result.series}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              <CategoryBadge categoryId={result.categoryId} theme={theme} />
              {result.isNewToCatalog && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#065F46' }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#6EE7B7', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    New Discovery
                  </Text>
                </View>
              )}
              {isHot && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.gold }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.goldInk, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    Hot
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Sellability (premium) ──────────────────────────────────────── */}
        <SellabilityCard
          soldCount={result.soldCount}
          activeCount={result.listings}
          theme={theme}
          isPremium={isPremium}
          onUnlock={onUnlockSellability}
        />

        {/* ── Estimated Hot Score ────────────────────────────────────────── */}
        <View style={{
          backgroundColor: theme.surface2,
          borderRadius: theme.radius,
          padding: 14,
          marginBottom: 14,
          gap: 8,
        }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
            Estimated Hot Score
          </Text>
          <ScoreBar score={result.scoreEstimate} theme={theme} />
        </View>

        {/* ── Price ─────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: theme.surface2,
          borderRadius: theme.radius,
          padding: 14,
          marginBottom: 14,
          gap: 10,
        }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { label: 'Low',    value: result.price.low    },
              { label: 'Median', value: result.price.median },
              { label: 'High',   value: result.price.high   },
            ] as { label: string; value: number }[]).map((p) => (
              <View key={p.label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.text }}>
                  {fmtPrice(p.value)}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.muted }}>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.faint, textAlign: 'center' }}>
            {result.listings} active listing{result.listings !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <View style={{ gap: 10 }}>
          {!!result.skuId && (
            <Pressable
              onPress={() => { onClose(); router.push(`/sku/${result.skuId}`); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 14, borderRadius: theme.radius,
                borderWidth: 1, borderColor: theme.accent,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.accent }}>
                View Full Details →
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={onWatch}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 16, borderRadius: theme.radius,
              backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.accentInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill={theme.accentInk} />
            </Svg>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: theme.accentInk }}>
              Add to Watchlist
            </Text>
          </Pressable>

          <Pressable
            onPress={onCollect}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 16, borderRadius: theme.radius,
              backgroundColor: theme.surface2, opacity: pressed ? 0.8 : 1,
            })}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.2} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: theme.text }}>
              Add to Collection
            </Text>
          </Pressable>

          <Pressable
            onPress={onDiscard}
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 10, opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
              Not the right product? Discard
            </Text>
          </Pressable>
        </View>
      </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  blurOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  lockCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  lockIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  unlockBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 11,
    marginTop: 4,
  },
});
