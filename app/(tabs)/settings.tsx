import React, { useState } from 'react';
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
import { UpgradeContext } from '@/lib/types';
import AppHeader from '@/components/AppHeader';
import UpgradeSheet from '@/components/UpgradeSheet';
import { supabase } from '@/lib/supabase';

interface BaseRow { id: string; title: string; premium?: boolean; }
interface NavRow extends BaseRow { type: 'nav'; detail?: string; onPress: () => void; }
interface ToggleRow extends BaseRow { type: 'toggle'; value: boolean; onToggle: () => void; }
type SettingsRow = NavRow | ToggleRow;
interface SettingsGroup { label: string; rows: SettingsRow[]; }

const PRIVACY_URL = 'https://trendnable.app/privacy';
const TERMS_URL   = 'https://trendnable.app/terms';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const setIsDark = useAppStore((s) => s.setIsDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const followedFandoms = useAppStore((s) => s.followedFandoms);
  const followedCategories = useAppStore((s) => s.followedCategories);
  const user = useAppStore((s) => s.user);
  const theme = buildTheme(isDark);

  const [scrolled, setScrolled] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [deleting, setDeleting] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

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

  const settingsGroups: SettingsGroup[] = [
    {
      label: 'Personalization',
      rows: [
        {
          id: 'fandoms', type: 'nav', title: 'Followed fandoms',
          detail: `${followedFandoms.length} selected`,
          onPress: () => Alert.alert('Coming soon', 'Edit your followed fandoms from the onboarding screen in the next update.'),
        },
        {
          id: 'categories', type: 'nav', title: 'Followed categories',
          detail: `${followedCategories.length} selected`,
          onPress: () => Alert.alert('Coming soon', 'Edit your followed categories from the onboarding screen in the next update.'),
        },
        {
          id: 'darkMode', type: 'toggle', title: 'Dark mode',
          value: isDark, onToggle: () => setIsDark(!isDark),
        },
      ],
    },
    {
      label: 'Account',
      rows: [
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

        {/* Premium upsell */}
        {!isPremium && (
          <Pressable
            onPress={() => setUpgradeContext('feature')}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Trendnable Premium"
            style={({ pressed }) => ({
              width: '100%',
              backgroundColor: isDark ? '#2A1D08' : '#FFF8EC',
              borderRadius: theme.radius,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderWidth: 0.5,
              borderColor: theme.premium,
              marginBottom: 20,
              opacity: pressed ? 0.9 : 1,
            })}
          >
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
                P&L · history · unlimited watchlist · $2.99/mo
              </Text>
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: isDark ? theme.premium : theme.premiumInk }}>→</Text>
          </Pressable>
        )}

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
    </View>
  );
}
