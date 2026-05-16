import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { SKU, UpgradeContext } from '@/lib/types';
import AppHeader from '@/components/AppHeader';
import UpgradeSheet from '@/components/UpgradeSheet';
import SKUCard from '@/components/SKUCard';

const FREE_CAP = 20;

export default function WatchlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const storeWatchlist = useAppStore((s) => s.watchlist);
  const removeFromWatchlist = useAppStore((s) => s.removeFromWatchlist);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const theme = buildTheme(isDark);

  const [scrolled, setScrolled] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);

  const watched: SKU[] = useMemo(() => {
    return storeWatchlist
      .map((id) => hotSkus.find((s) => s.id === id))
      .filter((s): s is SKU => !!s)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [storeWatchlist, hotSkus]);

  const watchCount = storeWatchlist.length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="Watchlist" theme={theme} scrolled={scrolled} />

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
                {watchCount}
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

        {watched.length === 0 ? (
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
            {/* Section header */}
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
                Sorted by absolute change
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              {watched.map((sku) => (
                <SKUCard
                  key={sku.id}
                  sku={sku}
                  theme={theme}
                  density="medium"
                  onPress={() => router.push(`/sku/${sku.id}`)}
                  onLongPress={() =>
                    Alert.alert(
                      'Remove from watchlist',
                      `Stop watching ${sku.name}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeFromWatchlist(sku.id) },
                      ]
                    )
                  }
                />
              ))}
            </View>
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
    </View>
  );
}
