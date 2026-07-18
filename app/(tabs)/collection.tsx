import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';

import { buildTheme, categoryColor } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { catById, fmtPrice } from '@/lib/appConfig';
import { CollectionItemEnriched, UpgradeContext, CatalogCollectionItem, CollectionFormData } from '@/lib/types';
import { promoteCatalogToSku, fetchSkuById } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { buildExportCSV, sendCollectionExport, downloadCollectionExport, ExportSummary } from '@/lib/exportCollection';
import AppHeader from '@/components/AppHeader';
import IconButton from '@/components/IconButton';
import Sparkline from '@/components/Sparkline';
import UpgradeSheet from '@/components/UpgradeSheet';
import { ProductThumb } from '@/components/ProductPlaceholder';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';
import CatalogItemSheet from '@/components/CatalogItemSheet';
import PriceAlertSheet from '@/components/PriceAlertSheet';
import CollectionPulseSection from '@/components/CollectionPulseSection';

const VALUE_HISTORY_BASE = [0.72, 0.74, 0.75, 0.77, 0.79, 0.81, 0.83, 0.86, 0.89, 0.92, 0.94, 0.96, 0.98, 1.0];

type ChartWindow = '7d' | '30d' | '90d' | '1y';

type CollectionRow =
  | { type: 'sku'; item: CollectionItemEnriched }
  | { type: 'catalog'; item: CatalogCollectionItem };

// Renders the per-category portfolio breakdown. Free users see the top row
// fully + the rest blurred behind an Unlock CTA.
function CategoryBreakdown({ rows, total, theme, isDark, isPremium, onUnlock }: {
  rows: { categoryId: string; value: number; count: number }[];
  total: number;
  theme: ReturnType<typeof buildTheme>;
  isDark: boolean;
  isPremium: boolean;
  onUnlock: () => void;
}) {
  const top = rows[0];
  const rest = rows.slice(1);
  const visibleRows = isPremium ? rows : rows.slice(0, 1);

  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: theme.radiusLg,
      padding: 18, marginBottom: 20,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.muted, letterSpacing: 0.14 * 11, textTransform: 'uppercase' }}>
          Breakdown by category
        </Text>
        {!isPremium && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
            </Svg>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.premium, letterSpacing: 0.6 }}>PREMIUM</Text>
          </View>
        )}
      </View>

      <View style={{ gap: 12 }}>
        {visibleRows.map((row) => {
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          const { ink } = categoryColor(row.categoryId, isDark);
          const cat = catById(row.categoryId);
          return (
            <View key={row.categoryId}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.text }}>
                  {cat?.label ?? row.categoryId}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ fontFamily: theme.fontMono, fontSize: 11.5, color: theme.faint, fontVariant: ['tabular-nums'] }}>
                    {row.count} item{row.count === 1 ? '' : 's'}
                  </Text>
                  <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 14, color: theme.text, fontVariant: ['tabular-nums'] }}>
                    ${Math.round(row.value).toLocaleString()}
                  </Text>
                  <Text style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.muted, fontVariant: ['tabular-nums'], minWidth: 38, textAlign: 'right' }}>
                    {pct.toFixed(0)}%
                  </Text>
                </View>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: ink + '28', overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: ink }} />
              </View>
            </View>
          );
        })}
      </View>

      {!isPremium && rest.length > 0 && (
        <Pressable
          onPress={onUnlock}
          style={({ pressed }) => ({
            marginTop: 14,
            paddingVertical: 12, paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: 'rgba(241,194,76,0.08)',
            borderWidth: 1, borderColor: 'rgba(241,194,76,0.28)',
            flexDirection: 'row', alignItems: 'center', gap: 10,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
          </Svg>
          <Text style={{ flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.premium }}>
            Unlock to see all {rows.length} categories
          </Text>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.premium }}>→</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function CollectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const storeCollection = useAppStore((s) => s.collection);
  const addToCollection = useAppStore((s) => s.addToCollection);
  const removeFromCollection = useAppStore((s) => s.removeFromCollection);
  const updateCollectionItem = useAppStore((s) => s.updateCollectionItem);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const priceAlerts = useAppStore((s) => s.priceAlerts);
  const catalogCollection = useAppStore((s) => s.catalogCollection);
  const removeCatalogFromCollection = useAppStore((s) => s.removeCatalogFromCollection);
  const completeCatalogMigration = useAppStore((s) => s.completeCatalogMigration);
  const mergeSkuIntoHot          = useAppStore((s) => s.mergeSkuIntoHot);
  const loadUserData = useAppStore((s) => s.loadUserData);
  const userId = useAppStore((s) => s.user?.id);
  const collectionPulse = useAppStore((s) => s.collectionPulse);
  const collectionPulseLoading = useAppStore((s) => s.collectionPulseLoading);
  const loadCollectionPulse = useAppStore((s) => s.loadCollectionPulse);
  const theme = buildTheme(isDark);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    const run = async () => {
      try {
        await loadUserData(userId);
        if (!active) return;
        loadCollectionPulse();

        // Recover storeCollection items whose SKU isn't in hotSkus.
        // This happens when a scan-created SKU (is_active:false) is not in v_hot_skus.
        // After completeCatalogMigration clears catalog_id, the item lives only in
        // storeCollection — if the SKU isn't in hotSkus the item becomes invisible.
        const hotSkusData = useAppStore.getState().hotSkus || [];
        const currentHotIds = new Set(hotSkusData.map((s) => s.id));
      const collectionData = useAppStore.getState().collection || [];
      for (const item of collectionData) {
        if (!currentHotIds.has(item.skuId)) {
          fetchSkuById(item.skuId).then((sku) => { if (sku && active) mergeSkuIntoHot(sku); }).catch(() => {});
        }
      }

      const all = useAppStore.getState().catalogCollection || [];

      // Syncing: sku_id already known in DB — just clear the catalog link
      const syncing = all.filter((i) => !!i.skuId);
      for (const item of syncing) {
        completeCatalogMigration(item.catalogId, item.skuId!, {
          qty: item.qty, purchased: item.purchased,
          purchaseDate: item.purchaseDate, condition: item.condition,
        });
        fetchSkuById(item.skuId!).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
      }

      // Pending: sku_id not yet assigned — promote first
      const pending = all.filter((i) => !i.skuId);
      if (pending.length === 0) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !active) return;
      for (const item of pending) {
        const promotion = await promoteCatalogToSku(item.catalogId, session.access_token);
        if (!active) return;
        if (promotion?.skuId) {
          completeCatalogMigration(item.catalogId, promotion.skuId, {
            qty: item.qty, purchased: item.purchased,
            purchaseDate: item.purchaseDate, condition: item.condition,
          });
          fetchSkuById(promotion.skuId).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
        }
      }
      } catch (err) {
        console.error('Collection tab error:', err);
      }
    };
    run();
    return () => { active = false; };
  }, [userId]));

  const [filter, setFilter] = useState<string>('all');
  const [chartWindow, setChartWindow] = useState<ChartWindow>('30d');
  const [scrolled, setScrolled] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  type ExportPhase = 'idle' | 'loading' | 'ready' | 'sending' | 'sent';
  const [exportPhase, setExportPhase]   = useState<ExportPhase>('idle');
  const [exportPayload, setExportPayload] = useState<{ csv: string; fileName: string; summary: ExportSummary } | null>(null);
  const [catalogDetailId, setCatalogDetailId] = useState<string | null>(null);
  const [alertSkuId, setAlertSkuId] = useState<string | null>(null);

  const items: CollectionItemEnriched[] = useMemo(() => {
    if (!storeCollection || !hotSkus) return [];
    return storeCollection.map((item) => {
      const sku = hotSkus.find((s) => s.id === item.skuId);
      if (!sku) return null;
      const current = sku.price?.median ? sku.price.median * item.qty : 0;
      const cost = item.purchased * item.qty;
      return { ...item, sku, current, cost, pl: current - cost };
    }).filter(Boolean) as CollectionItemEnriched[];
  }, [storeCollection, hotSkus]);

  const alertSku = useMemo(
    () => items.find((i) => i.skuId === alertSkuId)?.sku ?? null,
    [items, alertSkuId]
  );

  const catalogTotal = useMemo(() =>
    catalogCollection.reduce((s, i) => s + (i.currentPrice != null ? i.currentPrice * i.qty : 0), 0),
  [catalogCollection]);
  const catalogCost = useMemo(() =>
    catalogCollection.reduce((s, i) => s + i.purchased * i.qty, 0),
  [catalogCollection]);
  const catalogQty = useMemo(() =>
    catalogCollection.reduce((s, i) => s + i.qty, 0),
  [catalogCollection]);

  const user = useAppStore((s) => s.user);

  const handleExport = useCallback(async () => {
    if (exportPhase !== 'idle') return;
    setExportPhase('loading');
    try {
      const { csv, fileName } = buildExportCSV(items, catalogCollection);
      const summary: ExportSummary = {
        itemCount:  totalQty,
        totalValue: total,
        totalCost,
        pl:         totalPL,
        plPct,
      };
      setExportPayload({ csv, fileName, summary });
      setExportPhase('ready');
    } catch (err: any) {
      setExportPhase('idle');
      Alert.alert('Export failed', err?.message ?? 'Could not prepare export.');
    }
  }, [exportPhase, items, catalogCollection, totalQty, total, totalCost, totalPL, plPct]);

  const handleSend = useCallback(async () => {
    if (!exportPayload || !user?.email) return;
    setExportPhase('sending');
    try {
      await sendCollectionExport(exportPayload.csv, exportPayload.fileName, user.email, exportPayload.summary);
      setExportPhase('sent');
    } catch (err: any) {
      setExportPhase('ready');
      Alert.alert('Send failed', err?.message ?? 'Could not send email. Please try again.');
    }
  }, [exportPayload, user?.email]);

  const handleDownload = useCallback(async () => {
    if (!exportPayload) return;
    setExportPhase('sending');
    try {
      await downloadCollectionExport(exportPayload.csv, exportPayload.fileName);
      setExportPhase('idle');
      setExportPayload(null);
    } catch (err: any) {
      setExportPhase('ready');
      Alert.alert('Download failed', err?.message ?? 'Could not prepare download. Please try again.');
    }
  }, [exportPayload]);

  const closeExportModal = useCallback(() => {
    setExportPhase('idle');
    setExportPayload(null);
  }, []);

  const total = useMemo(() => items.reduce((s, i) => s + i.current, 0) + catalogTotal, [items, catalogTotal]);
  const totalCost = useMemo(() => items.reduce((s, i) => s + i.cost, 0) + catalogCost, [items, catalogCost]);
  const totalPL = total - totalCost;
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0) + catalogQty, [items, catalogQty]);
  const plPositive = totalPL >= 0;
  const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  // Per-category aggregates for the breakdown section. Sorted by value desc.
  const breakdown = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>();
    for (const item of items) {
      const prev = map.get(item.sku.category) ?? { value: 0, count: 0 };
      map.set(item.sku.category, { value: prev.value + item.current, count: prev.count + item.qty });
    }
    for (const item of catalogCollection) {
      const val = (item.currentPrice ?? 0) * item.qty;
      const prev = map.get(item.categoryId) ?? { value: 0, count: 0 };
      map.set(item.categoryId, { value: prev.value + val, count: prev.count + item.qty });
    }
    return Array.from(map.entries())
      .map(([categoryId, v]) => ({ categoryId, value: v.value, count: v.count }))
      .sort((a, b) => b.value - a.value);
  }, [items, catalogCollection]);

  const heroData = useMemo(() => VALUE_HISTORY_BASE.map((m) => Math.round(total * m)), [total]);

  const collectionCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((i) => ids.add(i.sku.category));
    catalogCollection.forEach((i) => ids.add(i.categoryId));
    return Array.from(ids);
  }, [items, catalogCollection]);

  const filteredRows = useMemo((): CollectionRow[] => {
    const skuRows: CollectionRow[] = (() => {
      if (filter === 'forsale') return items.filter((i) => i.forSale).map((item) => ({ type: 'sku' as const, item }));
      if (filter !== 'all') return items.filter((i) => i.sku.category === filter).map((item) => ({ type: 'sku' as const, item }));
      return items.map((item) => ({ type: 'sku' as const, item }));
    })();

    const catalogRows: CollectionRow[] = filter === 'forsale'
      ? []
      : catalogCollection
          .filter((i) => filter === 'all' || i.categoryId === filter)
          .filter((i) => !(i.skuId && hotSkus.some((s) => s.id === i.skuId)))
          .map((item) => ({ type: 'catalog' as const, item }));

    return [...skuRows, ...catalogRows];
  }, [items, catalogCollection, filter]);

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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ position: 'relative' }}>
              <IconButton
                theme={theme}
                accessibilityLabel={isPremium ? 'Export collection as CSV' : 'Export collection (Premium)'}
                onPress={() => isPremium ? handleExport() : setUpgradeContext('share')}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isPremium ? theme.muted : theme.premium} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 16V4M8 8l4-4 4 4" />
                  <Path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" />
                </Svg>
              </IconButton>
              {!isPremium && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 12, height: 12, borderRadius: 6,
                    backgroundColor: theme.premium,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: theme.bg,
                  }}
                >
                  <Svg width={6} height={6} viewBox="0 0 24 24" fill="none" stroke={theme.bg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                </View>
              )}
            </View>
            <IconButton
              theme={theme}
              accessibilityLabel="Add item to collection"
              onPress={() => setAddOpen(true)}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.5} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            </IconButton>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
      >
        {/* ── Scan buttons ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <Pressable
            onPress={() => router.push('/scan?mode=barcode')}
            accessibilityLabel="Scan barcode"
            style={({ pressed }) => ({ flex: 1, borderRadius: theme.radius, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.88 : 1, backgroundColor: '#FF5500' })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round">
                <Path d="M3 5h2M7 5h1M11 5h1M3 19h2M7 19h1M11 19h1M3 9v6M7 9v2M7 15v1M11 9v6M15 5h1M19 5h2M15 19h1M19 19h2M15 9v2M15 15v1M19 9v6" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontFamily: theme.fontDispBold, letterSpacing: -0.2 }}>Scan Barcode</Text>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>Product barcode</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/scan?mode=visual')}
            accessibilityLabel="Visual scan"
            style={({ pressed }) => ({ flex: 1, borderRadius: theme.radius, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.88 : 1, backgroundColor: '#2A1D08', borderWidth: 0.5, borderColor: theme.premium })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: theme.premium, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.premiumInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><Circle cx="12" cy="13" r="4" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.premium, fontSize: 13.5, fontFamily: theme.fontDispBold, letterSpacing: -0.2 }}>Visual Scan</Text>
              <Text style={{ color: `${theme.premium}99`, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>Point &amp; identify</Text>
            </View>
          </Pressable>
        </View>

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
                {totalQty} item{totalQty !== 1 ? 's' : ''} · {items.length + catalogCollection.length} product{(items.length + catalogCollection.length) !== 1 ? 's' : ''}
              </Text>
            </View>

            {totalCost > 0 && isPremium && (
              <View style={{ alignItems: 'flex-end', paddingTop: 4 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 0.1 * 11, textTransform: 'uppercase', marginBottom: 4 }}>P&L</Text>
                <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 22, color: plPositive ? theme.pos : theme.neg, letterSpacing: -0.02 * 22, fontVariant: ['tabular-nums'] }}>
                  {plPositive ? '+' : ''}${Math.abs(Math.round(totalPL)).toLocaleString()}
                </Text>
                <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: plPositive ? theme.pos : theme.neg, marginTop: 2 }}>
                  {plPositive ? '+' : ''}{plPct.toFixed(1)}%
                </Text>
              </View>
            )}

            {totalCost > 0 && !isPremium && (
              <Pressable
                onPress={() => setUpgradeContext('pl')}
                style={({ pressed }) => ({
                  alignItems: 'flex-end', paddingTop: 4,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.premium, letterSpacing: 0.1 * 11, textTransform: 'uppercase' }}>P&L</Text>
                  <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                </View>
                <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 22, color: theme.premium, letterSpacing: -0.02 * 22, fontVariant: ['tabular-nums'] }}>
                  +$•••
                </Text>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.premium, marginTop: 4, letterSpacing: 0.3 }}>
                  TAP TO UNLOCK
                </Text>
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
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: active ? theme.surface2 : 'transparent',
                    borderWidth: locked ? 1 : 0,
                    borderColor: locked ? 'rgba(241,194,76,0.32)' : 'transparent',
                  }}
                  onPress={() => locked ? setUpgradeContext('history') : setChartWindow(w.key)}
                >
                  <Text style={{
                    fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    fontSize: 12,
                    color: locked ? theme.premium : active ? theme.text : theme.muted,
                  }}>
                    {w.label}
                  </Text>
                  {locked && (
                    <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                    </Svg>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Category breakdown — premium feature */}
        {breakdown.length > 1 && total > 0 && (
          <CategoryBreakdown
            rows={breakdown}
            total={total}
            theme={theme}
            isDark={isDark}
            isPremium={isPremium}
            onUnlock={() => setUpgradeContext('breakdown')}
          />
        )}

        {/* Collection Pulse */}
        <CollectionPulseSection
          pulse={collectionPulse}
          loading={collectionPulseLoading}
          isPremium={isPremium}
          theme={theme}
          onUpgrade={(ctx) => setUpgradeContext(ctx)}
        />

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
          {filteredRows.length === 0 ? (
            <View style={{
              padding: 36, alignItems: 'center', backgroundColor: theme.surface,
              borderRadius: theme.radius, borderWidth: 0.5, borderStyle: 'dashed', borderColor: theme.hairline,
            }}>
              <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: theme.text }}>No items</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, marginTop: 4, marginBottom: (items.length + catalogCollection.length) === 0 ? 16 : 0 }}>
                {(items.length + catalogCollection.length) === 0 ? 'Start tracking what you own.' : 'Try a different filter.'}
              </Text>
              {(items.length + catalogCollection.length) === 0 && (
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
            filteredRows.map((row) => {
              if (row.type === 'sku') {
                const item = row.item;
                const plPos = item.pl >= 0;
                const itemPlPct = item.cost > 0 ? (item.pl / item.cost) * 100 : 0;
                const activeAlerts    = priceAlerts.filter((a) => a.skuId === item.skuId && a.isActive);
                const triggeredAlerts = priceAlerts.filter((a) => a.skuId === item.skuId && !a.isActive && a.triggeredAt !== null);
                const hasAlerts = activeAlerts.length > 0 || triggeredAlerts.length > 0;
                return (
                  <View key={`sku-${item.skuId}`}>
                    <Pressable
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: theme.surface, borderRadius: theme.radius,
                        padding: 12, opacity: pressed ? 0.78 : 1,
                      })}
                      onPress={() => router.push(`/sku/${item.skuId}`)}
                    >
                      <ProductThumb sku={item.sku} theme={theme} size={60} />

                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2, flex: 1 }} numberOfLines={1}>
                            {item.sku.short}
                          </Text>
                          {item.forSale && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 0.5, borderColor: theme.gold }}>
                              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.gold, letterSpacing: 0.1 * 9, textTransform: 'uppercase' }}>
                                For sale
                              </Text>
                            </View>
                          )}
                        </View>
                        {!!item.sku.series && (
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.muted, letterSpacing: -0.1 }} numberOfLines={1}>
                            {item.sku.series}
                          </Text>
                        )}
                        <Text style={{ fontFamily: theme.fontMono, fontSize: 11.5, color: theme.faint }}>
                          ×{item.qty} · {item.condition}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 15, color: theme.text, fontVariant: ['tabular-nums'], letterSpacing: -0.2 }}>
                          ${Math.round(item.current).toLocaleString()}
                        </Text>
                        {item.cost > 0 && isPremium && (
                          <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: plPos ? theme.pos : theme.neg, fontVariant: ['tabular-nums'] }}>
                            {plPos ? '+' : ''}${Math.abs(Math.round(item.pl))} ({plPos ? '+' : ''}{itemPlPct.toFixed(1)}%)
                          </Text>
                        )}
                        {item.cost > 0 && !isPremium && (
                          <Pressable
                            onPress={() => setUpgradeContext('pl')}
                            style={({ pressed }) => ({ alignItems: 'flex-end', opacity: pressed ? 0.7 : 1 })}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.premium, fontVariant: ['tabular-nums'] }}>
                                +$•••
                              </Text>
                              <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                              </Svg>
                            </View>
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 9, color: theme.premium, marginTop: 2, letterSpacing: 0.3 }}>
                              TAP TO UNLOCK
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            item.sku.name,
                            undefined,
                            [
                              {
                                text: item.forSale ? 'Remove from sale listing' : 'List as for sale',
                                onPress: () => updateCollectionItem(item.skuId, { forSale: !item.forSale }),
                              },
                              {
                                text: 'Mark as sold',
                                onPress: () => removeFromCollection(item.skuId),
                              },
                              {
                                text: 'Remove from collection',
                                style: 'destructive',
                                onPress: () => removeFromCollection(item.skuId),
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ]
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Manage ${item.sku.name}`}
                        style={({ pressed }) => ({
                          width: 32, height: 32, marginLeft: 2,
                          alignItems: 'center', justifyContent: 'center',
                          opacity: pressed ? 0.4 : 1,
                        })}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                      >
                        <Svg width={18} height={4} viewBox="0 0 18 4">
                          <Circle cx={2} cy={2} r={1.7} fill={theme.faint} />
                          <Circle cx={9} cy={2} r={1.7} fill={theme.faint} />
                          <Circle cx={16} cy={2} r={1.7} fill={theme.faint} />
                        </Svg>
                      </Pressable>
                    </Pressable>

                    {/* Alert chips row */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2, marginTop: hasAlerts ? 6 : 0 }}>
                      {triggeredAlerts.map((alert) => (
                        <Pressable
                          key={alert.id}
                          onPress={() => setAlertSkuId(item.skuId)}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            backgroundColor: `${theme.accent}22`,
                            borderWidth: 1, borderColor: theme.accent,
                            borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Svg width={9} height={9} viewBox="0 0 24 24" fill={theme.accent} stroke="none">
                            <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                          </Svg>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11.5, color: theme.accent }}>
                            {alert.direction === 'above' ? '↑' : '↓'} ${alert.targetPrice.toFixed(0)} · FIRED
                          </Text>
                        </Pressable>
                      ))}
                      {activeAlerts.map((alert) => (
                        <Pressable
                          key={alert.id}
                          onPress={() => setAlertSkuId(item.skuId)}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: `${theme.premium}15`,
                            borderWidth: 0.5, borderColor: `${theme.premium}40`,
                            borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.premium }}>
                            {alert.direction === 'above' ? '↑' : '↓'} ${alert.targetPrice.toFixed(0)}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => setAlertSkuId(item.skuId)}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          backgroundColor: theme.surface2,
                          borderWidth: 0.5, borderColor: theme.hairline,
                          borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2.5} strokeLinecap="round">
                          <Path d="M12 5v14M5 12h14" />
                        </Svg>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.muted }}>
                          alert
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }

              // Catalog item row
              const item = row.item;
              const c = categoryColor(item.categoryId, theme.dark);
              const cat = catById(item.categoryId);
              const currentVal = item.currentPrice != null ? item.currentPrice * item.qty : null;
              return (
                <Pressable
                  key={`catalog-${item.catalogId}`}
                  onPress={() => setCatalogDetailId(item.catalogId)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: theme.surface, borderRadius: theme.radius,
                    padding: 12, opacity: pressed ? 0.78 : 1,
                  })}
                >
                  {/* Thumbnail: real image or category fallback */}
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: 60, height: 60, borderRadius: 10, flexShrink: 0 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{
                      width: 60, height: 60, borderRadius: 10,
                      backgroundColor: c.tint,
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {cat?.short?.slice(0, 3) ?? '???'}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2 }} numberOfLines={1}>
                      {item.short}
                    </Text>
                    <Text style={{ fontFamily: theme.fontMono, fontSize: 11.5, color: theme.faint }}>
                      ×{item.qty} · {item.condition}
                    </Text>
                    <View style={{
                      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
                      backgroundColor: theme.surface2, borderWidth: 0.5, borderColor: theme.hairline,
                      alignSelf: 'flex-start', marginTop: 2,
                    }}>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: theme.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {item.skuId ? 'Syncing' : 'Pending'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    {currentVal != null ? (
                      <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 15, color: theme.text, fontVariant: ['tabular-nums'], letterSpacing: -0.2 }}>
                        {fmtPrice(currentVal)}
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.faint }}>—</Text>
                    )}
                  </View>

                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        item.name,
                        undefined,
                        [
                          {
                            text: 'Remove from collection',
                            style: 'destructive',
                            onPress: () => removeCatalogFromCollection(item.catalogId),
                          },
                          { text: 'Cancel', style: 'cancel' },
                        ]
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${item.name}`}
                    style={({ pressed }) => ({
                      width: 32, height: 32, marginLeft: 2,
                      alignItems: 'center', justifyContent: 'center',
                      opacity: pressed ? 0.4 : 1,
                    })}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  >
                    <Svg width={18} height={4} viewBox="0 0 18 4">
                      <Circle cx={2} cy={2} r={1.7} fill={theme.faint} />
                      <Circle cx={9} cy={2} r={1.7} fill={theme.faint} />
                      <Circle cx={16} cy={2} r={1.7} fill={theme.faint} />
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
        onConfirm={(data: CollectionFormData) => {
          if (data.skuId) {
            addToCollection({
              skuId: data.skuId,
              qty: data.qty,
              purchased: data.purchased,
              purchaseDate: data.purchaseDate,
              condition: data.condition,
              notes: data.notes,
              forSale: data.forSale,
              ...(data.cardVariant ? { cardVariant: data.cardVariant } : {}),
              ...(data.cardGrader ? { cardGrader: data.cardGrader } : {}),
              ...(data.cardGrade ? { cardGrade: data.cardGrade } : {}),
            });
          }
          setAddOpen(false);
        }}
      />

      <CatalogItemSheet
        open={catalogDetailId !== null}
        catalogId={catalogDetailId}
        theme={theme}
        onClose={() => setCatalogDetailId(null)}
      />

      {alertSku && (
        <PriceAlertSheet
          open={alertSkuId !== null}
          sku={alertSku}
          theme={theme}
          onClose={() => setAlertSkuId(null)}
          onUpgrade={() => { setAlertSkuId(null); setUpgradeContext('priceAlerts'); }}
        />
      )}

      {/* Export modal */}
      <Modal
        visible={exportPhase !== 'idle'}
        transparent
        animationType="fade"
        onRequestClose={exportPhase === 'ready' || exportPhase === 'sent' ? closeExportModal : undefined}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          onPress={exportPhase === 'ready' || exportPhase === 'sent' ? closeExportModal : undefined}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 28, paddingBottom: 48,
            }}>

              {/* Loading */}
              {(exportPhase === 'loading' || exportPhase === 'sending') && (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <ActivityIndicator size="large" color={theme.accent} style={{ marginBottom: 16 }} />
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: theme.text }}>
                    {exportPhase === 'loading' ? 'Preparing your export…' : 'Sending email…'}
                  </Text>
                </View>
              )}

              {/* Ready */}
              {exportPhase === 'ready' && (
                <View>
                  <Text style={{ fontFamily: theme.fontDispBold, fontSize: 20, color: theme.text, marginBottom: 6 }}>
                    Export ready
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted, marginBottom: 24 }}>
                    We'll send it to {user?.email ?? 'your email address'}.
                  </Text>
                  <Pressable
                    onPress={handleSend}
                    style={({ pressed }) => ({
                      backgroundColor: theme.accent, borderRadius: 14,
                      paddingVertical: 15, alignItems: 'center', marginBottom: 10,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' }}>
                      Send it to me
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDownload}
                    style={({ pressed }) => ({
                      backgroundColor: theme.bg, borderRadius: 14, borderWidth: 1, borderColor: theme.hairline,
                      paddingVertical: 15, alignItems: 'center', marginBottom: 10,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: theme.text }}>
                      Download
                    </Text>
                  </Pressable>
                  <Pressable onPress={closeExportModal} style={{ alignItems: 'center', paddingVertical: 10 }}>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted }}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              {/* Sent */}
              {exportPhase === 'sent' && (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: '#16a34a20', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                  }}>
                    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  </View>
                  <Text style={{ fontFamily: theme.fontDispBold, fontSize: 20, color: theme.text, marginBottom: 6 }}>
                    Email sent!
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted, textAlign: 'center', marginBottom: 28 }}>
                    Check {user?.email ?? 'your inbox'} for your collection export with the CSV attached.
                  </Text>
                  <Pressable
                    onPress={closeExportModal}
                    style={({ pressed }) => ({
                      backgroundColor: theme.accent, borderRadius: 14,
                      paddingVertical: 15, alignItems: 'center', width: '100%',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' }}>Done</Text>
                  </Pressable>
                </View>
              )}

            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({});
