import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { catById, fmtPrice } from '@/lib/appConfig';
import { CollectionItemEnriched, UpgradeContext } from '@/lib/types';
import AppHeader from '@/components/AppHeader';
import Sparkline from '@/components/Sparkline';
import UpgradeSheet from '@/components/UpgradeSheet';
import { ProductThumb } from '@/components/ProductPlaceholder';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';

const VALUE_HISTORY_BASE = [0.72, 0.74, 0.75, 0.77, 0.79, 0.81, 0.83, 0.86, 0.89, 0.92, 0.94, 0.96, 0.98, 1.0];

type ChartWindow = '7d' | '30d' | '90d' | '1y';

export default function CollectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const storeCollection = useAppStore((s) => s.collection);
  const removeFromCollection = useAppStore((s) => s.removeFromCollection);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const theme = buildTheme(isDark);

  const [filter, setFilter] = useState<string>('all');
  const [chartWindow, setChartWindow] = useState<ChartWindow>('30d');
  const [scrolled, setScrolled] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const items: CollectionItemEnriched[] = useMemo(() => {
    return storeCollection.map((item) => {
      const sku = hotSkus.find((s) => s.id === item.skuId);
      if (!sku) return null;
      const current = sku.price.median * item.qty;
      const cost = item.purchased * item.qty;
      return { ...item, sku, current, cost, pl: current - cost };
    }).filter(Boolean) as CollectionItemEnriched[];
  }, [storeCollection, hotSkus]);

  const total = useMemo(() => items.reduce((s, i) => s + i.current, 0), [items]);
  const totalCost = useMemo(() => items.reduce((s, i) => s + i.cost, 0), [items]);
  const totalPL = total - totalCost;
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const plPositive = totalPL >= 0;
  const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  const heroData = useMemo(() => VALUE_HISTORY_BASE.map((m) => Math.round(total * m)), [total]);

  const collectionCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((i) => ids.add(i.sku.category));
    return Array.from(ids);
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'forsale') return items.filter((i) => i.forSale);
    return items.filter((i) => i.sku.category === filter);
  }, [items, filter]);

  const filterChips = [
    { key: 'all', label: 'All' },
    { key: 'forsale', label: 'For sale', gold: true },
    ...collectionCategoryIds.map((id) => ({ key: id, label: catById(id)?.short ?? id, gold: false })),
  ];

  const WINDOW_OPTIONS = [
    { key: '7d' as ChartWindow, label: '7D', premium: false },
    { key: '30d' as ChartWindow, label: '30D', premium: false },
    { key: '90d' as ChartWindow, label: '90D', premium: true },
    { key: '1y' as ChartWindow, label: '1Y', premium: true },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        title="Collection"
        theme={theme}
        scrolled={scrolled}
        trailing={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share collection"
              onPress={() => isPremium ? null : setUpgradeContext('share')}
              style={{ padding: 4 }}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 16V4M8 8l4-4 4 4" />
                <Path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" />
              </Svg>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item to collection"
              onPress={() => setAddOpen(true)}
              style={{ padding: 4 }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.6} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            </Pressable>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
      >
        {/* Hero value card */}
        <View style={{
          backgroundColor: theme.surface, borderRadius: theme.radiusLg,
          padding: 22, marginBottom: 20,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 0.1 * 11, textTransform: 'uppercase', marginBottom: 4 }}>
                Estimated value
              </Text>
              <Text style={{ fontFamily: theme.fontDispBold, fontSize: 42, color: theme.text, letterSpacing: -0.03 * 42, lineHeight: 46, fontVariant: ['tabular-nums'] }}>
                ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, marginTop: 8 }}>
                {totalQty} item{totalQty !== 1 ? 's' : ''} · {items.length} SKU{items.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {isPremium ? (
              <View style={{ alignItems: 'flex-end', paddingTop: 4 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 0.1 * 11, textTransform: 'uppercase', marginBottom: 4 }}>P&L</Text>
                <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 22, color: plPositive ? theme.pos : theme.neg, letterSpacing: -0.02 * 22, fontVariant: ['tabular-nums'] }}>
                  {plPositive ? '+' : ''}${Math.abs(Math.round(totalPL)).toLocaleString()}
                </Text>
                <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: plPositive ? theme.pos : theme.neg, marginTop: 2 }}>
                  {plPositive ? '+' : ''}{plPct.toFixed(1)}%
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setUpgradeContext('pl')}
                style={{ backgroundColor: theme.premium, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Svg width={11} height={11} viewBox="0 0 12 12" fill={theme.premiumInk}>
                  <Path d="M6 1.5l1.5 3 3 .4-2.2 2 .6 3.1L6 8.5 3.1 10l.6-3.1L1.5 4.9l3-.4z" />
                </Svg>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.premiumInk, letterSpacing: 0.02 * 12 }}>Unlock P&L</Text>
              </Pressable>
            )}
          </View>

          {/* Chart */}
          <Sparkline data={heroData} theme={theme} w={340} h={52} color={theme.accent} fill />

          {/* Window chips */}
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
            {WINDOW_OPTIONS.map((w) => {
              const active = chartWindow === w.key;
              const locked = w.premium && !isPremium;
              return (
                <Pressable
                  key={w.key}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: active ? theme.surface2 : 'transparent',
                  }}
                  onPress={() => locked ? setUpgradeContext('history') : setChartWindow(w.key)}
                >
                  <Text style={{
                    fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    fontSize: 12,
                    color: locked ? theme.faint : active ? theme.text : theme.muted,
                  }}>
                    {w.label}{locked ? ' ◆' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12, flexDirection: 'row' }}
        >
          {filterChips.map((chip) => {
            const active = filter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={{
                  height: 36,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: active
                    ? (chip.gold ? theme.gold : theme.accent)
                    : theme.surface,
                  borderWidth: active ? 0 : 0.5,
                  borderColor: theme.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{
                  fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                  fontSize: 13.5,
                  color: active ? (chip.gold ? theme.goldInk : theme.accentInk) : theme.text,
                }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Items list */}
        <View style={{ gap: 8 }}>
          {filteredItems.length === 0 ? (
            <View style={{
              padding: 36, alignItems: 'center', backgroundColor: theme.surface,
              borderRadius: theme.radius, borderWidth: 0.5, borderStyle: 'dashed', borderColor: theme.hairline,
            }}>
              <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: theme.text }}>No items</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, marginTop: 4, marginBottom: items.length === 0 ? 16 : 0 }}>
                {items.length === 0 ? 'Start tracking what you own.' : 'Try a different filter.'}
              </Text>
              {items.length === 0 && (
                <Pressable
                  onPress={() => setAddOpen(true)}
                  style={({ pressed }) => ({
                    backgroundColor: theme.accent, borderRadius: theme.radius,
                    paddingHorizontal: 24, paddingVertical: 12, opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.accentInk }}>
                    Add your first item
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredItems.map((item) => {
              const plPos = item.pl >= 0;
              return (
                <Pressable
                  key={item.skuId}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: theme.surface, borderRadius: theme.radius,
                    padding: 12, opacity: pressed ? 0.78 : 1,
                  })}
                  onPress={() => router.push(`/sku/${item.skuId}`)}
                >
                  <ProductThumb sku={item.sku} theme={theme} size={60} />

                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2, flex: 1 }} numberOfLines={1}>
                        {item.sku.name}
                      </Text>
                      {item.forSale && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 0.5, borderColor: theme.gold }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.gold, letterSpacing: 0.1 * 9, textTransform: 'uppercase' }}>
                            For sale
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.muted }}>
                      ×{item.qty} · {item.condition}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 15, color: theme.text, fontVariant: ['tabular-nums'], letterSpacing: -0.2 }}>
                      ${Math.round(item.current).toLocaleString()}
                    </Text>
                    {isPremium ? (
                      <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: plPos ? theme.pos : theme.neg, fontVariant: ['tabular-nums'] }}>
                        {plPos ? '+' : ''}${Math.abs(Math.round(item.pl))}
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint }}>◆ P&L</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Remove from collection',
                        `Remove ${item.sku.name}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => removeFromCollection(item.skuId) },
                        ]
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.sku.name} from collection`}
                    style={({ pressed }) => ({ padding: 8, marginLeft: 2, opacity: pressed ? 0.5 : 1 })}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2.5} strokeLinecap="round">
                      <Path d="M18 6L6 18M6 6l12 12" />
                    </Svg>
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <UpgradeSheet
        open={upgradeContext !== null}
        context={upgradeContext ?? 'pl'}
        theme={theme}
        onClose={() => setUpgradeContext(null)}
        onConfirm={() => setUpgradeContext(null)}
      />

      <AddToCollectionSheet
        open={addOpen}
        theme={theme}
        onClose={() => setAddOpen(false)}
        onConfirm={() => setAddOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
