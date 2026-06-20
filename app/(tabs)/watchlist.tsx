import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';

import { buildTheme, categoryColor } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { SKU, UpgradeContext, CatalogWatchlistItem } from '@/lib/types';
import { catById, fmtPrice } from '@/lib/appConfig';
import { promoteCatalogToSku, fetchSkuById } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import AppHeader from '@/components/AppHeader';
import UpgradeSheet from '@/components/UpgradeSheet';
import SKUCard from '@/components/SKUCard';
import PriceAlertSheet from '@/components/PriceAlertSheet';
import CatalogItemSheet from '@/components/CatalogItemSheet';

const FREE_CAP = 20;

export default function WatchlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark                   = useAppStore((s) => s.isDark);
  const isPremium                = useAppStore((s) => s.isPremium);
  const storeWatchlist           = useAppStore((s) => s.watchlist);
  const removeFromWatchlist      = useAppStore((s) => s.removeFromWatchlist);
  const deleteAlertsForSku       = useAppStore((s) => s.deleteAlertsForSku);
  const hotSkus                  = useAppStore((s) => s.hotSkus);
  const priceAlerts              = useAppStore((s) => s.priceAlerts);
  const catalogWatchlist         = useAppStore((s) => s.catalogWatchlist);
  const removeCatalogFromWatchlist = useAppStore((s) => s.removeCatalogFromWatchlist);
  const addToWatchlist           = useAppStore((s) => s.addToWatchlist);
  const mergeSkuIntoHot          = useAppStore((s) => s.mergeSkuIntoHot);
  const loadUserData             = useAppStore((s) => s.loadUserData);
  const userId                   = useAppStore((s) => s.user?.id);
  const theme                    = buildTheme(isDark);

  // Auto-promote any pending catalog watchlist items on tab focus
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    const run = async () => {
      await loadUserData(userId);
      if (!active) return;

      // Recover watchlist SKUs not in hotSkus (scan-created is_active:false SKUs)
      const currentHotIds = new Set(useAppStore.getState().hotSkus.map((s) => s.id));
      for (const skuId of useAppStore.getState().watchlist) {
        if (!currentHotIds.has(skuId)) {
          fetchSkuById(skuId).then((sku) => { if (sku && active) mergeSkuIntoHot(sku); }).catch(() => {});
        }
      }

      const pending = useAppStore.getState().catalogWatchlist;
      if (pending.length === 0) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !active) return;
      for (const item of pending) {
        const promotion = await promoteCatalogToSku(item.catalogId, session.access_token);
        if (!active) return;
        if (promotion?.skuId) {
          removeCatalogFromWatchlist(item.catalogId);
          addToWatchlist(promotion.skuId);
          fetchSkuById(promotion.skuId).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
        }
      }
    };
    run();
    return () => { active = false; };
  }, [userId]));

  const [scrolled, setScrolled]           = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [alertSkuId, setAlertSkuId]       = useState<string | null>(null);
  const [catalogDetailId, setCatalogDetailId] = useState<string | null>(null);

  const watched: SKU[] = useMemo(() => {
    return storeWatchlist
      .map((id) => hotSkus.find((s) => s.id === id))
      .filter((s): s is SKU => !!s)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [storeWatchlist, hotSkus]);

  const alertSku = useMemo(
    () => watched.find((s) => s.id === alertSkuId),
    [watched, alertSkuId]
  );

  const totalWatchCount = storeWatchlist.length + catalogWatchlist.length;

  const handleUnwatch = (sku: SKU) => {
    const skuAlerts = priceAlerts.filter((a) => a.skuId === sku.id && a.isActive);
    if (skuAlerts.length > 0) {
      Alert.alert(
        'Remove from watchlist',
        `${sku.name} has ${skuAlerts.length} active price alert${skuAlerts.length !== 1 ? 's' : ''}. Removing will delete them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove & delete alerts',
            style: 'destructive',
            onPress: () => {
              deleteAlertsForSku(sku.id);
              removeFromWatchlist(sku.id);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Remove from watchlist',
        `Stop watching ${sku.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFromWatchlist(sku.id) },
        ]
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        title="Watchlist"
        theme={theme}
        scrolled={scrolled}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
      >
        {/* Status card */}
        <View style={{
          backgroundColor: theme.surface,
          borderRadius: theme.radius,
          padding: 16,
          marginBottom: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderWidth: 0.5,
          borderColor: theme.hairline,
        }}>
          <View>
            <Text style={{
              fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted,
              letterSpacing: 0.1 * 11, textTransform: 'uppercase', marginBottom: 4,
            }}>
              Watching
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{
                fontFamily: theme.fontDispBold, fontSize: 24,
                color: theme.text, letterSpacing: -0.02 * 24,
              }}>
                {totalWatchCount}
              </Text>
              {!isPremium && (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.faint }}>
                  / {FREE_CAP}
                </Text>
              )}
              {isPremium && (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.premium, letterSpacing: 0.1 * 11, textTransform: 'uppercase' }}>
                  Unlimited
                </Text>
              )}
            </View>
          </View>
          {!isPremium && (
            <Pressable
              style={({ pressed }) => ({
                backgroundColor: theme.premium, borderRadius: 999,
                paddingHorizontal: 14, paddingVertical: 9,
                opacity: pressed ? 0.8 : 1,
              })}
              onPress={() => setUpgradeContext('watchlist')}
            >
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.premiumInk }}>
                Unlock unlimited
              </Text>
            </Pressable>
          )}
        </View>

        {watched.length === 0 && catalogWatchlist.length === 0 ? (
          <View style={{
            padding: 36, alignItems: 'center',
            backgroundColor: theme.surface, borderRadius: theme.radius,
            borderWidth: 0.5, borderStyle: 'dashed', borderColor: theme.hairline,
            gap: 8,
          }}>
            <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: theme.text }}>
              Nothing watched yet
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, textAlign: 'center' }}>
              Browse the Hot tab and tap the eye icon on any SKU.
            </Text>
            <Pressable
              style={({ pressed }) => ({
                marginTop: 6, backgroundColor: theme.accent, borderRadius: theme.radius,
                paddingHorizontal: 24, paddingVertical: 12, opacity: pressed ? 0.8 : 1,
              })}
              onPress={() => router.push('/')}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.accentInk }}>
                Browse Hot
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {watched.length > 0 && (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.gold,
                    letterSpacing: 0.14 * 11, textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    Today
                  </Text>
                  <Text style={{
                    fontFamily: theme.fontDispBold, fontSize: 26,
                    color: theme.text, letterSpacing: -0.52, lineHeight: 30,
                  }}>
                    Movers
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    Sorted by absolute change · long-press to remove
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {watched.map((sku) => {
                    const activeAlerts    = priceAlerts.filter((a) => a.skuId === sku.id && a.isActive);
                    const triggeredAlerts = priceAlerts.filter((a) => a.skuId === sku.id && !a.isActive && a.triggeredAt !== null);
                    return (
                      <View key={sku.id}>
                        <SKUCard
                          sku={sku}
                          theme={theme}
                          density="medium"
                          onPress={() => router.push(`/sku/${sku.id}`)}
                          onLongPress={() => handleUnwatch(sku)}
                        />
                        {/* Alert chips row */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2, marginTop: 6 }}>
                          {/* Triggered alerts — orange/accent, bold, ⚡ prefix */}
                          {triggeredAlerts.map((alert) => (
                            <Pressable
                              key={alert.id}
                              onPress={() => setAlertSkuId(sku.id)}
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
                          {/* Active (waiting) alerts — muted gold */}
                          {activeAlerts.map((alert) => (
                            <Pressable
                              key={alert.id}
                              onPress={() => setAlertSkuId(sku.id)}
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
                            onPress={() => setAlertSkuId(sku.id)}
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
                  })}
                </View>
              </>
            )}

            {/* ── Catalog / scanned products section ──────────────────── */}
            {catalogWatchlist.length > 0 && (
              <View style={{ marginTop: watched.length > 0 ? 28 : 0 }}>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.gold,
                    letterSpacing: 0.14 * 11, textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    Scanned
                  </Text>
                  <Text style={{
                    fontFamily: theme.fontDispBold, fontSize: 26,
                    color: theme.text, letterSpacing: -0.52, lineHeight: 30,
                  }}>
                    Scanned Products
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    Tap to view · ··· to remove
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {catalogWatchlist.map((item) => {
                    const c = categoryColor(item.categoryId, theme.dark);
                    const cat = catById(item.categoryId);
                    return (
                      <Pressable
                        key={item.catalogId}
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
                            style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{
                            width: 48, height: 48, borderRadius: 10,
                            backgroundColor: c.tint,
                            alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Text style={{
                              fontFamily: 'Inter_700Bold', fontSize: 11,
                              color: c.ink, textTransform: 'uppercase', letterSpacing: 0.5,
                            }}>
                              {cat?.short?.slice(0, 3) ?? '???'}
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.text, letterSpacing: -0.2 }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{
                              paddingHorizontal: 6, paddingVertical: 2,
                              borderRadius: 999, backgroundColor: c.tint,
                            }}>
                              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {cat?.short ?? item.categoryId}
                              </Text>
                            </View>
                            <View style={{
                              paddingHorizontal: 6, paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: theme.surface2,
                              borderWidth: 0.5, borderColor: theme.hairline,
                            }}>
                              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: theme.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Pending SKU
                              </Text>
                            </View>
                          </View>
                        </View>

                        {item.price != null && (
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.text }}>
                            {fmtPrice(item.price)}
                          </Text>
                        )}
                        <Pressable
                          onPress={() =>
                            Alert.alert(
                              item.name,
                              undefined,
                              [
                                {
                                  text: 'Remove from watchlist',
                                  style: 'destructive',
                                  onPress: () => removeCatalogFromWatchlist(item.catalogId),
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
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <UpgradeSheet
        open={upgradeContext !== null}
        context={upgradeContext ?? 'watchlist'}
        theme={theme}
        onClose={() => setUpgradeContext(null)}
        onConfirm={() => setUpgradeContext(null)}
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

      <CatalogItemSheet
        open={catalogDetailId !== null}
        catalogId={catalogDetailId}
        theme={theme}
        onClose={() => setCatalogDetailId(null)}
      />
    </View>
  );
}
