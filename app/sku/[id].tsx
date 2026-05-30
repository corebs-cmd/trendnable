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
import Svg, { Path, Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { buildTheme, categoryColor, RADIUS } from '@/lib/theme';
import { catById, fandomById, fmtPrice } from '@/lib/appConfig';
import { useAppStore } from '@/stores/appStore';
import { fetchSkuHistory, fetchSkuById, fetchSkuInsight } from '@/lib/api';
import { SKU, InsightResponse } from '@/lib/types';

import { HotScoreBadge } from '@/components/HotScore';
import { InsightTypePill } from '@/components/signals/DirectionBadge';
import Chip from '@/components/Chip';
import LineChart from '@/components/LineChart';
import IconButton from '@/components/IconButton';
import PrimaryButton from '@/components/PrimaryButton';
import IOSShareSheet from '@/components/IOSShareSheet';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';
import ProductPlaceholder from '@/components/ProductPlaceholder';
import UpgradeSheet from '@/components/UpgradeSheet';
import PriceAlertSheet from '@/components/PriceAlertSheet';
import { UpgradeContext } from '@/lib/types';

const { width: SCREEN_W } = Dimensions.get('window');

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

function SectionHeader({ title, theme }: {
  title: string;
  theme: ReturnType<typeof buildTheme>;
}) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: 10 }}>
      <Text style={{
        fontFamily: 'Fraunces_700Bold', fontSize: 24,
        color: theme.text, letterSpacing: -0.4, lineHeight: 28,
      }}>
        {title}
      </Text>
    </View>
  );
}

function StatBox({ label, value, theme, valueColor }: {
  label: string;
  value: string;
  theme: ReturnType<typeof buildTheme>;
  valueColor?: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: theme.radius, padding: 14 }}>
      <Text style={{
        fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted,
        letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </Text>
      <Text style={{
        fontFamily: 'JetBrainsMono_700Bold', fontSize: 17, color: valueColor ?? theme.text,
        letterSpacing: -0.3, fontVariant: ['tabular-nums'],
      }}>
        {value}
      </Text>
    </View>
  );
}

function ScoreBar({ label, value, max = 30, hint, theme }: {
  label: string;
  value: number;
  max?: number;
  hint: string;
  theme: ReturnType<typeof buildTheme>;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 17, color: theme.text }}>{label}</Text>
        <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, color: theme.muted, fontVariant: ['tabular-nums'] }}>
          {value}<Text style={{ color: theme.faint }}> / {max}</Text>
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: theme.hotBarTrack, borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ height: 5, width: `${pct}%`, backgroundColor: theme.accent, borderRadius: 999 }} />
      </View>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.faint, marginTop: 5 }}>{hint}</Text>
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
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
        backgroundColor: active ? theme.surface2 : 'transparent',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text style={{
        fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
        fontSize: 12.5,
        color: locked ? theme.faint : active ? theme.text : theme.muted,
      }}>
        {label}{locked ? ' ◆' : ''}
      </Text>
    </Pressable>
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
    if (storeBaseSku) { setFetchedSku(null); return; }
    setFetchedSku(undefined);
    fetchSkuById(id)
      .then((s) => setFetchedSku(s ?? null))
      .catch(() => setFetchedSku(null));
  }, [id, storeBaseSku]);

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

  const baseSku = storeBaseSku ?? (fetchedSku ?? undefined);
  const sku: SKU | undefined = baseSku
    ? { ...baseSku, history, listingsHist, priceHist }
    : undefined;

  const stillFetching = !storeBaseSku && fetchedSku === undefined;

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

  // Scroll-driven animation
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
  const tickerOpacity = scrollY.interpolate({
    inputRange: [130, 210],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const tickerHeight = scrollY.interpolate({
    inputRange: [130, 210],
    outputRange: [0, 56],
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

  const deltaColor = sku.delta >= 0 ? theme.pos : theme.neg;
  const deltaLabel = sku.delta >= 0 ? `+${sku.delta}` : `${sku.delta}`;

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
        {/* ── Collapsing hero ── */}
        <Animated.View style={{ height: heroCropH, overflow: 'hidden', position: 'relative' }}>
          <LinearGradient
            colors={[c.tint, c.tint2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {isDark && <DotPattern height={HERO_MAX} />}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(0,0,0,0.10)' : 'transparent' }]}
          />
          {/* Image centered below nav, scales + fades on scroll */}
          <Animated.View style={{
            position: 'absolute',
            top: NAV_H,
            left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: heroImgScale }],
            opacity: heroImgOpacity,
          }}>
            <ProductPlaceholder
              sku={sku}
              theme={theme}
              size="xl"
              showTag={false}
              style={{ backgroundColor: 'transparent' }}
            />
          </Animated.View>
        </Animated.View>

        {/* ── Title block ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 18, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {cat && (
              <View style={{
                borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
                backgroundColor: isDark ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.08)',
                borderWidth: 1, borderColor: c.ink + '50',
              }}>
                <Text style={{
                  fontFamily: 'Inter_700Bold', fontSize: 11, color: c.ink,
                  letterSpacing: 1.1, textTransform: 'uppercase',
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
            fontFamily: 'Fraunces_700Bold', fontSize: 28, color: theme.text,
            letterSpacing: -0.62, lineHeight: 32,
          }}>
            {sku.name}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
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
                chase:        { label: 'Chase',           bg: '#F97316' },
                grail:        { label: 'Grail',           bg: '#F97316' },
                gitd:         { label: 'GITD',            bg: '#16A34A' },
                flocked:      { label: 'Flocked',         bg: '#78350F' },
                sdcc:         { label: 'SDCC',            bg: '#7C3AED' },
                convention:   { label: 'Con Exclusive',   bg: '#7C3AED' },
                limited:      { label: 'LE',              bg: '#D97706' },
                rare_variant: { label: 'Rare Variant',    bg: '#4338CA' },
                vaulted:      { label: 'Vaulted',         bg: '#E11D48' },
                htf:          { label: 'HTF',             bg: '#E11D48' },
                retailer:     { label: 'Store Exclusive', bg: '#1D4ED8' },
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

        {/* ── Hot Score card ── */}
        <View style={{ marginHorizontal: 18, marginTop: 20, marginBottom: 4 }}>
          <View style={{
            backgroundColor: theme.surface, borderRadius: theme.radius, padding: 18,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <View>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted,
                letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6,
              }}>
                Hot Score
              </Text>
              <HotScoreBadge sku={sku} theme={theme} size="lg" showSpark />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted,
                letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6,
              }}>
                24H ↑↓
              </Text>
              <Text style={{
                fontFamily: 'JetBrainsMono_700Bold', fontSize: 28, color: deltaColor,
                letterSpacing: -0.56, fontVariant: ['tabular-nums'],
              }}>
                {deltaLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Stats grid ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 8, gap: 8 }}>
          {/* Row 1: Median / Lowest / Highest */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox label="Median"           value={fmtPrice(sku.price.median)} theme={theme} valueColor="#FC792E" />
            <StatBox label="Lowest Recorded"  value={fmtPrice(sku.price.low)}    theme={theme} />
            <StatBox label="Highest Recorded" value={fmtPrice(sku.price.high)}   theme={theme} />
          </View>
          {/* Row 2: Listings / Days Tracked */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox label={salesLabel}    value={String(salesValue)} theme={theme} />
            {sku.age >= 1 && (
              <StatBox label="Days Tracked" value={`${sku.age}d`}     theme={theme} />
            )}
          </View>
        </View>

        {/* ── Condition breakdown ── */}
        {((sku.priceMint != null && (sku.priceMintCount ?? 0) >= 2) ||
          (sku.priceLoose != null && (sku.priceLooseCount ?? 0) >= 2)) && (
          <View style={{
            marginHorizontal: 18, marginTop: 8,
            backgroundColor: theme.surface, borderRadius: theme.radius, overflow: 'hidden',
          }}>
            <View style={{
              paddingHorizontal: 16, paddingVertical: 10,
              borderBottomWidth: 0.5, borderBottomColor: theme.hairline,
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
                borderBottomColor: theme.hairline,
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
          return (
            <View style={{ marginHorizontal: 18, marginTop: 8, backgroundColor: theme.surface, borderRadius: theme.radius, overflow: 'hidden' }}>
              <View style={{
                paddingHorizontal: 16, paddingVertical: 12,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                borderBottomWidth: 0.5, borderBottomColor: theme.hairline,
              }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                  Your position
                </Text>
                {myTotalCost > 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 16, color: myPLPos ? theme.pos : theme.neg, fontVariant: ['tabular-nums'] }}>
                      {myPLPos ? '+' : ''}{fmtPrice(myPL)}
                    </Text>
                    <Text style={{ fontFamily: theme.fontMono, fontSize: 11, color: myPLPos ? theme.pos : theme.neg, marginTop: 1 }}>
                      {myPLPos ? '+' : ''}{myPLPct.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', padding: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Qty</Text>
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 17, color: theme.text, fontVariant: ['tabular-nums'] }}>×{myQty}</Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 0.5, borderLeftColor: theme.hairline, paddingLeft: 14 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Paid</Text>
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 17, color: theme.text, fontVariant: ['tabular-nums'] }}>{fmtPrice(myTotalCost)}</Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 0.5, borderLeftColor: theme.hairline, paddingLeft: 14 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>Value</Text>
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 17, color: theme.premium, fontVariant: ['tabular-nums'] }}>{fmtPrice(myCurrentValue)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
                <Pressable
                  onPress={() => updateCollectionItem(collectionItem.skuId, { forSale: !collectionItem.forSale })}
                  style={({ pressed }) => ({
                    flex: 1, height: 38, borderRadius: theme.radius,
                    backgroundColor: collectionItem.forSale ? `${theme.gold}22` : theme.surface2,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: collectionItem.forSale ? `${theme.gold}66` : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: collectionItem.forSale ? theme.gold : theme.muted }}>
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
                    flex: 1, height: 38, borderRadius: theme.radius,
                    backgroundColor: theme.surface2,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.muted }}>
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
                    width: 38, height: 38, borderRadius: theme.radius,
                    backgroundColor: theme.surface2,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel="Remove from collection"
                >
                  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={theme.neg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </Svg>
                </Pressable>
              </View>
            </View>
          );
        })()}

        {/* ── Why it's hot ── */}
        <SectionHeader title="Why it's hot" theme={theme} />
        <View style={{ marginHorizontal: 18, backgroundColor: theme.surface, borderRadius: theme.radius, padding: 18 }}>
          {(() => {
            const insight = insightData?.insight;
            const showInsight = isPremium && insight && insight.narrationLong;
            const prose = showInsight ? insight.narrationLong! : (sku.narrative ?? insightData?.fallbackDescription ?? '');

            return prose ? (
              <View style={{ marginBottom: 18 }}>
                {showInsight && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <InsightTypePill insightType={insight.insightType} theme={theme} />
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint }}>
                      {formatFiredAt(insight.firedAt)}
                    </Text>
                  </View>
                )}
                <View style={{ paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: c?.ink ?? theme.gold }}>
                  <Text style={{
                    fontFamily: 'Fraunces_400Regular_Italic', fontSize: 15,
                    color: theme.text, lineHeight: 23,
                  }}>
                    {showInsight ? prose : `"${prose}"`}
                  </Text>
                </View>
              </View>
            ) : null;
          })()}

          {(() => {
            const action = insightData?.personalizedAction;
            if (!isPremium || !action) return null;
            return (
              <View style={{
                backgroundColor: 'rgba(249,115,22,0.08)',
                borderLeftWidth: 3, borderLeftColor: '#f97316',
                borderRadius: 6, padding: 14, marginBottom: 18,
              }}>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.faint,
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

          <View style={{ borderTopWidth: 0.5, borderTopColor: theme.hairline, paddingTop: 18 }}>
            <Text style={{
              fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.faint,
              letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 14,
            }}>
              Score breakdown
            </Text>
            <ScoreBar label="Velocity"     value={sku.score.velocity}     hint={sku.score.velocity === 0 ? 'Listings stable — no new supply detected' : 'Listing count is growing'} theme={theme} />
            <ScoreBar label="Volume"       value={sku.score.volume}       hint="Active listing count"       theme={theme} />
            <ScoreBar label="Confirmation" value={sku.score.confirmation} hint="Price momentum vs 7-day avg" theme={theme} />
            <ScoreBar label="Freshness"    value={sku.score.freshness}    hint="Recent appearance"           theme={theme} />
          </View>
        </View>

        {/* ── Where to buy ── */}
        <SectionHeader title="Where to buy" theme={theme} />
        <View style={{ marginHorizontal: 18, gap: 8 }}>
          {marketplaces.length === 0 ? (
            <View style={{
              backgroundColor: theme.surface, borderRadius: theme.radius,
              padding: 20, alignItems: 'center',
            }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.faint, textAlign: 'center' }}>
                No marketplace links set yet.{'\n'}Check back after the next pipeline run.
              </Text>
            </View>
          ) : marketplaces.map((mp) => (
            <Pressable
              key={mp.id}
              accessibilityRole="link"
              accessibilityLabel={`Open ${mp.name}`}
              onPress={() => Linking.openURL(mp.url).catch(() => {})}
              style={({ pressed }) => ({
                backgroundColor: theme.surface, borderRadius: theme.radius,
                padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                opacity: pressed ? 0.78 : 1,
                borderWidth: mp.primary ? 1 : 0,
                borderColor: mp.primary ? theme.accent : 'transparent',
              })}
            >
              <View style={{
                width: 38, height: 38, borderRadius: 10,
                backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{
                  fontFamily: 'Fraunces_700Bold', fontSize: 14,
                  color: mp.primary ? theme.accent : theme.text, letterSpacing: -0.2,
                }}>
                  {mp.name.slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 15, color: theme.text, letterSpacing: -0.2 }}>
                  {mp.name}
                </Text>
                {mp.listings != null && mp.median != null ? (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    {mp.listings} listings · median{' '}
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: theme.premium }}>
                      {fmtPrice(mp.median)}
                    </Text>
                  </Text>
                ) : (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    View listings
                  </Text>
                )}
              </View>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M7 17L17 7M7 7h10v10" />
              </Svg>
            </Pressable>
          ))}
        </View>

        {/* ── History ── */}
        <SectionHeader title="History" theme={theme} />
        <View style={{ marginHorizontal: 18, backgroundColor: theme.surface, borderRadius: theme.radius, padding: 18 }}>
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <WindowBtn label="30D" active={historyWindow === '30D'} onPress={() => setHistoryWindow('30D')} theme={theme} />
            <WindowBtn label="90D" locked={!isPremium} active={historyWindow === '90D'} onPress={() => { if (isPremium) setHistoryWindow('90D'); }} theme={theme} />
            <WindowBtn label="1Y"  locked={!isPremium} active={historyWindow === '1Y'}  onPress={() => { if (isPremium) setHistoryWindow('1Y'); }}  theme={theme} />
          </View>
          {historyLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : historyError ? (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.neg, textAlign: 'center', paddingVertical: 20 }}>
              {historyError}
            </Text>
          ) : (
            <>
              <LineChart data={sku.history}      theme={theme} w={SCREEN_W - 76} h={100} color={theme.accent} label="Hot Score" />
              <View style={{ marginTop: 14 }}>
                <LineChart data={sku.priceHist}    theme={theme} w={SCREEN_W - 76} h={80}  color={theme.gold}   label="Median Price" units="$" />
              </View>
              <View style={{ marginTop: 14 }}>
                <LineChart data={sku.listingsHist} theme={theme} w={SCREEN_W - 76} h={70}  color={theme.muted}  label="Listings" />
              </View>
            </>
          )}
        </View>
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
          <LinearGradient
            colors={[c.tint, c.tint2, 'transparent']}
            locations={[0, 0.65, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <IconButton theme={theme} onPress={() => router.back()} accessibilityLabel="Go back">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.2} strokeLinecap="round">
              <Path d="M19 12H5M12 5l-7 7 7 7" />
            </Svg>
          </IconButton>

          <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="box-none">
            {filterTotal > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.88)',
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
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M15 18l-6-6 6-6" />
                  </Svg>
                </Pressable>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.text, letterSpacing: -0.1,
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
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M9 18l6-6-6-6" />
                  </Svg>
                </Pressable>
              </View>
            )}
          </View>

          <IconButton theme={theme} onPress={() => setShareOpen(true)} accessibilityLabel="Share this SKU">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 16V4M8 8l4-4 4 4" />
              <Path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" />
            </Svg>
          </IconButton>
        </View>

        {/* Ticker — slides down on scroll */}
        <Animated.View style={{
          height: tickerHeight,
          opacity: tickerOpacity,
          overflow: 'hidden',
          backgroundColor: theme.navBg,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.hairline,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 10, gap: 10,
          }}>
            <View style={{
              width: 28, height: 36, borderRadius: 5,
              backgroundColor: c.tint,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 9, color: c.ink,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {cat?.short?.slice(0, 3) ?? sku.category.slice(0, 3).toUpperCase()}
              </Text>
            </View>
            <Text style={{
              flex: 1, fontFamily: 'Fraunces_600SemiBold', fontSize: 14,
              color: theme.text, letterSpacing: -0.2,
            }} numberOfLines={1}>
              {sku.short || sku.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: theme.gold }} />
              <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, color: theme.text }}>
                {sku.hot}
              </Text>
            </View>
            <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, color: '#FC792E' }}>
              {fmtPrice(sku.price.median)}
            </Text>
            <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: deltaColor }}>
              {deltaLabel}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Bottom action bar ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: theme.navBg,
        paddingTop: 14, paddingBottom: insets.bottom + 14,
        paddingHorizontal: 20,
        flexDirection: 'row', gap: 10,
        borderTopWidth: 0.5, borderTopColor: theme.hairline,
      }}>
        <Pressable
          onPress={() => {
            const added = toggleWatchlist(sku.id);
            if (!added) setUpgradeContext('watchlist');
          }}
          accessibilityRole="button"
          accessibilityLabel={watching ? 'Remove from watchlist' : 'Add to watchlist'}
          accessibilityState={{ selected: watching }}
          style={({ pressed }) => ({
            height: 50, paddingHorizontal: 16,
            borderWidth: 1.5,
            borderColor: watching ? theme.accent : theme.hairline,
            backgroundColor: watching ? theme.surface2 : 'transparent',
            borderRadius: RADIUS.button,
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 7,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={watching ? theme.accent : theme.faint}
            strokeWidth={2}
          >
            <Path fill="none" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
            <Circle cx="12" cy="12" r="3" fill={watching ? theme.accent : 'none'} />
          </Svg>
          <Text style={{
            fontFamily: 'Inter_600SemiBold', fontSize: 14,
            color: watching ? theme.accent : theme.muted,
          }}>
            {watching ? 'Watching' : 'Watch'}
          </Text>
        </Pressable>

        {watching && (
          <Pressable
            onPress={() => isPremium ? setAlertOpen(true) : setUpgradeContext('priceAlerts')}
            accessibilityLabel="Set price alert"
            style={({ pressed }) => ({
              width: 50, height: 50,
              borderWidth: 1.5,
              borderColor: activeAlertCount > 0 ? `${theme.premium}66` : theme.hairline,
              backgroundColor: activeAlertCount > 0 ? `${theme.premium}12` : 'transparent',
              borderRadius: RADIUS.button,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
              stroke={activeAlertCount > 0 ? theme.premium : theme.faint}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 01-3.46 0" />
            </Svg>
            {activeAlertCount > 0 && (
              <View style={{
                position: 'absolute', top: 4, right: 4,
                width: 14, height: 14, borderRadius: 999,
                backgroundColor: theme.premium,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 8, color: theme.premiumInk }}>
                  {activeAlertCount}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        <View style={{ flex: 1 }}>
          <PrimaryButton theme={theme} size="md" tone={inCollection ? 'soft' : 'accent'} full onPress={() => setAddOpen(true)}>
            {inCollection ? '✓ In Collection' : 'Add to Collection'}
          </PrimaryButton>
        </View>
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
