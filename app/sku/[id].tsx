import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, Pattern, Rect, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { buildTheme, categoryColor } from '@/lib/theme';
import { catById, fandomById, fmtPrice } from '@/lib/appConfig';
import { useAppStore } from '@/stores/appStore';
import { fetchSkuHistory, fetchSkuById, fetchSkuInsight } from '@/lib/api';
import { SKU, InsightResponse } from '@/lib/types';

import { InsightTypePill } from '@/components/signals/DirectionBadge';
import Sparkline from '@/components/Sparkline';
import Chip from '@/components/Chip';
import ExclusiveSticker from '@/components/ExclusiveSticker';
import { STICKERS, type StickerDef } from '@/lib/stickers';
import IOSShareSheet from '@/components/IOSShareSheet';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';
import ProductPlaceholder, { ProductThumb } from '@/components/ProductPlaceholder';
import UpgradeSheet from '@/components/UpgradeSheet';
import PriceAlertSheet from '@/components/PriceAlertSheet';
import { UpgradeContext } from '@/lib/types';

const { width: SCREEN_W } = Dimensions.get('window');

// Design color constants (from the Almanac dark theme)
const C = {
  gold:        '#f1c24c',
  amber:       '#f3963c',
  purple:      '#8071f6',
  green:       '#37d49b',
  navPill:     'rgba(13,13,13,0.80)',
  cardBorder:  'rgba(255,255,255,0.07)',
  cardBg:      '#252525',
  scoreBars:   ['#FF5500', '#37d49b', '#f3963c', '#A82200'] as const,
};

function formatFiredAt(firedAt: string): string {
  const days = Math.floor((Date.now() - new Date(firedAt).getTime()) / 86400000);
  if (days === 0) return 'UPDATED TODAY';
  if (days === 1) return 'UPDATED 1 DAY AGO';
  return `UPDATED ${days} DAYS AGO`;
}

function DotPattern({ height }: { height: number }) {
  return (
    <Svg width={SCREEN_W} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <Pattern id="dots" x={0} y={0} width={18} height={18} patternUnits="userSpaceOnUse">
          <Circle cx={9} cy={9} r={1.1} fill="rgba(255,255,255,0.07)" />
        </Pattern>
      </Defs>
      <Rect width={SCREEN_W} height={height} fill="url(#dots)" />
    </Svg>
  );
}

/* Card with hairline border — matches design's `var(--card)` + `1px solid var(--line)` */
function Card({ children, style, isDark }: {
  children: React.ReactNode;
  style?: object;
  isDark: boolean;
}) {
  return (
    <View style={[{
      backgroundColor: isDark ? C.cardBg : '#fff',
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? C.cardBorder : 'rgba(0,0,0,0.07)',
    }, style]}>
      {children}
    </View>
  );
}

/* Section title — Fraunces serif 27px matching design's SectionTitle */
function SectionHeader({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: 14 }}>
      <Text style={{
        fontFamily: 'Fraunces_700Bold', fontSize: 27,
        color: isDark ? '#E1E4E6' : '#15171A', letterSpacing: -0.3, lineHeight: 30,
      }}>
        {title}
      </Text>
    </View>
  );
}

/* Tier/direction pill — matches list badge colors when direction is available */
const DIRECTION_PILL: Record<string, { dot: string; bg: string; border: string; label: string }> = {
  rising:  { dot: '#34d399', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(52,211,153,0.32)',  label: 'RISING'  },
  cooling: { dot: '#fb923c', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(251,146,60,0.32)',  label: 'COOLING' },
  falling: { dot: '#fb7185', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(251,113,133,0.32)', label: 'FALLING' },
  holding: { dot: C.gold,   bg: 'rgba(241,194,76,0.12)',  border: 'rgba(241,194,76,0.32)',  label: 'HOLDING' },
};

function TierPill({ score, direction, isDark }: { score: number; direction?: string | null; isDark: boolean }) {
  const scoreTier = score >= 80 ? 'HOT' : score >= 65 ? 'STRONG' : score >= 40 ? 'HOLDING' : 'WATCH';
  const cfg = direction ? DIRECTION_PILL[direction] ?? DIRECTION_PILL.holding : null;
  const dotColor  = cfg ? cfg.dot    : C.gold;
  const bgColor   = cfg ? cfg.bg     : 'rgba(241,194,76,0.12)';
  const bdColor   = cfg ? cfg.border : 'rgba(241,194,76,0.32)';
  const label     = cfg ? cfg.label  : scoreTier;
  const labelColor = cfg ? cfg.dot   : C.gold;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 11,
      backgroundColor: bgColor,
      borderWidth: 1, borderColor: bdColor,
      borderRadius: 999,
      paddingVertical: 9, paddingLeft: 13, paddingRight: 16,
    }}>
      <View style={{
        width: 13, height: 13, borderRadius: 999,
        backgroundColor: dotColor,
        shadowColor: dotColor, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
      }} />
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1,
        color: labelColor, textTransform: 'uppercase',
      }}>
        {label}
      </Text>
      <Text style={{
        fontFamily: 'JetBrainsMono_700Bold', fontSize: 22,
        color: isDark ? '#E1E4E6' : '#15171A',
        fontVariant: ['tabular-nums'],
      }}>
        {score}
      </Text>
    </View>
  );
}

/* Stat tile — matches design's StatTile: 22px mono value */
function StatBox({ label, value, valueColor, isDark }: {
  label: string;
  value: string;
  isDark: boolean;
  valueColor?: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: isDark ? C.cardBg : '#fff',
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? C.cardBorder : 'rgba(0,0,0,0.07)',
    }}>
      <Text style={{
        fontFamily: 'Inter_600SemiBold', fontSize: 10.5,
        color: isDark ? '#8A9296' : 'rgba(21,23,26,0.55)',
        letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </Text>
      <Text style={{
        fontFamily: 'JetBrainsMono_700Bold', fontSize: 22,
        color: valueColor ?? (isDark ? '#E1E4E6' : '#15171A'),
        letterSpacing: -0.4, fontVariant: ['tabular-nums'],
      }}>
        {value}
      </Text>
    </View>
  );
}

/* Score bar — Fraunces 18px label, per-bar accent color */
function ScoreBar({ label, value, max = 30, hint, color, isDark }: {
  label: string;
  value: number;
  max?: number;
  hint: string;
  color: string;
  isDark: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const textPrimary  = isDark ? '#E1E4E6'              : '#15171A';
  const textMuted    = isDark ? '#8A9296'              : 'rgba(21,23,26,0.55)';
  const textFaint    = isDark ? 'rgba(21,23,26,0.40)'  : 'rgba(21,23,26,0.45)';
  const valueActive  = isDark ? '#c8cee0'              : '#15171A';
  const valueInactive = isDark ? '#545e76'             : 'rgba(21,23,26,0.35)';
  const trackBg     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(21,23,26,0.08)';
  return (
    <View style={{ marginBottom: 17 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: textPrimary }}>{label}</Text>
        <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 14, color: textMuted, fontVariant: ['tabular-nums'] }}>
          <Text style={{ color: value > 0 ? valueActive : valueInactive, fontFamily: 'JetBrainsMono_700Bold' }}>{value}</Text>
          {' / '}{max}
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: trackBg, borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ height: 5, width: `${pct}%`, backgroundColor: color, borderRadius: 999 }} />
      </View>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: isDark ? '#545e76' : 'rgba(21,23,26,0.55)', marginTop: 7 }}>{hint}</Text>
    </View>
  );
}

type HistoryWindow = '30D' | '90D' | '1Y';

function WindowBtn({ label, locked, active, onPress, theme }: {
  label: string;
  locked?: boolean;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof buildTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
        backgroundColor: active ? (theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(21,23,26,0.08)') : 'transparent',
        borderWidth: locked ? 1 : 0,
        borderColor: locked ? 'rgba(241,194,76,0.32)' : 'transparent',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text style={{
        fontFamily: active ? 'JetBrainsMono_700Bold' : 'JetBrainsMono_400Regular',
        fontSize: 13,
        color: locked ? C.gold : active ? theme.text : theme.muted,
        letterSpacing: 0.5,
      }}>
        {label}
      </Text>
      {locked && (
        <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
        </Svg>
      )}
    </Pressable>
  );
}

function buildChartPath(values: number[], W: number, H: number, pad = 8) {
  const valid = values.filter((v) => typeof v === 'number' && isFinite(v));
  if (valid.length < 2) return { d: '', area: '', lastX: 0, lastY: 0 };
  const min = Math.min(...valid), max = Math.max(...valid);
  const range = max - min || 1;
  const n = valid.length;
  const xs = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const ys = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const pts = valid.map((v, i) => [xs(i), ys(v)]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const area = `${d} L${last[0].toFixed(1)},${(H - pad).toFixed(1)} L${pad},${(H - pad).toFixed(1)} Z`;
  return { d, area, lastX: last[0], lastY: last[1] };
}

function HistoryCard({ sku, theme, isPremium, window, setWindow, loading, error }: {
  sku: SKU;
  theme: ReturnType<typeof buildTheme>;
  isPremium: boolean;
  window: HistoryWindow;
  setWindow: (w: HistoryWindow) => void;
  loading: boolean;
  error: string | null;
}) {
  const [metric, setMetric] = React.useState<'score' | 'price'>('score');
  const data = metric === 'score' ? sku.history : sku.priceHist;
  const color = metric === 'score' ? theme.accent : C.amber;
  const curLabel = metric === 'score' ? 'HOT SCORE' : 'MEDIAN PRICE';
  const curVal = metric === 'score' ? String(sku.hot) : fmtPrice(sku.price.median);
  const gid = `hg-${metric}`;
  const W = SCREEN_W - 72;
  const H = 150;
  const { d, area, lastX, lastY } = buildChartPath(data, W, H);
  const windowLabel = window === '1Y' ? '−1y' : window === '90D' ? '−90d' : '−30d';

  return (
    <View style={{ marginHorizontal: 18 }}>
      <Card isDark={theme.dark} style={{ padding: 18 }}>
        {/* Tab row: window pills + metric toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <WindowBtn label="30D" active={window === '30D'} onPress={() => setWindow('30D')} theme={theme} />
            <WindowBtn label="90D" locked={!isPremium} active={window === '90D'} onPress={() => { if (isPremium) setWindow('90D'); }} theme={theme} />
            <WindowBtn label="1Y"  locked={!isPremium} active={window === '1Y'}  onPress={() => { if (isPremium) setWindow('1Y'); }}  theme={theme} />
          </View>
          {/* Score / Price segmented toggle */}
          <View style={{
            flexDirection: 'row', borderRadius: 999,
            borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden',
          }}>
            {(['score', 'price'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMetric(m)}
                style={{
                  paddingHorizontal: 13, paddingVertical: 7,
                  backgroundColor: metric === m
                    ? (m === 'score' ? theme.accent : C.amber)
                    : 'transparent',
                }}
              >
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 12.5,
                  color: metric === m ? (theme.dark ? '#0D0D0D' : '#FFFFFF') : theme.muted,
                }}>
                  {m === 'score' ? 'Score' : 'Price'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : error ? (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.neg, textAlign: 'center', paddingVertical: 30 }}>
            {error}
          </Text>
        ) : (
          <>
            {/* Current value */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                {curLabel}
              </Text>
              <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 18, color, fontVariant: ['tabular-nums'] }}>
                {curVal}
              </Text>
            </View>

            {/* Chart */}
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'flex' }}>
              <Defs>
                <SvgLinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <Stop offset="100%" stopColor={color} stopOpacity={0} />
                </SvgLinearGradient>
              </Defs>
              {[0.25, 0.5, 0.75].map((g) => (
                <Path
                  key={g}
                  d={`M8,${H * g} L${W - 8},${H * g}`}
                  stroke={theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(21,23,26,0.06)'}
                  strokeWidth={1}
                />
              ))}
              {area ? <Path d={area} fill={`url(#${gid})`} /> : null}
              {d ? (
                <Path d={d} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {lastX > 0 ? (
                <Circle cx={lastX} cy={lastY} r={4.5} fill={color} stroke={C.cardBg} strokeWidth={2.5} />
              ) : null}
            </Svg>

            {/* Axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 11, color: theme.faint }}>
                {windowLabel}
              </Text>
              <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 11, color: theme.faint }}>
                today
              </Text>
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

export default function SKUDetailScreen() {
  const { id, filterKind, filterId } = useLocalSearchParams<{
    id: string;
    filterKind?: string;
    filterId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isDark = useAppStore((s) => s.isDark);
  const toggleWatchlist = useAppStore((s) => s.toggleWatchlist);
  const isPremium = useAppStore((s) => s.isPremium);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const stickerCatalog = useAppStore((s) => s.stickerCatalog);
  const watching = useAppStore((s) => s.watchlist.includes(id ?? ''));
  const collectionItem = useAppStore((s) => s.collection.find((c) => c.skuId === (id ?? '')));
  const inCollection = !!collectionItem;
  const removeFromCollection = useAppStore((s) => s.removeFromCollection);
  const updateCollectionItem = useAppStore((s) => s.updateCollectionItem);

  const theme = buildTheme(isDark);

  const filterList: SKU[] = React.useMemo(() => {
    if (!filterKind || !filterId) return [];
    const key = filterKind === 'category' ? 'category' : 'fandom';
    return [...hotSkus.filter((s) => s[key] === filterId)].sort((a, b) => b.hot - a.hot);
  }, [hotSkus, filterKind, filterId]);

  const filterIdx = filterList.findIndex((s) => s.id === id);
  const filterTotal = filterList.length;
  const filterLabel =
    filterKind === 'category' ? catById(filterId ?? '')?.label :
    filterKind === 'fandom'   ? fandomById(filterId ?? '')?.label :
    undefined;

  const navTo = (nextId: string) => {
    router.replace(`/sku/${nextId}?filterKind=${filterKind}&filterId=${filterId}`);
  };

  const storeBaseSku = id ? hotSkus.find((s) => s.id === id) : undefined;
  const [fetchedSku, setFetchedSku] = useState<SKU | null | undefined>(undefined);

  const [history, setHistory] = useState<number[]>([]);
  const [listingsHist, setListingsHist] = useState<number[]>([]);
  const [priceHist, setPriceHist] = useState<number[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // Always fetch fresh so admin changes (sticker_keys, etc.) are reflected immediately.
    // storeBaseSku is used as a visible placeholder while this is in flight.
    setFetchedSku(undefined);
    fetchSkuById(id)
      .then((s) => setFetchedSku(s ?? null))
      .catch(() => setFetchedSku(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchSkuHistory(id)
      .then(({ history: h, listingsHist: l, priceHist: p }) => {
        setHistory(h);
        setListingsHist(l);
        setPriceHist(p);
      })
      .catch(() => setHistoryError('Could not load history. Try again.'))
      .finally(() => setHistoryLoading(false));
  }, [id]);

  // Prefer fresh fetch; fall back to store copy so the screen renders immediately
  const baseSku = fetchedSku != null ? fetchedSku : (storeBaseSku ?? undefined);
  const sku: SKU | undefined = baseSku
    ? { ...baseSku, history, listingsHist, priceHist }
    : undefined;

  const stillFetching = fetchedSku === undefined && !storeBaseSku;

  const cat = sku ? catById(sku.category) : undefined;
  const fandom = sku ? fandomById(sku.fandom) : undefined;
  const c = sku ? categoryColor(sku.category, isDark) : undefined;

  const [shareOpen, setShareOpen]           = useState(false);
  const [addOpen, setAddOpen]               = useState(false);
  const [alertOpen, setAlertOpen]           = useState(false);
  const [historyWindow, setHistoryWindow]   = useState<HistoryWindow>('30D');
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [insightData, setInsightData]       = useState<InsightResponse | null>(null);

  const userId = useAppStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!id) return;
    fetchSkuInsight(id, userId, isPremium)
      .then(setInsightData)
      .catch(() => {});
  }, [id, userId, isPremium]);

  const activeAlertCount = useAppStore((s) =>
    s.priceAlerts.filter((a) => a.skuId === (id ?? '') && a.isActive).length
  );

  const BOTTOM_BAR_H = 76 + insets.bottom;
  const NAV_H = insets.top + (Platform.OS === 'android' ? 8 : 0) + 52;
  const HERO_MAX = 300 + NAV_H;

  const scrollY = useRef(new Animated.Value(0)).current;

  const heroCropH = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [HERO_MAX, NAV_H + 16],
    extrapolate: 'clamp',
  });
  const heroImgScale = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });
  const heroImgOpacity = scrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const tickerHeight = scrollY.interpolate({
    inputRange: [130, 220],
    outputRange: [0, 56],
    extrapolate: 'clamp',
  });

  // Solid nav background fades in as user scrolls past hero so content
  // doesn't bleed through the transparent bottom of the hero gradient.
  const navBgOpacity = scrollY.interpolate({
    inputRange: [80, NAV_H],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  if (stillFetching || (!sku && !fetchedSku && fetchedSku !== null)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!sku || !c) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: theme.fontDispBold, fontSize: 20, color: theme.text, textAlign: 'center', marginBottom: 8 }}>
          Item not found
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted, textAlign: 'center', marginBottom: 24 }}>
          This item may still be processing. Check back in a few minutes.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            backgroundColor: theme.accent, borderRadius: theme.radius,
            paddingHorizontal: 24, paddingVertical: 12, opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.accentInk }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const deltaColor = sku.delta > 0 ? C.green : sku.delta < 0 ? theme.neg : C.green;
  const deltaLabel = sku.delta > 0 ? `+${sku.delta}` : sku.delta < 0 ? `−${Math.abs(sku.delta)}` : `+${sku.delta}`;

  const marketplaces = [
    ...(sku.ebay_url ? [{
      id: 'ebay',
      name: 'eBay',
      url: sku.ebay_url,
      listings: sku.listings,
      median: sku.price.median,
      primary: true,
    }] : []),
    ...(sku.mercari_url ? [{
      id: 'mercari',
      name: 'Mercari',
      url: sku.mercari_url,
      listings: null as number | null,
      median: null as number | null,
      primary: false,
    }] : []),
    ...(sku.popnbeats_url ? [{
      id: 'popnbeats',
      name: 'PopnBeats',
      url: sku.popnbeats_url,
      listings: null as number | null,
      median: null as number | null,
      primary: false,
    }] : []),
  ];

  const totalSoldCount = (sku.priceMintCount ?? 0) + (sku.priceLooseCount ?? 0);
  const salesLabel = totalSoldCount > 0 ? 'Recent Sales' : 'Listings';
  const salesValue = totalSoldCount > 0 ? totalSoldCount : sku.listings;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>

      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_BAR_H + 24 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* ── Collapsing hero — dark bg with dot texture ── */}
        <Animated.View style={{ height: heroCropH, overflow: 'hidden', position: 'relative', backgroundColor: theme.bg }}>
          {isDark && <DotPattern height={HERO_MAX} />}
          {/* Image centered below nav, scales + fades on scroll */}
          <Animated.View style={{
            position: 'absolute',
            top: NAV_H,
            left: 0, right: 0, bottom: 0,
            flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: heroImgScale }],
            opacity: heroImgOpacity,
          }}>
            {(() => {
              const stickers = (sku.stickerKeys ?? []).slice(0, 3)
                .map((k) => stickerCatalog[k] ?? STICKERS[k])
                .filter(Boolean) as StickerDef[];
              if (stickers.length === 0) {
                return (
                  <ProductPlaceholder
                    sku={sku}
                    theme={theme}
                    size="xl"
                    showTag={false}
                    style={{ backgroundColor: 'transparent' }}
                  />
                );
              }
              const heroGlow = stickers[0].glow;
              return (
                <>
                  {/* Glow frame around product image */}
                  <View style={{ position: 'relative' }}>
                    {/* Aura */}
                    <View style={{
                      position: 'absolute', top: -14, left: -14, right: -14, bottom: -14,
                      borderRadius: 26,
                      backgroundColor: heroGlow + '14',
                      shadowColor: heroGlow,
                      shadowRadius: 30,
                      shadowOpacity: 0.55,
                      shadowOffset: { width: 0, height: 0 },
                    }} />
                    {/* Frame */}
                    <View style={{
                      borderRadius: 14, padding: 6,
                      backgroundColor: heroGlow + '22',
                      borderWidth: 1, borderColor: heroGlow + '55',
                      shadowColor: heroGlow,
                      shadowRadius: 16,
                      shadowOpacity: 0.35,
                      shadowOffset: { width: 0, height: 0 },
                    }}>
                      <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                        <ProductPlaceholder
                          sku={sku}
                          theme={theme}
                          size="lg"
                          showTag={false}
                          style={{ backgroundColor: 'transparent' }}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Sticker tray — docked beside image, never overlapping */}
                  <View style={{
                    flexDirection: 'column', alignItems: 'center', gap: 12,
                    paddingVertical: 12, paddingHorizontal: 9,
                    marginLeft: 14,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.025)',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
                  }}>
                    {stickers.map((s, i) => (
                      <ExclusiveSticker key={s.key} sticker={s} size={66} delay={180 + i * 150} animate />
                    ))}
                  </View>
                </>
              );
            })()}
          </Animated.View>
        </Animated.View>

        {/* ── Title block ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 18, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {cat && (
              <View style={{
                borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
                backgroundColor: isDark ? '#E1E4E6' : '#15171A',
              }}>
                <Text style={{
                  fontFamily: 'Inter_700Bold', fontSize: 12, color: isDark ? '#0D0D0D' : '#FFFFFF',
                  letterSpacing: 1.4, textTransform: 'uppercase',
                }}>
                  {cat.short}
                </Text>
              </View>
            )}
            <Text
              style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted,
                letterSpacing: 1.0, textTransform: 'uppercase', flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {sku.series}
            </Text>
          </View>
          <Text style={{
            fontFamily: 'Fraunces_700Bold', fontSize: 31, color: theme.text,
            letterSpacing: -0.6, lineHeight: 33,
          }}>
            {sku.name}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 15 }}>
            {fandom && <Chip theme={theme} size="sm">{fandom.label}</Chip>}
            {sku.category === 'tcg' && sku.cardVariant && (
              <Chip theme={theme} size="sm" active>
                {sku.cardVariant === 'raw'
                  ? 'Raw'
                  : `Graded${sku.cardGrader ? ` · ${sku.cardGrader}` : ''}${sku.cardGrade ? ` ${sku.cardGrade}` : ''}`}
              </Chip>
            )}
            {sku.exclusiveType && (() => {
              const BADGE: Record<string, { label: string; bg: string }> = {
                chase:        { label: 'Chase',           bg: '#FF5500' },
                grail:        { label: 'Grail',           bg: '#FF5500' },
                gitd:         { label: 'GITD',            bg: '#16A34A' },
                flocked:      { label: 'Flocked',         bg: '#78350F' },
                sdcc:         { label: 'SDCC',            bg: '#7C3AED' },
                convention:   { label: 'Con Exclusive',   bg: '#7C3AED' },
                limited:      { label: 'LE',              bg: '#D97706' },
                rare_variant: { label: 'Rare Variant',    bg: '#4338CA' },
                vaulted:      { label: 'Vaulted',         bg: '#E11D48' },
                htf:          { label: 'HTF',             bg: '#E11D48' },
                retailer:     { label: 'Store Exclusive', bg: '#A82200' },
                signed:       { label: 'Signed',          bg: '#475569' },
              };
              const b = BADGE[sku.exclusiveType];
              if (!b) return null;
              return (
                <View style={{
                  height: 36, paddingHorizontal: 14, borderRadius: 999,
                  backgroundColor: b.bg, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' }}>
                    {b.label}
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>

        {/* ── Hot Score card — sparkline + TierPill + delta ── */}
        <View style={{ marginHorizontal: 18, marginTop: 20, marginBottom: 4 }}>
          <Card isDark={isDark} style={{ padding: 18 }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.muted,
                letterSpacing: 1.3, textTransform: 'uppercase',
              }}>
                Hot Score
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{
                  fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.muted,
                  letterSpacing: 1.0, textTransform: 'uppercase',
                }}>
                  24H
                </Text>
                <Svg width={22} height={13} viewBox="0 0 22 13" fill="none">
                  <Path d="M5 9V2M5 2L2.5 4.5M5 2l2.5 2.5" stroke={theme.muted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M14 4v7M14 11l2.5-2.5M14 11l-2.5-2.5" stroke={theme.muted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            </View>
            {/* Body row: sparkline (if available) | TierPill | spacer | delta */}
            {(() => {
              const hasHistory = sku.history.filter((v) => v > 0).length >= 2;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {hasHistory && (
                    <Sparkline
                      data={sku.history}
                      theme={theme}
                      w={84}
                      h={34}
                      color={theme.accent}
                    />
                  )}
                  <TierPill score={sku.hot} direction={sku.direction} isDark={isDark} />
                  <View style={{ flex: 1 }} />
                  <Text style={{
                    fontFamily: 'JetBrainsMono_700Bold', fontSize: 28, color: deltaColor,
                    letterSpacing: -0.56, fontVariant: ['tabular-nums'], lineHeight: 30,
                  }}>
                    {deltaLabel}
                  </Text>
                </View>
              );
            })()}
          </Card>
        </View>

        {/* ── Stats grid ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 8, gap: 8 }}>
          {/* Row 1: Median / Lowest / Highest */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox label="Median"  value={fmtPrice(sku.price.median)} isDark={isDark} valueColor={C.amber} />
            <StatBox label="Lowest"  value={fmtPrice(sku.price.low)}    isDark={isDark} />
            <StatBox label="Highest" value={fmtPrice(sku.price.high)}   isDark={isDark} />
          </View>
          {/* Row 2: Listings / Days Tracked */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox label={salesLabel}    value={String(salesValue)} isDark={isDark} />
            {sku.age >= 1 && (
              <StatBox label="Days Tracked" value={`${sku.age}d`} isDark={isDark} />
            )}
          </View>
          {/* Row 3: Community prices — PPG (Funko only) and/or Retail — only shown when available */}
          {(sku.ppgPrice != null || sku.retailPrice != null) && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sku.ppgPrice != null && (
                <View style={{ flex: 1 }}>
                  <StatBox label="PPG Price" value={fmtPrice(sku.ppgPrice)} isDark={isDark} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: C.gold, marginTop: 3, paddingHorizontal: 2, letterSpacing: 0.3 }}>
                    ⚡ community
                  </Text>
                </View>
              )}
              {sku.retailPrice != null && (
                <View style={{ flex: 1 }}>
                  <StatBox label="Retail Price" value={fmtPrice(sku.retailPrice)} isDark={isDark} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: C.gold, marginTop: 3, paddingHorizontal: 2, letterSpacing: 0.3 }}>
                    ⚡ community
                  </Text>
                </View>
              )}
              {/* Fill remaining space so layout stays balanced */}
              {sku.ppgPrice != null && sku.retailPrice == null && <View style={{ flex: 1 }} />}
              {sku.retailPrice != null && sku.ppgPrice == null && <View style={{ flex: 1 }} />}
            </View>
          )}
        </View>

        {/* ── Condition breakdown ── */}
        {((sku.priceMint != null && (sku.priceMintCount ?? 0) >= 2) ||
          (sku.priceLoose != null && (sku.priceLooseCount ?? 0) >= 2)) && (
          <View style={{ marginHorizontal: 18, marginTop: 8 }}>
            <Card isDark={isDark} style={{ padding: 0 }}>
              <View style={{
                paddingHorizontal: 16, paddingVertical: 10,
                borderBottomWidth: 0.5, borderBottomColor: C.cardBorder,
              }}>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted,
                  letterSpacing: 1.1, textTransform: 'uppercase',
                }}>
                  Condition breakdown
                </Text>
              </View>
              {sku.priceMint != null && (sku.priceMintCount ?? 0) >= 2 && (
                <View style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 13,
                  borderBottomWidth: sku.priceLoose != null && (sku.priceLooseCount ?? 0) >= 2 ? 0.5 : 0,
                  borderBottomColor: C.cardBorder,
                }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.text }}>
                    Mint / Complete
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, color: theme.text,
                      fontVariant: ['tabular-nums'],
                    }}>
                      {fmtPrice(sku.priceMint)}
                    </Text>
                    <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 11, color: theme.muted }}>
                      {sku.priceMintCount} sales
                    </Text>
                  </View>
                </View>
              )}
              {sku.priceLoose != null && (sku.priceLooseCount ?? 0) >= 2 && (
                <View style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 13,
                }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.muted }}>
                    Loose / OOB
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, color: theme.muted,
                      fontVariant: ['tabular-nums'],
                    }}>
                      {fmtPrice(sku.priceLoose)}
                    </Text>
                    <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 11, color: theme.faint }}>
                      {sku.priceLooseCount} sales
                    </Text>
                  </View>
                </View>
              )}
            </Card>
          </View>
        )}

        {/* ── Your position ── */}
        {inCollection && collectionItem && (() => {
          const myQty          = collectionItem.qty;
          const myTotalCost    = collectionItem.purchased * myQty;
          const myCurrentValue = sku.price.median * myQty;
          const myPL           = myCurrentValue - myTotalCost;
          const myPLPct        = myTotalCost > 0 ? (myPL / myTotalCost) * 100 : 0;
          const myPLPos        = myPL >= 0;
          const plColor        = myPLPos ? C.green : theme.neg;
          return (
            <View style={{ marginHorizontal: 18, marginTop: 8 }}>
              <Card isDark={isDark} style={{ padding: 0 }}>
                <View style={{
                  paddingHorizontal: 16, paddingVertical: 12,
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  borderBottomWidth: 0.5, borderBottomColor: C.cardBorder,
                }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                    Your position
                  </Text>
                  {myTotalCost > 0 && isPremium && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 30, color: plColor, fontVariant: ['tabular-nums'], lineHeight: 32 }}>
                        {myPLPos ? '+' : '−'}${Math.abs(Math.round(myPL)).toLocaleString()}
                      </Text>
                      <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 13, color: plColor, marginTop: 3 }}>
                        {myPLPos ? '+' : ''}{myPLPct.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                  {myTotalCost > 0 && !isPremium && (
                    <Pressable
                      onPress={() => setUpgradeContext('pl')}
                      style={({ pressed }) => ({
                        alignItems: 'flex-end',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                        </Svg>
                        <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 30, color: C.gold, fontVariant: ['tabular-nums'], lineHeight: 32 }}>
                          +$•••
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: C.gold, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        TAP TO UNLOCK
                      </Text>
                    </Pressable>
                  )}
                </View>
                {/* Divider */}
                <View style={{ height: 1, backgroundColor: C.cardBorder, marginHorizontal: 0 }} />
                {/* Qty / Paid / Value grid */}
                <View style={{ flexDirection: 'row', padding: 14, gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Qty</Text>
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 23, color: theme.text, fontVariant: ['tabular-nums'] }}>×{myQty}</Text>
                  </View>
                  <View style={{ flex: 1, borderLeftWidth: 0.5, borderLeftColor: theme.hairline, paddingLeft: 14 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Paid</Text>
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 23, color: theme.text, fontVariant: ['tabular-nums'] }}>${Math.round(myTotalCost).toLocaleString()}</Text>
                  </View>
                  <View style={{ flex: 1, borderLeftWidth: 0.5, borderLeftColor: theme.hairline, paddingLeft: 14 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Value</Text>
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 23, color: C.amber, fontVariant: ['tabular-nums'] }}>${Math.round(myCurrentValue).toLocaleString()}</Text>
                  </View>
                </View>
                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingBottom: 14 }}>
                  <Pressable
                    onPress={() => updateCollectionItem(collectionItem.skuId, { forSale: !collectionItem.forSale })}
                    style={({ pressed }) => ({
                      flex: 1, height: 52, borderRadius: 13,
                      backgroundColor: collectionItem.forSale ? 'rgba(241,194,76,0.08)' : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(21,23,26,0.04)'),
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: collectionItem.forSale ? 'rgba(241,194,76,0.40)' : C.cardBorder,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: collectionItem.forSale ? C.gold : theme.text }}>
                      {collectionItem.forSale ? '✓ For sale' : 'List for sale'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Mark as sold', `Remove ${sku.name} from your collection?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Mark sold', onPress: () => removeFromCollection(collectionItem.skuId) },
                      ])
                    }
                    style={({ pressed }) => ({
                      flex: 1, height: 52, borderRadius: 13,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(21,23,26,0.04)',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: theme.hairline,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: theme.text }}>
                      Mark as sold
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Remove from collection', `Remove ${sku.name}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeFromCollection(collectionItem.skuId) },
                      ])
                    }
                    style={({ pressed }) => ({
                      width: 52, height: 52, borderRadius: 13,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(21,23,26,0.04)',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: theme.hairline,
                      opacity: pressed ? 0.7 : 1,
                    })}
                    accessibilityLabel="Remove from collection"
                  >
                    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={theme.neg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </Svg>
                  </Pressable>
                </View>
              </Card>
            </View>
          );
        })()}

        {/* ── Why it's hot ── */}
        {/* WhyCard — blockquote with purple left bar, NO card wrapper */}
        {(() => {
          if (insightData === null) return null; // still loading
          const insight = insightData.insight;
          const hasRealInsight = !!insight && insight.insightType !== 'low_data' && insight.insightType !== 'steady_state';
          const showInsight = isPremium && hasRealInsight && !!insight.narrationLong;
          const prose = showInsight
            ? insight.narrationLong!
            : (sku.narrative || insightData.fallbackDescription ||
               'Market data for this item is still building — check back in a few days for a full analysis.');
          if (!prose) return null;
          return (
            <>
            <SectionHeader title="Why it's hot" isDark={isDark} />
            <View style={{ marginHorizontal: 18 }}>
              {showInsight && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <InsightTypePill insightType={insight.insightType} theme={theme} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.muted }}>
                    {formatFiredAt(insight.firedAt)}
                  </Text>
                </View>
              )}
              <View style={{ position: 'relative', paddingLeft: 18 }}>
                <View style={{
                  position: 'absolute', left: 0, top: 4, bottom: 4,
                  width: 3, borderRadius: 3, backgroundColor: C.purple,
                }} />
                <Text style={{
                  fontFamily: 'Fraunces_400Regular_Italic', fontStyle: 'italic',
                  fontSize: 18.5, lineHeight: 27.75,
                  color: theme.text,
                }}>
                  {showInsight ? prose : `"${prose}"`}
                </Text>
              </View>

              {/* Personalized action (premium) */}
              {(() => {
                const action = insightData?.personalizedAction;
                if (!isPremium || !action) return null;
                return (
                  <View style={{
                    backgroundColor: 'rgba(249,115,22,0.08)',
                    borderLeftWidth: 3, borderLeftColor: '#f97316',
                    borderRadius: 6, padding: 14, marginTop: 16,
                  }}>
                    <Text style={{
                      fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.muted,
                      letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6,
                    }}>
                      FOR YOUR POSITION
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.text, lineHeight: 20 }}>
                      {action}
                    </Text>
                  </View>
                );
              })()}

              {/* Premium tease — only when there's a real (non-low_data, non-steady_state) insight available */}
              {!isPremium && hasRealInsight && insight!.narrationLong && (
                <Pressable
                  onPress={() => setUpgradeContext('feature')}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: 'rgba(241,194,76,0.08)',
                    borderWidth: 1, borderColor: 'rgba(241,194,76,0.28)',
                    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
                    marginTop: 16,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: C.gold, letterSpacing: 0.3 }}>
                      Premium insight available
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2, lineHeight: 17 }}>
                      Read the full breakdown and see what to do with this signal.
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: C.gold }}>→</Text>
                </Pressable>
              )}
            </View>
            </>
          );
        })()}

        {/* ── Score breakdown — separate Card ── */}
        <View style={{ marginHorizontal: 18, marginTop: 20 }}>
          <Card isDark={isDark} style={{ padding: 18 }}>
            <Text style={{
              fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.muted,
              letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 18,
            }}>
              Score breakdown
            </Text>
            <ScoreBar
              label="Velocity"
              value={sku.score.velocity}
              hint={sku.score.velocity === 0 ? 'Listings stable — no new supply detected' : 'Listing count is growing'}
              color={C.scoreBars[0]}
              isDark={isDark}
            />
            <ScoreBar
              label="Volume"
              value={sku.score.volume}
              hint="Active listing count"
              color={C.scoreBars[1]}
              isDark={isDark}
            />
            <ScoreBar
              label="Confirmation"
              value={sku.score.confirmation}
              hint="Price momentum vs 7-day avg"
              color={C.scoreBars[2]}
              isDark={isDark}
            />
            <ScoreBar
              label="Freshness"
              value={sku.score.freshness}
              hint="Recent appearance"
              color={C.scoreBars[3]}
              isDark={isDark}
            />
          </Card>
        </View>

        {/* ── Where to buy ── */}
        <SectionHeader title="Where to buy" isDark={isDark} />
        <View style={{ marginHorizontal: 18, gap: 8 }}>
          {marketplaces.length === 0 ? (
            <Card isDark={isDark} style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, textAlign: 'center' }}>
                No marketplace links set yet.{'\n'}Check back after the next pipeline run.
              </Text>
            </Card>
          ) : marketplaces.map((mp) => (
            <Pressable
              key={mp.id}
              accessibilityRole="link"
              accessibilityLabel={`Open ${mp.name}`}
              onPress={() => Linking.openURL(mp.url).catch(() => {})}
              style={({ pressed }) => ({
                backgroundColor: mp.primary
                  ? (isDark ? `rgba(255,85,0,0.07)` : 'rgba(255,85,0,0.05)')
                  : (isDark ? C.cardBg : '#fff'),
                borderRadius: 20,
                padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                opacity: pressed ? 0.78 : 1,
                borderWidth: 1,
                borderColor: mp.primary ? theme.accent : (isDark ? C.cardBorder : 'rgba(0,0,0,0.07)'),
              })}
            >
              <View style={{
                width: 46, height: 46, borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{
                  fontFamily: 'Fraunces_700Bold', fontSize: 17,
                  color: mp.primary ? theme.accent : theme.text, letterSpacing: -0.2,
                }}>
                  {mp.name.slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 19, color: theme.text, letterSpacing: -0.2 }}>
                  {mp.name}
                </Text>
                {mp.listings != null && mp.median != null ? (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, color: theme.muted, marginTop: 2 }}>
                    {mp.listings} listings · median{' '}
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: C.amber }}>
                      {fmtPrice(mp.median)}
                    </Text>
                  </Text>
                ) : (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, color: theme.muted, marginTop: 2 }}>
                    View listings
                  </Text>
                )}
              </View>
              <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                <Path d="M4 10l6-6M5 4h5v5" stroke={theme.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          ))}
        </View>

        {/* ── History ── */}
        <SectionHeader title="History" isDark={isDark} />
        <HistoryCard
          sku={sku}
          theme={theme}
          isPremium={isPremium}
          window={historyWindow}
          setWindow={setHistoryWindow}
          loading={historyLoading}
          error={historyError}
        />
      </Animated.ScrollView>

      {/* ── Sticky top bar + collapsing ticker ── */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}
      >
        {/* Back / filter-pill / share row */}
        <View style={{
          height: NAV_H, flexDirection: 'row', alignItems: 'flex-end',
          paddingBottom: 6, paddingHorizontal: 16,
        }}>
          {/* Dark top fade so buttons are visible over the hero image */}
          <LinearGradient
            colors={['rgba(13,13,13,0.72)', 'rgba(13,13,13,0.40)', 'transparent']}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* Solid fill that fades in once scrolled past hero, sealing the gap */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, {
              backgroundColor: isDark ? '#0D0D0D' : theme.navBg,
              opacity: navBgOpacity,
            }]}
          />

          {/* Back button — design pill style */}
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 999,
              backgroundColor: C.navPill,
              borderWidth: 1, borderColor: C.cardBorder,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Svg width={11} height={18} viewBox="0 0 11 18" fill="none">
              <Path d="M9 2L2 9l7 7" stroke="#c8cee0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="box-none">
            {filterTotal > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 999, paddingVertical: 5, paddingHorizontal: 2,
              }}>
                <Pressable
                  onPress={() => filterIdx > 0 && navTo(filterList[filterIdx - 1].id)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous item"
                  accessibilityState={{ disabled: filterIdx <= 0 }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10, paddingVertical: 6,
                    opacity: filterIdx > 0 ? (pressed ? 0.5 : 1) : 0.3,
                  })}
                >
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E1E4E6" strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M15 18l-6-6 6-6" />
                  </Svg>
                </Pressable>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#E1E4E6', letterSpacing: -0.1,
                }} numberOfLines={1}>
                  {filterLabel ?? filterId ?? ''} {filterIdx >= 0 ? filterIdx + 1 : 1}/{filterTotal}
                </Text>
                <Pressable
                  onPress={() => filterIdx < filterTotal - 1 && navTo(filterList[filterIdx + 1].id)}
                  accessibilityRole="button"
                  accessibilityLabel="Next item"
                  accessibilityState={{ disabled: filterIdx >= filterTotal - 1 }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10, paddingVertical: 6,
                    opacity: filterIdx < filterTotal - 1 ? (pressed ? 0.5 : 1) : 0.3,
                  })}
                >
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E1E4E6" strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M9 18l6-6-6-6" />
                  </Svg>
                </Pressable>
              </View>
            )}
          </View>

          {/* Share button — design pill style */}
          <Pressable
            onPress={() => setShareOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Share this SKU"
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 999,
              backgroundColor: C.navPill,
              borderWidth: 1, borderColor: C.cardBorder,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Svg width={18} height={20} viewBox="0 0 18 20" fill="none">
              <Path d="M9 13V2.5M9 2.5L5.5 6M9 2.5L12.5 6" stroke="#c8cee0" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M3.5 9.5H2.5V18h13V9.5h-1" stroke="#c8cee0" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>

        {/* Ticker — slides down on scroll */}
        <Animated.View style={{
          height: tickerHeight,
          overflow: 'hidden',
          backgroundColor: isDark ? 'rgba(13,13,13,0.97)' : theme.navBg,
          borderBottomWidth: 0.5,
          borderBottomColor: C.cardBorder,
        }}>
          <View style={{
            height: 56,
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, gap: 10,
          }}>
            <ProductThumb sku={sku} theme={theme} size={34} radius={5} />
            <Text style={{
              flex: 1, fontFamily: 'Fraunces_700Bold', fontSize: 15,
              color: theme.text, letterSpacing: -0.2,
            }} numberOfLines={1}>
              {sku.short || sku.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: C.gold }} />
              <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 16, color: theme.text }}>
                {sku.hot}
              </Text>
            </View>
            <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 16, color: C.amber }}>
              {fmtPrice(sku.price.median)}
            </Text>
            <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, color: deltaColor }}>
              {deltaLabel}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Bottom action bar ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingTop: 12, paddingBottom: insets.bottom + 12,
        paddingHorizontal: 14,
        flexDirection: 'row', gap: 10, alignItems: 'stretch',
        backgroundColor: isDark ? 'rgba(13,13,13,0.96)' : theme.navBg,
        borderTopWidth: 0.5, borderTopColor: C.cardBorder,
      }}>
        {/* Watch button */}
        <Pressable
          onPress={() => {
            const added = toggleWatchlist(sku.id);
            if (!added) setUpgradeContext('watchlist');
          }}
          accessibilityRole="button"
          accessibilityLabel={watching ? 'Remove from watchlist' : 'Add to watchlist'}
          accessibilityState={{ selected: watching }}
          style={({ pressed }) => ({
            flex: 1, height: 52,
            borderWidth: 1.5,
            borderColor: watching ? theme.accent : (isDark ? 'rgba(255,255,255,0.13)' : theme.hairline),
            backgroundColor: watching
              ? (isDark ? `rgba(255,85,0,0.12)` : `rgba(255,85,0,0.08)`)
              : 'transparent',
            borderRadius: 15,
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 9,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Svg width={20} height={14} viewBox="0 0 20 14" fill="none">
            <Path d="M1 7s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke={watching ? theme.accent : '#8A9296'} strokeWidth={1.8} />
            <Circle cx="10" cy="7" r="2.6" stroke={watching ? theme.accent : '#8A9296'} strokeWidth={1.8} fill={watching ? theme.accent : 'none'} />
          </Svg>
          <Text style={{
            fontFamily: 'Inter_700Bold', fontSize: 15.5,
            color: watching ? theme.accent : '#8A9296',
          }}>
            {watching ? 'Watching' : 'Watch'}
          </Text>
        </Pressable>

        {/* Bell button (only shown when watching) */}
        {watching && (
          <Pressable
            onPress={() => isPremium ? setAlertOpen(true) : setUpgradeContext('priceAlerts')}
            accessibilityLabel="Set price alert"
            style={({ pressed }) => ({
              width: 56, height: 52,
              borderWidth: 1,
              borderColor: activeAlertCount > 0 ? 'rgba(241,194,76,0.40)' : (isDark ? 'rgba(255,255,255,0.13)' : theme.hairline),
              backgroundColor: activeAlertCount > 0 ? 'rgba(241,194,76,0.08)' : 'transparent',
              borderRadius: 15,
              alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Svg width={18} height={20} viewBox="0 0 18 20" fill="none">
              <Path d="M4 8a5 5 0 0 1 10 0c0 4 1.5 6 1.5 6h-13S4 12 4 8Z" stroke={activeAlertCount > 0 ? C.gold : '#8A9296'} strokeWidth={1.8} strokeLinejoin="round" />
              <Path d="M7.5 17a1.8 1.8 0 0 0 3 0" stroke={activeAlertCount > 0 ? C.gold : '#8A9296'} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
            {activeAlertCount > 0 && (
              <View style={{
                position: 'absolute', top: -7, right: -7,
                width: 22, height: 22, borderRadius: 999,
                backgroundColor: C.gold,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: isDark ? '#0D0D0D' : theme.bg,
              }}>
                <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 12, color: '#1a1505' }}>
                  {activeAlertCount}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {/* Add to collection button */}
        <Pressable
          onPress={() => setAddOpen(true)}
          style={({ pressed }) => ({
            flex: 1.3, height: 52,
            borderRadius: 15,
            backgroundColor: inCollection ? 'rgba(255,255,255,0.10)' : theme.accent,
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 9,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {inCollection ? (
            <>
              <Svg width={18} height={14} viewBox="0 0 18 14" fill="none">
                <Path d="M2 7.5L6.5 12 16 2" stroke="#E1E4E6" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15.5, color: '#E1E4E6' }}>
                In Collection
              </Text>
            </>
          ) : (
            <>
              <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                <Path d="M8 2v12M2 8h12" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" />
              </Svg>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15.5, color: '#FFFFFF' }}>
                Add to Collection
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Sheets ── */}
      <IOSShareSheet
        open={shareOpen}
        theme={theme}
        previewTitle={sku.name}
        previewSub={`${sku.series} · Hot Score ${sku.hot}`}
        previewUrl="trendnable.app/sku"
        onClose={() => setShareOpen(false)}
      />

      <AddToCollectionSheet
        open={addOpen}
        skuId={sku.id}
        theme={theme}
        onClose={() => setAddOpen(false)}
        onConfirm={() => setAddOpen(false)}
      />

      <UpgradeSheet
        open={upgradeContext !== null}
        context={upgradeContext ?? 'watchlist'}
        theme={theme}
        onClose={() => setUpgradeContext(null)}
        onConfirm={() => setUpgradeContext(null)}
      />

      {sku && (
        <PriceAlertSheet
          open={alertOpen}
          sku={sku}
          theme={theme}
          onClose={() => setAlertOpen(false)}
          onUpgrade={() => { setAlertOpen(false); setUpgradeContext('priceAlerts'); }}
        />
      )}
    </View>
  );
}
