import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import { CATEGORIES, catById } from '@/lib/appConfig';

import AppHeader from '@/components/AppHeader';
import IconButton from '@/components/IconButton';
import { ProductThumb } from '@/components/ProductPlaceholder';
import Chip from '@/components/Chip';
import SKUCard from '@/components/SKUCard';
import Sheet from '@/components/Sheet';
import FilterGroup from '@/components/FilterGroup';
import PrimaryButton from '@/components/PrimaryButton';
import NotificationsSheet from '@/components/NotificationsSheet';

type SortBy = 'hot' | 'velocity' | 'price';

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
  const unreadCount = useAppStore((s) => s.unreadCount);
  const isPremium = useAppStore((s) => s.isPremium);
  const theme = buildTheme(isDark);

  const [sortBy, setSortBy]       = useState<SortBy>('hot');
  const [activeCat, setActiveCat] = useState<string>(
    () => followedCategories.length === 1 ? followedCategories[0] : 'all'
  );

  // Reset activeCat if it's no longer in the followed set
  useEffect(() => {
    const visible = followedCategories.length > 0 ? followedCategories : null;
    if (visible && activeCat !== 'all' && !visible.includes(activeCat)) {
      setActiveCat('all');
    }
  }, [followedCategories]);

  const toggleFollowedCat = (catId: string) => {
    let next: string[];
    if (catId === 'all') {
      next = [];
    } else {
      next = followedCategories.includes(catId)
        ? followedCategories.filter((id) => id !== catId)
        : [...followedCategories, catId];
      if (next.length === CATEGORIES.length) next = []; // all selected = same as "All"
    }
    setFollowedCategories(next);
    if (user) {
      api.updateUserPreferences(user.id, { followedCategories: next.length > 0 ? next : undefined });
    }
  };

  const [filterSheetOpen, setFilterSheetOpen]       = useState(false);
  const [newTodayOpen, setNewTodayOpen]             = useState(false);
  const [newTodayPendingNav, setNewTodayPendingNav] = useState<string | null>(null);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visibleCatIds = followedCategories.length > 0
    ? followedCategories
    : CATEGORIES.map((c) => c.id);

  // Hero: hottest SKU within the selected category (or overall when All)
  const hero = useMemo(() => {
    const catScope = activeCat === 'all' ? visibleCatIds : [activeCat];
    const pool = hotSkus.filter((s) => catScope.includes(s.category));
    return getFeaturedSku(pool.sort((a, b) => b.hot - a.hot));
  }, [hotSkus, activeCat, visibleCatIds]);

  // Per-category sections: top 5 by selected sort
  const sections = useMemo(() => {
    const catIds = activeCat === 'all' ? visibleCatIds : [activeCat];

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
  }, [hotSkus, activeCat, sortBy, visibleCatIds]);

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
            <IconButton theme={theme} onPress={() => setFilterSheetOpen(true)} accessibilityLabel="Open filters">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2} strokeLinecap="round">
                <Path d="M3 6h18M6 12h12M10 18h4" />
              </Svg>
            </IconButton>
            <View style={{ position: 'relative' }}>
              <IconButton
                theme={theme}
                onPress={() => setNotifOpen(true)}
                accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                  stroke={theme.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <Path d="M13.73 21a2 2 0 01-3.46 0" />
                </Svg>
              </IconButton>
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: 0, right: 0,
                  minWidth: 16, height: 16, borderRadius: 999,
                  backgroundColor: theme.premium,
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                  pointerEvents: 'none',
                }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.premiumInk }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
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

        {/* ── Category chips — single select ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4, gap: 8, flexDirection: 'row' }}
        >
          <Chip theme={theme} active={activeCat === 'all'} onClick={() => setActiveCat('all')} size="sm">All</Chip>
          {visibleCatIds.map((catId) => {
            const cat = catById(catId);
            if (!cat) return null;
            return (
              <Chip
                key={catId}
                theme={theme}
                active={activeCat === catId}
                onClick={() => setActiveCat(activeCat === catId ? 'all' : catId)}
                size="sm"
              >
                {cat.short}
              </Chip>
            );
          })}
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
                    narrativeOverride={
                      isPremium && hero.insight?.narrationShort
                        ? hero.insight.narrationShort
                        : undefined
                    }
                  />
                </View>
              )}

              {/* ── Scan buttons ── */}
              <View style={{ paddingHorizontal: 20, marginBottom: 12, flexDirection: 'row', gap: 10 }}>
                {/* Scan Barcode */}
                <Pressable
                  onPress={() => router.push('/scan?mode=barcode')}
                  accessibilityLabel="Scan barcode"
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: theme.radius, padding: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    opacity: pressed ? 0.88 : 1,
                    backgroundColor: '#FF5500',
                  })}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round">
                      <Path d="M3 5h2M3 5v2M3 5h2m14 0h2v2m-2-2h-2m0 14h2v-2m-2 2h-2M3 19h2v-2M3 19v-2" />
                      <Path d="M7 8h10v8H7z" strokeWidth={1.5} />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontFamily: theme.fontDispBold, letterSpacing: -0.2 }}>
                      Scan Barcode
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      Product barcode
                    </Text>
                  </View>
                </Pressable>

                {/* Visual Scan */}
                <Pressable
                  onPress={() => router.push('/scan?mode=visual')}
                  accessibilityLabel="Visual scan"
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: theme.radius, padding: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    opacity: pressed ? 0.88 : 1,
                    backgroundColor: '#2A1D08',
                    borderWidth: 0.5,
                    borderColor: theme.premium,
                  })}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 10,
                    backgroundColor: theme.premium,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.premiumInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <Circle cx="12" cy="13" r="4" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={{ color: theme.premium, fontSize: 13.5, fontFamily: theme.fontDispBold, letterSpacing: -0.2 }}>
                        Visual Scan
                      </Text>
                      {!isPremium && (
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={theme.premium} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z" />
                          <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </Svg>
                      )}
                    </View>
                    <Text style={{ color: `${theme.premium}99`, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      Point & identify
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* ── New Today card ── */}
              {newCount > 0 && (
                <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
                  <Pressable
                    onPress={() => setNewTodayOpen(true)}
                    style={({ pressed }) => ({
                      borderRadius: theme.radius, padding: 14,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      opacity: pressed ? 0.75 : 1,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(21,23,26,0.05)',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(21,23,26,0.12)',
                    })}
                  >
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(21,23,26,0.07)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: theme.text, fontFamily: theme.fontMonoBold, fontSize: 17, letterSpacing: -0.5 }}>
                        +{newCount}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontFamily: theme.fontDispBold, letterSpacing: -0.3 }}>
                        New Today
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 2 }} numberOfLines={1}>
                        {newCount} SKU{newCount !== 1 ? 's' : ''} added in the last 24 hours
                      </Text>
                    </View>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M9 6l6 6-6 6" />
                    </Svg>
                  </Pressable>
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
      <Sheet
        open={newTodayOpen}
        onClose={() => setNewTodayOpen(false)}
        onDismiss={() => {
          if (newTodayPendingNav) {
            router.push(`/sku/${newTodayPendingNav}`);
            setNewTodayPendingNav(null);
          }
        }}
        theme={theme}
        title="New Today"
      >
        <View style={{ paddingBottom: 32 }}>
          {newToday.map((sku) => (
            <Pressable
              key={sku.id}
              onPress={() => { setNewTodayPendingNav(sku.id); setNewTodayOpen(false); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 10,
                opacity: pressed ? 0.7 : 1,
                borderBottomWidth: 0.5, borderBottomColor: theme.hairline,
              })}
            >
              <ProductThumb sku={sku} theme={theme} size={52} radius={10} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2 }} numberOfLines={1}>{sku.name}</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }} numberOfLines={1}>{sku.series ?? sku.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 14, color: '#FF5500' }}>${sku.price.median.toFixed(0)}</Text>
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
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
              My Categories
            </Text>
            <View style={{ backgroundColor: theme.surface2, borderRadius: theme.radius, overflow: 'hidden' }}>
              {[{ id: 'all', label: 'All Categories' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))].map((opt, idx, arr) => {
                const isAll = opt.id === 'all';
                const isSelected = isAll ? followedCategories.length === 0 : followedCategories.includes(opt.id);
                return (
                  <React.Fragment key={opt.id}>
                    <Pressable
                      onPress={() => toggleFollowedCat(opt.id)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 16, paddingVertical: 13,
                        backgroundColor: pressed ? theme.surface : 'transparent',
                      })}
                    >
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: isSelected ? theme.text : theme.muted }}>
                        {opt.label}
                      </Text>
                      <View style={{
                        width: 22, height: 22, borderRadius: 999,
                        backgroundColor: isSelected ? theme.accent : 'transparent',
                        borderWidth: isSelected ? 0 : 1.5,
                        borderColor: theme.faint,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && (
                          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M20 6L9 17l-5-5" />
                          </Svg>
                        )}
                      </View>
                    </Pressable>
                    {idx < arr.length - 1 && (
                      <View style={{ height: 0.5, backgroundColor: theme.hairline, marginLeft: 16 }} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
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
