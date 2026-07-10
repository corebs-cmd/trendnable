import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Image } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';

import { buildTheme } from '@/lib/theme';
import { CollectionPulse, FlaggedItem, DemandRow, UpgradeContext } from '@/lib/types';
import { fmtPrice } from '@/lib/appConfig';

// ── Build-spec design tokens ──────────────────────────────────────────────────
const GOLD   = '#f1c24c';
const GREEN  = '#37d49b';
const PURPLE = '#8071f6';
const TEXT   = '#E1E4E6';
const MUTED  = '#8A9296';
const ACCENT = '#FF5500';

// ── Verdict config (carries the temperature color per spec) ───────────────────
const VERDICT_CONFIG = {
  hot: {
    label:    'Running Hot',
    pillBg:   'rgba(255,85,0,0.18)',
    pillText: ACCENT,
    flame:    true,
  },
  warming: {
    label:    'Warming',
    pillBg:   'rgba(243,150,60,0.18)',
    pillText: '#f3963c',
    flame:    false,
  },
  cooling: {
    label:    'Cooling',
    pillBg:   'rgba(138,146,150,0.14)',
    pillText: MUTED,
    flame:    false,
  },
} as const;

// ── Flame SVG icon (same path used in SKUCard / HotScore) ─────────────────────
function FlameIcon({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16z"
        fill={color}
      />
    </Svg>
  );
}

// ── Lock icon ─────────────────────────────────────────────────────────────────
function LockIcon({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

// ── Inline bold parser: **word** → bold in accentColor ───────────────────────
function RichText({ text, baseStyle, boldColor }: { text: string; baseStyle: object; boldColor: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <Text key={i} style={{ fontFamily: 'Inter_700Bold', color: boldColor }}>{part.slice(2, -2)}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  );
}

// ── Verdict pill with optional flame icon ─────────────────────────────────────
function VerdictPill({ verdict }: { verdict: 'hot' | 'warming' | 'cooling' }) {
  const vcfg = VERDICT_CONFIG[verdict];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 999, backgroundColor: vcfg.pillBg,
    }}>
      {vcfg.flame && <FlameIcon color={vcfg.pillText} size={10} />}
      {!vcfg.flame && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: vcfg.pillText }} />}
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: vcfg.pillText, letterSpacing: 0.3 }}>
        {vcfg.label}
      </Text>
    </View>
  );
}

// ── Deterministic per-item narration (premium) ────────────────────────────────
function itemNarration(item: FlaggedItem): string {
  if (item.reason === 'near_peak') {
    if (item.peak_90d != null && item.peak_90d > 0) {
      const pct = Math.round((item.price_median / item.peak_90d) * 100);
      return `At ${pct}% of its 90-day high — a common pre-drop window for momentum items.`;
    }
    return 'Trading near its 90-day high with increasing listing density — a common false-sell window.';
  }
  if (item.avg_30d != null && item.avg_30d > item.price_median) {
    const pctBelow = Math.round(((item.avg_30d - item.price_median) / item.avg_30d) * 100);
    return `Down ${pctBelow}% from its 30-day average${item.down_days > 0 ? ` — ${item.down_days} day${item.down_days > 1 ? 's' : ''} below trend` : ' with cooling momentum'}.`;
  }
  return 'Down from its 30-day average with cooling momentum.';
}

// ── Full flagged row (premium) ────────────────────────────────────────────────
function FlaggedRow({ item, theme, onPress }: { item: FlaggedItem; theme: ReturnType<typeof buildTheme>; onPress: () => void }) {
  const isNearPeak  = item.reason === 'near_peak';
  const reasonColor = isNearPeak ? GREEN : theme.neg;
  const reasonLabel = isNearPeak ? 'NEAR PEAK' : 'DECLINING';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 11, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={{ width: 40, height: 40 }} resizeMode="cover" />
            : <View style={{ width: 40, height: 40 }} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: TEXT }} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: `${reasonColor}22` }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: reasonColor, letterSpacing: 0.5 }}>{reasonLabel}</Text>
            </View>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>
              {fmtPrice(item.price_median)}
              {isNearPeak && item.peak_90d != null ? `  ·  90d ${fmtPrice(item.peak_90d)}` : ''}
              {!isNearPeak && item.avg_30d != null ? `  ·  avg ${fmtPrice(item.avg_30d)}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: reasonColor }}>{Math.round(item.urgency * 100)}%</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: MUTED, marginTop: 1 }}>urgency</Text>
        </View>
      </View>
      {/* AI narration line */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6, paddingLeft: 50 }}>
        <Text style={{ color: PURPLE, fontSize: 10, lineHeight: 17, marginTop: 1 }}>✦</Text>
        <Text style={{ fontFamily: 'Fraunces_400Regular_Italic', fontSize: 12, color: `${PURPLE}BB`, lineHeight: 17, flex: 1 }}>
          {itemNarration(item)}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Blurred preview row (free — neutral "FLAGGED" tag, no price/reason leakage) ─
function FlaggedPreviewRow({ item, theme }: { item: { sku_id: string; name: string; image_url: string | null }; theme: ReturnType<typeof buildTheme> }) {
  return (
    <View style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: theme.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={{ width: 40, height: 40 }} resizeMode="cover" />
          : <View style={{ width: 40, height: 40 }} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: TEXT }} numberOfLines={1}>{item.name}</Text>
        {/* Frosted price/detail bar */}
        <View style={{ height: 10, width: 120, borderRadius: 4, backgroundColor: theme.surface2, marginTop: 5, opacity: 0.6 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <LockIcon color={GOLD} size={11} />
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: GOLD, letterSpacing: 0.5 }}>LOCKED</Text>
      </View>
    </View>
  );
}

// ── HOTTEST / COOLEST demand table (individual items) ─────────────────────────
function DemandTable({ hottest, coolest }: { hottest: DemandRow[]; coolest: DemandRow[] }) {
  const count = Math.max(hottest.length, coolest.length);
  if (count === 0) return null;

  return (
    <View>
      {/* Column headers */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: GREEN }} />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: GREEN, letterSpacing: 0.9, textTransform: 'uppercase' }}>HOTTEST</Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: MUTED }} />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: MUTED, letterSpacing: 0.9, textTransform: 'uppercase' }}>COOLEST</Text>
        </View>
      </View>
      {/* Rows */}
      {Array.from({ length: count }).map((_, i) => {
        const h = hottest[i];
        const c = coolest[i];
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 9 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {h ? (
                <>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: TEXT, flex: 1 }} numberOfLines={1}>{h.name}</Text>
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, color: GREEN, marginLeft: 6 }}>{Math.round(h.hot_score)}</Text>
                </>
              ) : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {c ? (
                <>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: TEXT, flex: 1 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, color: MUTED, marginLeft: 6 }}>{Math.round(c.hot_score)}</Text>
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface CollectionPulseSectionProps {
  pulse:     CollectionPulse | null;
  loading:   boolean;
  isPremium: boolean;
  theme:     ReturnType<typeof buildTheme>;
  onUpgrade: (ctx: UpgradeContext) => void;
}

export default function CollectionPulseSection({ pulse, loading, isPremium, theme, onUpgrade }: CollectionPulseSectionProps) {
  const router = useRouter();

  if (loading) {
    return (
      <View style={{ backgroundColor: theme.surface, borderRadius: theme.radiusLg, padding: 20, marginBottom: 20, alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
        <ActivityIndicator color={ACCENT} size="small" />
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, marginTop: 8 }}>Computing your pulse…</Text>
      </View>
    );
  }

  if (!pulse || !pulse.eligible) return null;

  const vcfg       = VERDICT_CONFIG[pulse.verdict];
  const flagged    = pulse.payload?.flagged  ?? [];
  const hottest    = pulse.payload?.hottest  ?? [];
  const coolest    = pulse.payload?.coolest  ?? [];
  const preview    = pulse.flagged_preview   ?? [];
  const hasDemand  = hottest.length > 0 || coolest.length > 0;
  const deltaSign  = pulse.delta_24h > 0 ? '↑' : pulse.delta_24h < 0 ? '↓' : null;
  const deltaAbs   = Math.round(Math.abs(pulse.delta_24h)).toString();
  const deltaColor = pulse.delta_24h >= 0 ? GREEN : theme.neg;

  return (
    <View style={{ marginBottom: 20 }}>
      {/* ── Heat card ── */}
      <View style={{ backgroundColor: theme.surface, borderRadius: theme.radiusLg, padding: 18, marginBottom: 12 }}>
        {/* Section label + date — inside the card, consistent with all other section headers */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase' }}>Collection Pulse</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED }}>
            {pulse.generated_at ? new Date(pulse.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today'}
          </Text>
        </View>

        {/* Pill (left) + number with inline delta (right) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <VerdictPill verdict={pulse.verdict} />
          {/* Number + delta on one line, delta top-anchored to the right of the number */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 3 }}>
            <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 40, color: TEXT, letterSpacing: -1 }}>
              {Math.round(pulse.heat_score)}
            </Text>
            {deltaSign && (
              <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, color: deltaColor, marginTop: 6 }}>
                {deltaSign}{deltaAbs}
              </Text>
            )}
          </View>
        </View>

        {/* AI summary: purple ✦ + bold-parsed text */}
        {pulse.summary && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 14 }}>
            <Text style={{ color: PURPLE, fontSize: 12, lineHeight: 20, marginTop: 1 }}>✦</Text>
            <RichText
              text={pulse.summary}
              baseStyle={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, color: TEXT, lineHeight: 20, flex: 1 }}
              boldColor={vcfg.pillText}
            />
          </View>
        )}

        {/* Standout item */}
        {pulse.standout && (
          <Pressable
            onPress={() => router.push(`/sku/${pulse.standout!.sku_id}`)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: theme.surface2, borderRadius: theme.radius,
              padding: 10, opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 7, backgroundColor: theme.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {pulse.standout.image_url
                ? <Image source={{ uri: pulse.standout.image_url }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                : <View style={{ width: 36, height: 36 }} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: MUTED, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 2 }}>Standout</Text>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: TEXT }} numberOfLines={1}>{pulse.standout.name}</Text>
            </View>
            {/* Gold score badge + "+N today" */}
            <View style={{ alignItems: 'center' }}>
              <View style={{ backgroundColor: GOLD, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: '#1A1206' }}>
                  {Math.round(pulse.standout.hot_score)}
                </Text>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#1A1206' }}>↑</Text>
              </View>
              {pulse.standout.delta_24h !== 0 && (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: GREEN, marginTop: 3 }}>
                  {pulse.standout.delta_24h > 0 ? '+' : ''}{pulse.standout.delta_24h.toFixed(1)} today
                </Text>
              )}
            </View>
          </Pressable>
        )}
      </View>

      {/* ── Sell candidates ── */}
      <View style={{ backgroundColor: theme.surface, borderRadius: theme.radiusLg, padding: 18, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase' }}>Sell Candidates</Text>
          {pulse.flagged_count > 0 && (
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.neg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#fff' }}>{pulse.flagged_count}</Text>
            </View>
          )}
        </View>

        {pulse.flagged_count === 0 ? (
          /* Zero-flag steady state */
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 }}>
            <Text style={{ color: GREEN, fontSize: 14 }}>✓</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: MUTED }}>
              No items flagged — your collection looks steady
            </Text>
          </View>
        ) : isPremium ? (
          /* Premium: full items */
          <View>
            {flagged.map((item, idx) => (
              <React.Fragment key={item.sku_id}>
                {idx > 0 && <View style={{ height: 0.5, backgroundColor: theme.hairline }} />}
                <FlaggedRow item={item} theme={theme} onPress={() => router.push(`/sku/${item.sku_id}`)} />
              </React.Fragment>
            ))}
          </View>
        ) : (
          /* Free: blurred preview + locked chip + unlock CTA */
          <View>
            {preview.map((item, idx) => (
              <React.Fragment key={item.sku_id}>
                {idx > 0 && <View style={{ height: 0.5, backgroundColor: theme.hairline }} />}
                <FlaggedPreviewRow item={item} theme={theme} />
              </React.Fragment>
            ))}
            {/* "Prices, reasons & AI narration locked" chip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginTop: 4 }}>
              <LockIcon color={GOLD} size={11} />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: MUTED }}>
                Prices, reasons & AI narration locked
              </Text>
            </View>
            {/* Gold unlock CTA */}
            <Pressable
              onPress={() => onUpgrade('sellability')}
              style={({ pressed }) => ({
                paddingVertical: 12, paddingHorizontal: 16,
                borderRadius: theme.radius,
                backgroundColor: `${GOLD}1A`,
                borderWidth: 1, borderColor: `${GOLD}50`,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 7, opacity: pressed ? 0.75 : 1,
              })}
            >
              <LockIcon color={GOLD} size={13} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: GOLD }}>Unlock sell signals</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Demand breakdown ── */}
      {isPremium && hasDemand ? (
        <View style={{ backgroundColor: theme.surface, borderRadius: theme.radiusLg, padding: 18 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
            Demand Breakdown
          </Text>
          <DemandTable hottest={hottest} coolest={coolest} />
        </View>
      ) : !isPremium ? (
        <Pressable
          onPress={() => onUpgrade('breakdown')}
          style={({ pressed }) => ({
            backgroundColor: theme.surface, borderRadius: theme.radiusLg,
            padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <LockIcon color={theme.premium} size={13} />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.premium }}>Demand Breakdown</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: `${theme.premium}99`, flex: 1 }}>— Premium</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Compact card for Home screen (1c / 1d) ────────────────────────────────────

export function CollectionPulseCompactCard({
  pulse, theme, onPress, isPremium,
}: {
  pulse:      CollectionPulse;
  theme:      ReturnType<typeof buildTheme>;
  onPress:    () => void;
  isPremium?: boolean;
}) {
  const vcfg      = VERDICT_CONFIG[pulse.verdict];
  const flagged   = pulse.payload?.flagged ?? pulse.flagged_preview ?? [];
  const names     = flagged.slice(0, 2).map((f) => f.name);
  const overflow  = Math.max(0, pulse.flagged_count - 2);
  const topDriver = pulse.payload?.hottest?.[0];

  // One-line summary: fallback if no AI summary
  const oneLiner = pulse.summary
    ?? (topDriver ? `${topDriver.name} is carrying your momentum` : 'See your collection analysis');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
    >
      <View style={{
        backgroundColor: theme.surface,
        borderRadius: theme.radiusLg,
        overflow: 'hidden',
        flexDirection: 'row',
      }}>
        {/* Orange left accent stripe */}
        <View style={{ width: 3, backgroundColor: ACCENT }} />

        {/* Card content */}
        <View style={{ flex: 1, padding: 14 }}>
          {/* Row 1: label + date */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Collection Pulse
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: MUTED }}>
              {pulse.generated_at
                ? new Date(pulse.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Today'}
            </Text>
          </View>

          {/* Row 2: verdict pill + score */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <VerdictPill verdict={pulse.verdict} />
            <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 28, color: TEXT, letterSpacing: -0.5, lineHeight: 30 }}>
              {Math.round(pulse.heat_score)}
            </Text>
          </View>

          {/* Row 3: ✦ one-line summary */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 9 }}>
            <Text style={{ color: PURPLE, fontSize: 10, lineHeight: 17, marginTop: 1 }}>✦</Text>
            <RichText
              text={oneLiner}
              baseStyle={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, lineHeight: 17, flex: 1 }}
              boldColor={vcfg.pillText}
            />
          </View>

          {/* Row 4: flagged teaser or zero-flag */}
          {pulse.flagged_count === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 9 }}>
              <Text style={{ color: GREEN, fontSize: 12 }}>✓</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED }}>
                No items flagged — collection looks steady
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: theme.neg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: '#fff' }}>{pulse.flagged_count}</Text>
              </View>
              {isPremium && names.length > 0 ? (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED, flex: 1 }} numberOfLines={1}>
                  {names.join(', ')}{overflow > 0 ? ` +${overflow}` : ''}
                </Text>
              ) : (
                <>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED, flex: 1 }}>
                    {pulse.flagged_count} item{pulse.flagged_count > 1 ? 's' : ''} flagged for review
                  </Text>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: `${GOLD}18`, borderWidth: 1, borderColor: `${GOLD}40` }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: GOLD, letterSpacing: 0.4 }}>UNLOCK</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Row 5: see full analysis */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: ACCENT }}>See full analysis</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 18l6-6-6-6" />
            </Svg>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
