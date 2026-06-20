import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Image,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import Svg, { Path } from 'react-native-svg';

import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { UpgradeContext, RewardSummary } from '@/lib/types';
import { fetchRewardSummary, claimRewardPremium } from '@/lib/api';
import AppHeader from '@/components/AppHeader';
import UpgradeSheet from '@/components/UpgradeSheet';
import GuideSheet from '@/components/GuideSheet';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/appConfig';
import * as api from '@/lib/api';

interface BaseRow { id: string; title: string; premium?: boolean; }
interface NavRow extends BaseRow { type: 'nav'; detail?: string; onPress: () => void; }
interface ToggleRow extends BaseRow { type: 'toggle'; value: boolean; onToggle: () => void; }
type SettingsRow = NavRow | ToggleRow;
interface SettingsGroup { label: string; rows: SettingsRow[]; }

const PRIVACY_URL = 'https://trendnable.app/privacy';
const TERMS_URL   = 'https://trendnable.app/terms';

// Inline progress bar for free-tier limits on the premium upsell card.
function UsageMeter({ label, used, limit, theme, isDark }: {
  label: string;
  used: number;
  limit: number;
  theme: ReturnType<typeof buildTheme>;
  isDark: boolean;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const atCap = used >= limit;
  const trackBg = isDark ? 'rgba(241,194,76,0.16)' : 'rgba(180,140,30,0.18)';
  const fillColor = atCap ? '#fb7185' : theme.premium;
  const textColor = isDark ? theme.premium : theme.premiumInk;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{
        fontFamily: 'Inter_600SemiBold', fontSize: 11,
        color: textColor, opacity: 0.85,
        width: 86,
      }}>
        {label}
      </Text>
      <View style={{
        flex: 1, height: 5, borderRadius: 999,
        backgroundColor: trackBg, overflow: 'hidden',
      }}>
        <View style={{
          width: `${pct}%`, height: '100%',
          backgroundColor: fillColor,
        }} />
      </View>
      <Text style={{
        fontFamily: 'JetBrainsMono_700Bold', fontSize: 11,
        color: atCap ? '#fb7185' : textColor,
        fontVariant: ['tabular-nums'],
        minWidth: 38, textAlign: 'right',
      }}>
        {used} / {limit}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const setIsDark = useAppStore((s) => s.setIsDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const followedCategories = useAppStore((s) => s.followedCategories);
  const setFollowedCategories = useAppStore((s) => s.setFollowedCategories);
  const user = useAppStore((s) => s.user);
  const watchlistCount = useAppStore((s) => s.watchlist.length + s.catalogWatchlist.length);
  const scanQuota = useAppStore((s) => s.scanQuota);
  const setNotifyMovers = useAppStore((s) => s.setNotifyMovers);
  const setNotifyInsights = useAppStore((s) => s.setNotifyInsights);
  const theme = buildTheme(isDark);

  const rewardUnits = useAppStore((s) => s.rewardUnits);
  const stars = Math.floor(rewardUnits / 50);

  const [scrolled, setScrolled] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [catsExpanded, setCatsExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchRewardSummary(user.id).then(setRewardSummary).catch(() => {});
  }, [user?.id]);

  async function handleClaimFreeMonth() {
    if (!user) return;
    try {
      await claimRewardPremium(user.id);
      useAppStore.getState().setIsPremium(true);
      const updated = await fetchRewardSummary(user.id);
      setRewardSummary(updated);
      Alert.alert('🎉 Free month unlocked!', 'Premium is active for 30 days.');
    } catch (e: unknown) {
      Alert.alert('Could not claim', (e as Error).message ?? 'Please try again.');
    }
  }

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const toggleFollowedCat = (catId: string) => {
    let next: string[];
    if (catId === 'all') {
      next = [];
    } else {
      next = followedCategories.includes(catId)
        ? followedCategories.filter((id) => id !== catId)
        : [...followedCategories, catId];
      if (next.length === CATEGORIES.length) next = [];
    }
    setFollowedCategories(next);
    if (user) {
      api.updateUserPreferences(user.id, { followedCategories: next.length > 0 ? next : undefined });
    }
  };

  function handleRestorePurchases() {
    const rcKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
    if (!rcKey || rcKey === 'your-revenuecat-ios-key') {
      Alert.alert('Not available', 'Purchases are not available in this build.');
      return;
    }
    (async () => {
      try {
        const Purchases = require('react-native-purchases').default;
        const customerInfo = await Purchases.restorePurchases();
        const isActive = !!customerInfo.entitlements.active['premium'];
        if (isActive) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { api } = await import('@/lib/api');
            await api.updateUserPremium(session.user.id, true);
          }
          useAppStore.getState().setIsPremium(true);
          Alert.alert('Restored!', 'Your Premium subscription has been restored.');
        } else {
          Alert.alert('No active subscription', 'No active Premium subscription was found for this Apple ID.');
        }
      } catch (e: unknown) {
        Alert.alert('Restore failed', (e as Error).message ?? 'Something went wrong.');
      }
    })();
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your data — collection, watchlist, and subscription. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => confirmDeleteAccount(),
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    if (!user) {
      await supabase.auth.signOut();
      return;
    }
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;

      await supabase.auth.signOut();
    } catch (e: unknown) {
      Alert.alert('Could not delete account', (e as Error).message ?? 'Please try again or contact support.');
    } finally {
      setDeleting(false);
    }
  }

  const setIsPremium = useAppStore((s) => s.setIsPremium);

  const settingsGroups: SettingsGroup[] = [
    ...(__DEV__ ? [{
      label: 'Developer',
      rows: [{
        id: 'devPremium', type: 'toggle' as const,
        title: '[DEV] Simulate Premium',
        value: isPremium,
        onToggle: () => setIsPremium(!isPremium),
      }],
    }] : []),
    {
      label: 'Personalization',
      rows: [
        {
          id: 'darkMode', type: 'toggle', title: 'Dark mode',
          value: isDark, onToggle: () => setIsDark(!isDark),
        },
      ],
    },
    {
      label: 'Notifications',
      rows: [
        {
          id: 'notifyMovers', type: 'toggle',
          title: 'Watchlist movers',
          value: user?.notify_movers ?? true,
          onToggle: () => setNotifyMovers(!(user?.notify_movers ?? true)),
        },
        {
          id: 'notifyInsights', type: 'toggle',
          title: 'Insight changes',
          value: user?.notify_insights ?? true,
          onToggle: () => setNotifyInsights(!(user?.notify_insights ?? true)),
        },
      ],
    },
    {
      label: 'Account',
      rows: [
        {
          id: 'guide', type: 'nav', title: 'Feature guide',
          detail: 'What you can do & where to find it',
          onPress: () => setGuideOpen(true),
        },
        {
          id: 'subscription', type: 'nav', title: 'Subscription',
          detail: isPremium ? 'Premium — manage in App Store' : 'Free',
          onPress: () => {
            if (isPremium) {
              Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
            } else {
              setUpgradeContext('feature');
            }
          },
        },
        {
          id: 'restore', type: 'nav', title: 'Restore purchases',
          onPress: handleRestorePurchases,
        },
        {
          id: 'help', type: 'nav', title: 'Help & Support',
          onPress: () => Linking.openURL('mailto:hello@trendnable.app?subject=Support').catch(() => {}),
        },
        {
          id: 'suggestSku', type: 'nav', title: 'Suggest a SKU',
          detail: 'Help us track new items',
          onPress: () => Linking.openURL('mailto:hello@trendnable.app?subject=SKU%20Suggestion').catch(() => {}),
        },
        {
          id: 'invite', type: 'nav', title: 'Invite a friend',
          onPress: () => Share.share({
            message: "I'm tracking collectibles on Trendnable — prices, trends, and P&L in one place. Join me: https://trendnable.app",
            url: 'https://trendnable.app',
          }).catch(() => {}),
        },
      ],
    },
    {
      label: 'Legal',
      rows: [
        {
          id: 'privacy', type: 'nav', title: 'Privacy Policy',
          onPress: () => Linking.openURL(PRIVACY_URL).catch(() => {}),
        },
        {
          id: 'terms', type: 'nav', title: 'Terms of Use',
          onPress: () => Linking.openURL(TERMS_URL).catch(() => {}),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="Settings" theme={theme} scrolled={scrolled} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
      >
        {/* Profile card */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 14,
          backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16,
          marginBottom: 16,
        }}>
          <Image
            source={require('@/assets/trendnable_logo_b.png')}
            style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}
            accessibilityLabel="Profile icon"
          />
          <View style={{ flex: 1 }}>
            {user ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: theme.text, letterSpacing: -0.3 }}>
                    {user.name ?? user.email}
                  </Text>
                  {isPremium && (
                    <View style={{ backgroundColor: theme.premium, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.premiumInk, letterSpacing: 0.12 * 10, textTransform: 'uppercase' }}>
                        Premium
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
                  {user.email}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: theme.text, letterSpacing: -0.3, marginBottom: 2 }}>
                  Guest
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
                  Sign in to sync your data
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Sparks reward card */}
        {user && (
          <View style={{
            backgroundColor: theme.surface,
            borderRadius: theme.radiusLg,
            padding: 18,
            marginBottom: 20,
          }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Svg width={14} height={14} viewBox="0 0 24 24" style={{ marginRight: 6 }}>
                <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={theme.premium} />
              </Svg>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 11,
                color: theme.premium, letterSpacing: 0.14 * 11,
                textTransform: 'uppercase', flex: 1,
              }}>
                Sparks
              </Text>
              {/* Star pip row — up to 5 stars, each = 50 units */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const filled = i < stars;
                  return (
                    <View key={i} style={{
                      width: 18, height: 18, borderRadius: 999,
                      backgroundColor: filled ? '#E8A33D' : theme.surface2,
                      borderWidth: filled ? 0 : 1,
                      borderColor: theme.premium,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, color: filled ? '#1a1008' : theme.premium, lineHeight: 12 }}>★</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Progress bar */}
            <View style={{ height: 6, borderRadius: 999, backgroundColor: theme.surface2, overflow: 'hidden', marginBottom: 8 }}>
              <View style={{
                height: '100%',
                borderRadius: 999,
                backgroundColor: theme.premium,
                width: `${((rewardUnits % 50) / 50) * 100}%`,
              }} />
            </View>

            {/* Status text */}
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginBottom: 2 }}>
              {rewardUnits} Sparks · {stars} star{stars !== 1 ? 's' : ''} · {50 - (rewardUnits % 50)} to next star
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint }}>
              Share prices during scans to earn more
            </Text>

            {/* Active reward premium period */}
            {rewardSummary?.expiresAt && new Date(rewardSummary.expiresAt) > new Date() && (
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 12,
                color: '#34d399', marginTop: 10,
              }}>
                Free month active · expires {new Date(rewardSummary.expiresAt).toLocaleDateString()}
              </Text>
            )}

            {/* Claim button — only when eligible and not in active reward period */}
            {rewardSummary?.canClaimFreeMonth && !(rewardSummary.expiresAt && new Date(rewardSummary.expiresAt) > new Date()) && (
              <Pressable
                onPress={handleClaimFreeMonth}
                accessibilityRole="button"
                accessibilityLabel="Claim your free month of Premium"
                style={({ pressed }) => ({
                  alignSelf: 'flex-end',
                  marginTop: 12,
                  backgroundColor: theme.premium,
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderRadius: 999,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.premiumInk }}>
                  Claim your free month →
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Premium upsell */}
        {!isPremium && (
          <Pressable
            onPress={() => setUpgradeContext('feature')}
            accessibilityRole="button"
            accessibilityLabel="Unlock Trendnable Premium"
            style={({ pressed }) => ({
              width: '100%',
              backgroundColor: isDark ? '#2A1D08' : '#FFF8EC',
              borderRadius: theme.radius,
              padding: 18,
              borderWidth: 0.5,
              borderColor: theme.premium,
              marginBottom: 20,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: theme.premium, alignItems: 'center', justifyContent: 'center',
              }}>
                <Svg width={20} height={20} viewBox="0 0 12 12" fill={theme.premiumInk}>
                  <Path d="M6 1.5l1.5 3 3 .4-2.2 2 .6 3.1L6 8.5 3.1 10l.6-3.1L1.5 4.9l3-.4z" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fontDispBold, fontSize: 17, color: isDark ? theme.premium : theme.premiumInk, letterSpacing: -0.3 }}>
                  Trendnable Premium
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: isDark ? theme.premium : theme.premiumInk, opacity: 0.85, marginTop: 2 }}>
                  P&L · history · alerts · $2.99/mo
                </Text>
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: isDark ? theme.premium : theme.premiumInk }}>→</Text>
            </View>

            {/* Usage meters — show progress toward the wall */}
            <View style={{ marginTop: 14, gap: 8 }}>
              <UsageMeter
                label="Watchlist"
                used={watchlistCount}
                limit={20}
                theme={theme}
                isDark={isDark}
              />
              <UsageMeter
                label="Scans today"
                used={scanQuota?.used ?? 0}
                limit={scanQuota?.limit ?? 5}
                theme={theme}
                isDark={isDark}
              />
            </View>
          </Pressable>
        )}

        {/* My Categories */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{
            fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.faint,
            letterSpacing: 0.14 * 11, textTransform: 'uppercase',
            paddingLeft: 10, paddingBottom: 8,
          }}>
            My Categories
          </Text>
          <View style={{ backgroundColor: theme.surface, borderRadius: theme.radius, overflow: 'hidden' }}>
            {/* Header row — always visible, tapping toggles expand */}
            <Pressable
              onPress={() => setCatsExpanded((v) => !v)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 14,
                backgroundColor: pressed ? theme.surface2 : 'transparent',
              })}
            >
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.text }}>
                {followedCategories.length === 0
                  ? 'All Categories'
                  : `${followedCategories.length} selected`}
              </Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke={theme.faint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: [{ rotate: catsExpanded ? '180deg' : '0deg' }] }}
              >
                <Path d="M6 9l6 6 6-6" />
              </Svg>
            </Pressable>

            {/* Expandable list */}
            {catsExpanded && (
              <>
                <View style={{ height: 0.5, backgroundColor: theme.hairline }} />
                {[{ id: 'all', label: 'All Categories' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))].map((opt, idx, arr) => {
                  const isAll = opt.id === 'all';
                  const isSelected = isAll ? followedCategories.length === 0 : followedCategories.includes(opt.id);
                  return (
                    <React.Fragment key={opt.id}>
                      <Pressable
                        onPress={() => toggleFollowedCat(opt.id)}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingHorizontal: 16, paddingVertical: 14,
                          backgroundColor: pressed ? theme.surface2 : 'transparent',
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
              </>
            )}
          </View>
        </View>

        {/* Settings groups */}
        {settingsGroups.map((group) => (
          <View key={group.label} style={{ marginBottom: 20 }}>
            <Text style={{
              fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.faint,
              letterSpacing: 0.14 * 11, textTransform: 'uppercase',
              paddingLeft: 10, paddingBottom: 8,
            }}>
              {group.label}
            </Text>
            <View style={{
              backgroundColor: theme.surface, borderRadius: theme.radius, overflow: 'hidden',
            }}>
              {group.rows.map((row, idx) => (
                <React.Fragment key={row.id}>
                  {row.type === 'nav' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={row.title}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 14, paddingHorizontal: 16, minHeight: 50,
                        backgroundColor: pressed ? theme.surface2 : 'transparent',
                      })}
                      onPress={row.onPress}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        {row.premium && (
                          <Text style={{ fontFamily: theme.fontMono, fontSize: 9, color: theme.premium, marginRight: 5 }}>◆ </Text>
                        )}
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.text }}>{row.title}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {row.detail ? (
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted }}>{row.detail}</Text>
                        ) : null}
                        <Svg width={7} height={12} viewBox="0 0 7 12" fill="none" stroke={theme.faint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M1 1l5 5-5 5" />
                        </Svg>
                      </View>
                    </Pressable>
                  ) : (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 12, paddingHorizontal: 16, minHeight: 50,
                    }}>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.text }}>{row.title}</Text>
                      <Switch
                        value={row.value}
                        onValueChange={row.onToggle}
                        trackColor={{ false: theme.surface2, true: theme.accent }}
                        thumbColor={'#FFFFFF'}
                        ios_backgroundColor={theme.surface2}
                        accessibilityLabel={row.title}
                      />
                    </View>
                  )}
                  {idx < group.rows.length - 1 && (
                    <View style={{ height: 0.5, backgroundColor: theme.hairline, marginLeft: 16 }} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        {user && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() =>
              Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
              ])
            }
            style={({ pressed }) => ({
              backgroundColor: theme.surface, borderRadius: theme.radius,
              paddingVertical: 14, alignItems: 'center', marginBottom: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.neg }}>Sign out</Text>
          </Pressable>
        )}

        {/* Delete account */}
        {user && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => ({
              backgroundColor: 'transparent',
              paddingVertical: 10, alignItems: 'center', marginBottom: 20,
              opacity: pressed || deleting ? 0.5 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.faint }}>
              {deleting ? 'Deleting…' : 'Delete account'}
            </Text>
          </Pressable>
        )}

        <Text style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.faint, textAlign: 'center', marginBottom: 8 }}>
          Trendnable · v{appVersion}
        </Text>
      </ScrollView>

      <UpgradeSheet
        open={upgradeContext !== null}
        context={upgradeContext ?? 'pl'}
        theme={theme}
        onClose={() => setUpgradeContext(null)}
        onConfirm={() => setUpgradeContext(null)}
      />

      <GuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        theme={theme}
        isDark={isDark}
      />
    </View>
  );
}
