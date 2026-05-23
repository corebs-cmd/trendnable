import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import * as api from '@/lib/api';
import { getFeaturedSku } from '@/lib/featured';
import { CATEGORIES } from '@/lib/appConfig';

import AppHeader from '@/components/AppHeader';
import IconButton from '@/components/IconButton';
import Chip from '@/components/Chip';
import SKUCard from '@/components/SKUCard';
import Sheet from '@/components/Sheet';
import FilterGroup from '@/components/FilterGroup';
import PrimaryButton from '@/components/PrimaryButton';
import NotificationBanner from '@/components/NotificationBanner';
import NotificationsSheet from '@/components/NotificationsSheet';

type SortBy = 'hot' | 'velocity' | 'price';

function toggleChipSelection(current: string[], id: string): string[] {
  if (id === 'all') return ['all'];
  const without = current.filter((x) => x !== 'all' && x !== id);
  const hasId = current.includes(id);
  const next = hasId ? without : [...without, id];
  return next.length === 0 ? ['all'] : next;
}

// Format current date like "Thursday · 15 May"
function formatTodayLabel(): string {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const date = now.getDate();
  return `${day} · ${date} ${month}`;
}

export default function HotScreen() {
  const router = useRouter();
  const isDark = useAppStore((s) => s.isDark);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const skusLoading = useAppStore((s) => s.skusLoading);
  const skusError = useAppStore((s) => s.skusError);
  const retryLoadHotSkus = useAppStore((s) => s.retryLoadHotSkus);
  const followedCategories = useAppStore((s) => s.followedCategories);
  const setFollowedCategories = useAppStore((s) => s.setFollowedCategories);
  const user = useAppStore((s) => s.user);
  const theme = buildTheme(isDark);

  const [sortBy, setSortBy]           = useState<SortBy>('hot');
  const [activeCats, setActiveCats]   = useState<string[]>(
    () => followedCategories.length > 0 ? followedCategories : ['all']
  );

  // Persist chip selection to store + DB whenever user changes it
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const cats = activeCats.includes('all') ? [] : activeCats;
    setFollowedCategories(cats.length > 0 ? cats : []);
    if (user) {
      api.updateUserPreferences(user.id, { followedCategories: cats.length > 0 ? cats : undefined });
    }
  }, [activeCats]);

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [scrolled, setScrolled]       = useState(false);
  const [refreshing, setRefreshing]   = useState(false);

  const filtered = useMemo(() => {
    let list = [...hotSkus];
    if (!activeCats.includes('all')) list = list.filter((s) => activeCats.includes(s.category));
    list.sort((a, b) => {
      if (sortBy === 'hot') return b.hot - a.hot;
      if (sortBy === 'velocity') return b.delta - a.delta;
      return b.price.median - a.price.median;
    });
    return list;
  }, [hotSkus, activeCats, sortBy]);

  const newCount = useMemo(() => hotSkus.filter((s) => s.age <= 7).length, [hotSkus]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setScrolled(e.nativeEvent.contentOffset.y > 4);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await useAppStore.getState().loadHotSkus();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const hero = getFeaturedSku(filtered);
  const rest = filtered.filter((s) => s.id !== hero?.id);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        title="Trendnable"
        theme={theme}
        brandLogo
        scrolled={scrolled}
        trailing={
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <IconButton theme={theme} onPress={() => router.push('/scan')} accessibilityLabel="Scan barcode">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2} strokeLinecap="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Circle cx="12" cy="13" r="4" />
              </Svg>
            </IconButton>
            <IconButton theme={theme} onPress={() => setFilterSheetOpen(true)} accessibilityLabel="Open filters">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2} strokeLinecap="round">
                <Path d="M3 6h18M6 12h12M10 18h4" />
              </Svg>
            </IconButton>
          </View>
        }
      />

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {/* ── Price alert banner ───────────────────────────────────────── */}
        <NotificationBanner theme={theme} onPress={() => setNotifOpen(true)} />

        {/* ── Date / context subheader ──────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <Text style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 11,
            color: theme.gold,
            letterSpacing: 0.14 * 11,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            {formatTodayLabel()}
          </Text>
          <Text style={{
            fontFamily: theme.fontDispBold,
            fontSize: 26,
            color: theme.text,
            letterSpacing: -0.52,
            lineHeight: 30,
          }}>
            What's moving today
          </Text>
        </View>

        {/* ── Discovery card ────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Pressable
            onPress={() => setFilterSheetOpen(true)}
            style={({ pressed }) => ({
              borderRadius: theme.radius,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.88 : 1,
              backgroundColor: isDark ? '#162640' : '#2563EB',
              // dark uses a subtle navy gradient feel; light uses brand blue
            })}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{
                color: '#FFFFFF',
                fontFamily: theme.fontMonoBold,
                fontSize: 17,
                letterSpacing: -0.5,
              }}>
                +{newCount}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#FFFFFF',
                fontSize: 15,
                fontFamily: theme.fontDispBold,
                letterSpacing: -0.3,
              }}>
                New this week
              </Text>
              <Text style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 12.5,
                fontFamily: 'Inter_400Regular',
                marginTop: 2,
              }} numberOfLines={1}>
                SKUs trending upward we haven't tracked
              </Text>
            </View>

            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 6l6 6-6 6" />
            </Svg>
          </Pressable>
        </View>

        {/* ── Category chips — single row ───────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
        >
          <Chip theme={theme} active={activeCats.includes('all')} onClick={() => setActiveCats(['all'])} size="sm">
            All
          </Chip>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              theme={theme}
              active={activeCats.includes(cat.id)}
              onClick={() => setActiveCats((prev) => toggleChipSelection(prev, cat.id))}
              size="sm"
            >
              {cat.short}
            </Chip>
          ))}
        </ScrollView>

        {/* ── Sort row ──────────────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 12,
          justifyContent: 'space-between',
        }}>
          <Text style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12.5,
            color: theme.muted,
          }}>
            {filtered.length} items
          </Text>

          <View style={{ flexDirection: 'row', gap: 2 }}>
            {([['hot', 'Hot'], ['velocity', 'Δ'], ['price', '$']] as [SortBy, string][]).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setSortBy(id)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: sortBy === id ? theme.surface2 : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontFamily: sortBy === id ? 'Inter_700Bold' : 'Inter_400Regular',
                  fontSize: 12,
                  color: sortBy === id ? theme.text : theme.muted,
                }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── SKU list ──────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {skusLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={theme.accent} />
              <Text style={{ color: theme.faint, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 12 }}>
                Loading…
              </Text>
            </View>
          ) : skusError ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <Text style={{ color: theme.neg, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                {skusError}
              </Text>
              <Pressable
                onPress={retryLoadHotSkus}
                style={({ pressed }) => ({
                  backgroundColor: theme.surface2,
                  borderRadius: theme.radius,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Retry</Text>
              </Pressable>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{
              padding: 36, alignItems: 'center',
              backgroundColor: theme.surface, borderRadius: theme.radius,
              borderWidth: 0.5, borderStyle: 'dashed', borderColor: theme.hairline,
            }}>
              <Text style={{ color: theme.text, fontSize: 17, fontFamily: theme.fontDispBold }}>
                {hotSkus.length === 0 ? 'No data yet' : 'No matches'}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                {hotSkus.length === 0 ? 'Check back soon.' : 'Try clearing a filter.'}
              </Text>
            </View>
          ) : (
            <>
              {hero && (
                <SKUCard
                  key={hero.id}
                  sku={hero}
                  theme={theme}
                  density="hero"
                  onPress={() => router.push(`/sku/${hero.id}`)}
                />
              )}
              {rest.map((sku, index) => (
                <SKUCard
                  key={sku.id}
                  sku={sku}
                  theme={theme}
                  density="medium"
                  rank={index + 2}
                  onPress={() => router.push(`/sku/${sku.id}`)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <NotificationsSheet
        open={notifOpen}
        theme={theme}
        onClose={() => setNotifOpen(false)}
        onNavigate={(skuId) => router.push(`/sku/${skuId}`)}
      />

      {/* ── Filter Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} theme={theme} title="Filters">
        <View style={{ padding: 20, gap: 4 }}>
          <FilterGroup
            title="Sort"
            theme={theme}
            options={[
              { id: 'hot', label: 'Hot Score' },
              { id: 'velocity', label: 'Velocity (Δ)' },
              { id: 'price', label: 'Price' },
            ]}
            selected={[sortBy]}
            multi={false}
            onToggle={(id) => setSortBy(id as SortBy)}
          />
          <FilterGroup
            title="Categories"
            theme={theme}
            options={[{ id: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))]}
            selected={activeCats}
            multi
            onToggle={(id) => setActiveCats((prev) => toggleChipSelection(prev, id))}
          />
          <View style={{ marginTop: 18 }}>
            <PrimaryButton theme={theme} tone="accent" size="md" full onPress={() => setFilterSheetOpen(false)}>
              Show {filtered.length} items
            </PrimaryButton>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
