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

  const [sortBy, setSortBy]         = useState<SortBy>('hot');
  const [activeCats, setActiveCats] = useState<string[]>(
    () => followedCategories.length > 0 ? followedCategories : ['all']
  );

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
  const [newTodayOpen, setNewTodayOpen]       = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Hero: single hottest SKU across ALL categories (always featured)
  const hero = useMemo(() => getFeaturedSku(
    [...hotSkus].sort((a, b) => b.hot - a.hot)
  ), [hotSkus]);

  // Per-category sections: top 5 by selected sort, skip hero's category section's top spot
  const sections = useMemo(() => {
    const catIds = activeCats.includes('all')
      ? CATEGORIES.map((c) => c.id)
      : activeCats;

    return catIds
      .map((catId) => {
        const cat = CATEGORIES.find((c) => c.id === catId);
        const skus = hotSkus
          .filter((s) => s.category === catId)
          .sort((a, b) => {
            if (sortBy === 'velocity') return b.delta - a.delta;
            if (sortBy === 'price') return b.price.median - a.price.median;
            return b.hot - a.hot;
          })
          .slice(0, 5);
        return { catId, cat, skus };
      })
      .filter((s) => s.skus.length > 0 && s.cat);
  }, [hotSkus, activeCats, sortBy]);

  const totalCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.skus.length, 0),
    [sections]
  );

  const newToday = useMemo(() => hotSkus.filter((s) => s.age <= 1), [hotSkus]);
  const newCount = newToday.length;

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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />
        }
      >
        <NotificationBanner theme={theme} onPress={() => setNotifOpen(true)} />

        {/* ── Date / context subheader ── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <Text style={{
            fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.gold,
            letterSpacing: 0.14 * 11, textTransform: 'uppercase', marginBottom: 4,
          }}>
            {formatTodayLabel()}
          </Text>
          <Text style={{
            fontFamily: theme.fontDispBold, fontSize: 26, color: theme.text,
            letterSpacing: -0.52, lineHeight: 30,
          }}>
            What's moving today
          </Text>
        </View>

        {/* ── New Today card ── */}
        {newCount > 0 && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <Pressable
              onPress={() => setNewTodayOpen(true)}
              style={({ pressed }) => ({
                borderRadius: theme.radius, padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                opacity: pressed ? 0.88 : 1,
                backgroundColor: isDark ? '#162640' : '#2563EB',
              })}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#FFFFFF', fontFamily: theme.fontMonoBold, fontSize: 17, letterSpacing: -0.5 }}>
                  +{newCount}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: theme.fontDispBold, letterSpacing: -0.3 }}>
                  New Today
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 2 }} numberOfLines={1}>
                  {newCount} SKU{newCount !== 1 ? 's' : ''} added in the last 24 hours
                </Text>
              </View>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M9 6l6 6-6 6" />
              </Svg>
            </Pressable>
          </View>
        )}

        {/* ── Category chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
        >
          <Chip theme={theme} active={activeCats.includes('all')} onClick={() => setActiveCats(['all'])} size="sm">All</Chip>
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

        {/* ── Content ── */}
        <View style={{ paddingTop: 16 }}>
          {skusLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={theme.accent} />
              <Text style={{ color: theme.faint, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 12 }}>Loading…</Text>
            </View>
          ) : skusError ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <Text style={{ color: theme.neg, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{skusError}</Text>
              <Pressable
                onPress={retryLoadHotSkus}
                style={({ pressed }) => ({
                  backgroundColor: theme.surface2, borderRadius: theme.radius,
                  paddingHorizontal: 20, paddingVertical: 10, opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Retry</Text>
              </Pressable>
            </View>
          ) : sections.length === 0 ? (
            <View style={{
              margin: 20, padding: 36, alignItems: 'center',
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
              {/* TOP FIND hero — hottest SKU across all categories */}
              {hero && (
                <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
                  <SKUCard
                    sku={hero}
                    theme={theme}
                    density="hero"
                    onPress={() => router.push(`/sku/${hero.id}`)}
                  />
                </View>
              )}

              {/* Per-category sections */}
              {sections.map(({ catId, cat, skus }) => (
                <View key={catId} style={{ marginBottom: 32 }}>
                  {/* Section header */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 20, marginBottom: 12,
                  }}>
                    <Text style={{
                      fontFamily: theme.fontDispBold, fontSize: 18,
                      color: theme.text, letterSpacing: -0.3,
                    }}>
                      {cat!.label}
                    </Text>
                    <Pressable
                      onPress={() => router.push(`/catalog/category/${catId}`)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', gap: 4 })}
                    >
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.accent }}>See all</Text>
                      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M9 6l6 6-6 6" />
                      </Svg>
                    </Pressable>
                  </View>

                  {/* Top 5 SKU cards */}
                  <View style={{ paddingHorizontal: 20, gap: 10 }}>
                    {skus.map((sku, index) => (
                      <SKUCard
                        key={sku.id}
                        sku={sku}
                        theme={theme}
                        density="medium"
                        rank={index + 1}
                        onPress={() => router.push(`/sku/${sku.id}`)}
                      />
                    ))}
                  </View>
                </View>
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

      {/* ── New Today Sheet ── */}
      <Sheet open={newTodayOpen} onClose={() => setNewTodayOpen(false)} theme={theme} title="New Today">
        <View style={{ paddingBottom: 32 }}>
          {newToday.map((sku) => (
            <Pressable
              key={sku.id}
              onPress={() => { setNewTodayOpen(false); router.push(`/sku/${sku.id}`); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingHorizontal: 20, paddingVertical: 14,
                opacity: pressed ? 0.7 : 1,
                borderBottomWidth: 0.5, borderBottomColor: theme.hairline,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2 }} numberOfLines={1}>{sku.name}</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>{sku.series ?? sku.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 14, color: '#FC792E' }}>${sku.price.median.toFixed(0)}</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.muted }}>{sku.listings} listed</Text>
              </View>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M9 6l6 6-6 6" />
              </Svg>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* ── Filter Sheet ── */}
      <Sheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} theme={theme} title="Filters">
        <View style={{ padding: 20, gap: 4 }}>
          <FilterGroup
            title="Sort within sections"
            theme={theme}
            options={[
              { id: 'hot',      label: 'Hot Score' },
              { id: 'velocity', label: 'Velocity (Δ)' },
              { id: 'price',    label: 'Price' },
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
              Show {totalCount} items
            </PrimaryButton>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
