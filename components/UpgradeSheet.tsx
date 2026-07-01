import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme, RADIUS } from '@/lib/theme';
import { UpgradeContext } from '@/lib/types';
import Sheet from '@/components/Sheet';
import PrimaryButton from '@/components/PrimaryButton';
import { useAppStore } from '@/stores/appStore';
import * as api from '@/lib/api';

interface ContextData { title: string; sub: string; }

const CONTEXT_MAP: Record<UpgradeContext, ContextData> = {
  pl:            { title: 'Track your P&L',         sub: 'See exactly how each item performs against what you paid.' },
  history:       { title: 'Go deeper in history',   sub: 'See 90-day and 1-year trends, not just the last week.' },
  breakdown:     { title: 'Break down by category', sub: 'See where the value in your collection lives.' },
  watchlist:     { title: 'Watch unlimited SKUs',   sub: 'Free is capped at 20 — track everything that matters.' },
  share:         { title: 'Share your collection',  sub: 'Generate a beautiful card to show off what you collect.' },
  feature:       { title: 'Trendnable Premium',     sub: 'The full picture of your collection.' },
  priceAlerts:   { title: 'Set price alerts',       sub: 'Get notified the moment a watched item hits your target price.' },
  sellability:   { title: 'Unlock Sellability Score', sub: 'See sell-through rate, demand tier, and how quickly an item is likely to sell.' },
  scanQuota:     { title: 'Scan without limits',    sub: 'You get 1 free scan per day — resets at midnight. Go unlimited with Premium.' },
  visionScan:    { title: 'Visual Scan is Premium', sub: 'Point your camera at any collectable and we\'ll identify it — price, trends, and all. Premium only.' },
};

const FEATURES = [
  'Collection P&L · per-item and total',
  '90-day and 1-year history charts',
  'Category breakdown of your portfolio',
  'Unlimited watchlist (free is capped at 20)',
  'Unlimited scans (free gets 1 per day)',
  'Price alerts with instant notifications',
];

type Plan = 'monthly' | 'annual';

const PLAN_PRICE: Record<Plan, string> = {
  monthly: '$1.99',
  annual:  '$14.99',
};
const PLAN_PERIOD: Record<Plan, string> = {
  monthly: 'per month',
  annual:  'per year',
};

interface UpgradeSheetProps {
  open: boolean;
  context: UpgradeContext;
  theme: Theme;
  onClose: () => void;
  onConfirm: () => void;
}

function PlanCard({
  plan, selected, onSelect, theme,
}: { plan: Plan; selected: boolean; onSelect: () => void; theme: Theme }) {
  const isAnnual = plan === 'annual';
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={isAnnual ? 'Annual plan, $14.99 per year, save 37%' : 'Monthly plan, $1.99 per month'}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: selected ? theme.surface2 : theme.surface,
        borderRadius: theme.radius,
        borderWidth: 1.5,
        borderColor: selected ? theme.premium : theme.hairline,
        padding: 14,
        opacity: pressed ? 0.8 : 1,
        position: 'relative',
        minHeight: 88,
      })}
    >
      {isAnnual && (
        <View style={{
          position: 'absolute', top: -10, right: 10,
          backgroundColor: theme.premium, borderRadius: 999,
          paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.premiumInk, letterSpacing: 0.06 * 10, textTransform: 'uppercase' }}>
            Save 37%
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 0.1 * 11, textTransform: 'uppercase', marginBottom: 4 }}>
        {isAnnual ? 'Annual' : 'Monthly'}
      </Text>
      <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 24, color: theme.text, letterSpacing: -0.02 * 24, marginTop: 2 }}>
        {PLAN_PRICE[plan]}
      </Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
        {PLAN_PERIOD[plan]}
      </Text>
    </Pressable>
  );
}

export default function UpgradeSheet({ open, context, theme, onClose, onConfirm }: UpgradeSheetProps) {
  const [plan, setPlan] = useState<Plan>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const ctx = CONTEXT_MAP[context] ?? CONTEXT_MAP.feature;

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const rcKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

      if (!rcKey || rcKey === 'your-revenuecat-ios-key') {
        throw new Error('Purchases are not available yet. Please try again later.');
      }

      const Purchases = require('react-native-purchases').default;
      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;
      if (!offering) throw new Error('No subscription offerings available. Please try again later.');

      const pkg = plan === 'annual' ? offering.annual : offering.monthly;
      if (!pkg) throw new Error('Selected plan not available. Please try again later.');

      await Purchases.purchasePackage(pkg);

      // Verify entitlement via RevenueCat — don't trust the client purchase result alone
      const customerInfo = await Purchases.getCustomerInfo();
      const isActive = !!customerInfo.entitlements.active['premium'];

      if (isActive) {
        const store = useAppStore.getState();
        if (store.user) await api.updateUserPremium(store.user.id, true);
        store.setIsPremium(true);
        onConfirm();
      } else {
        throw new Error('Purchase completed but subscription is not yet active. Please restore purchases in a moment.');
      }
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) {
        Alert.alert('Purchase failed', err.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const rcKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
      if (!rcKey || rcKey === 'your-revenuecat-ios-key') {
        Alert.alert('Not available', 'Purchases are not available in this build.');
        return;
      }

      const Purchases = require('react-native-purchases').default;
      const customerInfo = await Purchases.restorePurchases();
      const isActive = !!customerInfo.entitlements.active['premium'];

      if (isActive) {
        const store = useAppStore.getState();
        if (store.user) await api.updateUserPremium(store.user.id, true);
        store.setIsPremium(true);
        Alert.alert('Restored!', 'Your Premium subscription has been restored.');
        onConfirm();
      } else {
        Alert.alert('No active subscription', 'No active Premium subscription was found for this Apple ID.');
      }
    } catch (e: unknown) {
      Alert.alert('Restore failed', (e as Error).message ?? 'Something went wrong.');
    } finally {
      setRestoring(false);
    }
  };

  const planLabel = plan === 'annual' ? 'Trendnable Premium Annual ($14.99 / year)' : 'Trendnable Premium Monthly ($1.99 / month)';

  return (
    <Sheet open={open} onClose={onClose} theme={theme}>
      <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
        {/* Hero icon + title */}
        <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 22 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 18,
            backgroundColor: theme.premium,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#E8A33D', shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3, shadowRadius: 24, elevation: 8,
          }}>
            <Svg width={32} height={32} viewBox="0 0 12 12" fill={theme.premiumInk}>
              <Path d="M6 1.5l1.5 3 3 .4-2.2 2 .6 3.1L6 8.5 3.1 10l.6-3.1L1.5 4.9l3-.4z" />
            </Svg>
          </View>
          <Text style={{
            fontFamily: 'Fraunces_600SemiBold', fontSize: 26,
            color: theme.text, letterSpacing: -0.02 * 26,
            marginTop: 18, lineHeight: 28, textAlign: 'center',
          }}>
            {ctx.title}
          </Text>
          <Text style={{
            fontFamily: 'Inter_400Regular', fontSize: 14.5, color: theme.muted,
            marginTop: 8, maxWidth: 280, lineHeight: 21, textAlign: 'center',
          }}>
            {ctx.sub}
          </Text>
        </View>

        {/* Features checklist */}
        <View style={{
          backgroundColor: theme.surface2, borderRadius: theme.radius,
          padding: 18, marginBottom: 18, gap: 12,
        }}>
          {FEATURES.map((line) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 18, height: 18, borderRadius: 999,
                backgroundColor: theme.premium,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.premiumInk, lineHeight: 12 }}>
                  ✓
                </Text>
              </View>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.text, flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        {/* Plan picker */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <PlanCard plan="monthly" selected={plan === 'monthly'} onSelect={() => setPlan('monthly')} theme={theme} />
          <PlanCard plan="annual"  selected={plan === 'annual'}  onSelect={() => setPlan('annual')}  theme={theme} />
        </View>

        {/* Purchase CTA */}
        <PrimaryButton theme={theme} tone="premium" size="lg" full onPress={handlePurchase} disabled={purchasing || restoring}>
          {purchasing ? 'One moment…' : `Start Premium · ${PLAN_PRICE[plan]} / ${plan === 'annual' ? 'year' : 'month'}`}
        </PrimaryButton>

        {/* Apple-required subscription disclosure */}
        <View style={{ marginTop: 14, gap: 6 }}>
          <Text style={{
            fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint,
            textAlign: 'center', lineHeight: 16,
          }}>
            {planLabel}. Payment will be charged to your Apple ID account at confirmation of purchase.
            Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
            Your account will be charged for renewal within 24 hours prior to the end of the current period.
            Manage and cancel subscriptions in your Account Settings on the App Store after purchase.
          </Text>

          {/* Privacy Policy + Terms links */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            <Pressable onPress={() => Linking.openURL('https://trendnable.app/privacy').catch(() => {})}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.accent }}>Privacy Policy</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://trendnable.app/terms').catch(() => {})}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.accent }}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>

        {/* Restore purchases */}
        <Pressable
          onPress={handleRestore}
          disabled={purchasing || restoring}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          style={({ pressed }) => ({ marginTop: 16, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
            {restoring ? 'Restoring…' : 'Restore purchases'}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
