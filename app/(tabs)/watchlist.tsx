import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { buildTheme, categoryColor } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { SKU, UpgradeContext, CatalogWatchlistItem } from '@/lib/types';
import { catById, fmtPrice } from '@/lib/appConfig';
import AppHeader from '@/components/AppHeader';
import UpgradeSheet from '@/components/UpgradeSheet';
import SKUCard from '@/components/SKUCard';
import PriceAlertSheet from '@/components/PriceAlertSheet';
import NotificationsSheet from '@/components/NotificationsSheet';
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
  const unreadCount              = useAppStore((s) => s.unreadCount);
  const catalogWatchlist         = useAppStore((s) => s.catalogWatchlist);
  const removeCatalogFromWatchlist = useAppStore((s) => s.removeCatalogFromWatchlist);
  const theme                    = buildTheme(isDark);

  const [scrolled, setScrolled]           = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [alertSkuId, setAlertSkuId]       = useState<string | null>(null);
  const [notifOpen, setNotifOpen]         = useState(false);
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
        trailing={
          <Pressable
            onPress={() => setNotifOpen(true)}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 999,
              backgroundColor: unreadCount > 0 ? `${theme.premium}18` : theme.surface,
              borderWidth: unreadCount > 0 ? 1 : 0,
              borderColor: `${theme.premium}44`,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
              stroke={unreadCount > 0 ? theme.premium : theme.muted}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 01-3.46 0" />
            </Svg>
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: -2, right: -2,
                minWidth: 16, height: 16, borderRadius: 999,
                backgroundColor: theme.premium,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3,
              }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.premiumInk }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        }
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
                    const skuAlerts = priceAlerts.filter((a) => a.skuId === sku.id && a.isActive);
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
                          {skuAlerts.map((alert) => (
                            <View key={alert.id} style={{
                              flexDirection: 'row', alignItems: 'center',
                              backgroundColor: `${theme.premium}15`,
                              borderWidth: 0.5, borderColor: `${theme.premium}40`,
                              borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
                            }}>
                              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.premium }}>
                                {alert.direction === 'above' ? '↑' : '↓'} ${alert.targetPrice.toFixed(0)}
                              </Text>
                            </View>
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
                    Pending SKU data · long-press to remove
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
                        onLongPress={() =>
                          Alert.alert(
                            'Remove from watchlist',
                            `Stop watching ${item.name}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () => removeCatalogFromWatchlist(item.catalogId),
                              },
                            ]
                          )
                        }
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

      <NotificationsSheet
        open={notifOpen}
        theme={theme}
        onClose={() => setNotifOpen(false)}
        onNavigate={(skuId) => router.push(`/sku/${skuId}`)}
      />

      <CatalogItemSheet
        open={catalogDetailId !== null}
        catalogId={catalogDetailId}
        theme={theme}
        onClose={() => setCatalogDetailId(null)}
      />
    </View>
  );
}
