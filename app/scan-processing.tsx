/**
 * Scan processing screen — no camera, full async freedom.
 *
 * The camera screen navigated here after capture. With no camera running,
 * setState, timers, and fetch all work normally — no JSI deadlock possible.
 *
 * Flow:
 *   mount → read pendingScan → compress (visual) → call API → show result
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImageManipulator from 'expo-image-manipulator';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import { takePendingScan } from '@/lib/scanHandoff';
import { callScanPipeline, callVisionPipeline, promoteCatalogToSku, fetchSkuById, submitCommunityPrice, ScanError } from '@/lib/api';
import { ScanResult, UpgradeContext, CollectionFormData } from '@/lib/types';
import { catById, fmtPrice } from '@/lib/appConfig';
import { supabase } from '@/lib/supabase';
import UpgradeSheet from '@/components/UpgradeSheet';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanStep = 'reading' | 'identifying' | 'analyzing';
type Phase = 'loading' | 'result' | 'error';

const BARCODE_LABELS: Record<ScanStep, string> = {
  reading:     'Reading barcode...',
  identifying: 'Identifying product...',
  analyzing:   'Analyzing pricing...',
};
const VISION_LABELS: Record<ScanStep, string> = {
  reading:     'Analyzing image...',
  identifying: 'Identifying product...',
  analyzing:   'Fetching pricing...',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function demandLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Very High Demand', color: '#3B82F6' };
  if (score >= 50) return { label: 'High Demand',      color: '#10B981' };
  if (score >= 30) return { label: 'Moderate Demand',  color: '#F59E0B' };
  return              { label: 'Low Demand',          color: '#6B7280' };
}

function forecast(score: number): string {
  if (score >= 75) return 'Hot market — expect a quick sale';
  if (score >= 50) return 'Strong seller\'s market';
  if (score >= 30) return 'Moderate demand, fair sell time expected';
  return 'Soft market — expect a longer sell time';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScanProcessingScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isDark  = useAppStore((s) => s.isDark);
  const user    = useAppStore((s) => s.user);
  const isPremium = useAppStore((s) => s.isPremium);
  const theme   = buildTheme(isDark);

  const addCatalogToWatchlist      = useAppStore((s) => s.addCatalogToWatchlist);
  const addToWatchlist             = useAppStore((s) => s.addToWatchlist);
  const removeCatalogFromWatchlist = useAppStore((s) => s.removeCatalogFromWatchlist);
  const addCatalogToCollection     = useAppStore((s) => s.addCatalogToCollection);
  const completeCatalogMigration   = useAppStore((s) => s.completeCatalogMigration);
  const mergeSkuIntoHot            = useAppStore((s) => s.mergeSkuIntoHot);
  const watchlist                  = useAppStore((s) => s.watchlist);
  const catalogWatchlist           = useAppStore((s) => s.catalogWatchlist);

  const [phase, setPhase]         = useState<Phase>('loading');
  const [step, setStep]           = useState<ScanStep>('reading');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [scanType, setScanType]   = useState<'barcode' | 'visual'>('barcode');
  const [collectOpen, setCollectOpen] = useState(false);
  const [upgradeCtx, setUpgradeCtx]   = useState<UpgradeContext | null>(null);
  const [ppgPrice, setPpgPrice]   = useState('');
  const [showRetail, setShowRetail] = useState(false);
  const [retailPrice, setRetailPrice] = useState('');

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  useEffect(() => {
    const scan = takePendingScan();
    if (!scan) { router.back(); return; }
    setScanType(scan.type);
    runScan(scan);
    return () => clearTimers();
  }, []);

  const runScan = async (scan: { type: 'barcode'; value: string } | { type: 'visual'; photoUri: string }) => {
    // Step timers — safe here, no camera running
    timersRef.current.push(setTimeout(() => setStep('identifying'), scan.type === 'barcode' ? 300 : 600));
    timersRef.current.push(setTimeout(() => setStep('analyzing'),   scan.type === 'barcode' ? 1800 : 2500));

    try {
      const { data: { session } } = user
        ? await supabase.auth.getSession()
        : { data: { session: null } };

      if (!session?.access_token) {
        clearTimers();
        Alert.alert('Not signed in', 'Please sign in to scan products.', [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }

      let result: ScanResult;

      if (scan.type === 'barcode') {
        result = await callScanPipeline(scan.value, session.access_token);
      } else {
        // Compress before sending — keeps payload under 150KB
        const compressed = await ImageManipulator.manipulateAsync(
          scan.photoUri,
          [{ resize: { width: 512 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!compressed.base64) throw new Error('Image compression failed');
        result = await callVisionPipeline(compressed.base64, session.access_token);
      }

      clearTimers();
      setScanResult(result);
      setPhase('result');

    } catch (err: any) {
      clearTimers();
      const code: string = err?.errorCode ?? '';
      if (code === 'quota_exceeded') {
        setUpgradeCtx('scanQuota');
      } else if (code === 'premium_required') {
        setUpgradeCtx('visionScan');
      } else if (code === 'not_found') {
        setErrorMsg(
          scan.type === 'visual'
            ? "Couldn't identify this item. Try a clearer angle showing the front of the packaging."
            : "No product found for this barcode. Try Visual Scan to identify it from the image."
        );
        setPhase('error');
      } else if (code === 'tcg_excluded') {
        setErrorMsg("TCG cards can't be scanned — use the Search tab instead.");
        setPhase('error');
      } else {
        setErrorMsg(err?.message ?? 'Something went wrong. Please try again.');
        setPhase('error');
      }
    }
  };

  // Dismiss all modal screens (scan + scan-processing) then navigate to tabs.
  const exitToTab = (path: string) => {
    router.dismissAll();
    router.replace(path as any);
  };

  const handleWatch = async () => {
    if (!scanResult) return;
    const added = addCatalogToWatchlist({
      catalogId:     scanResult.catalogId,
      name:          scanResult.name,
      short:         scanResult.short,
      categoryId:    scanResult.categoryId,
      fandomId:      scanResult.fandomId,
      price:         scanResult.price.median,
      scoreEstimate: scanResult.scoreEstimate,
      addedAt:       new Date().toISOString(),
      imageUrl:      scanResult.imageUrl,
    });
    if (!added) {
      Alert.alert('Watchlist full', "You've reached the free limit of 20 items. Upgrade to Premium for unlimited.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      submitCommunityPrices(scanResult, session.access_token);
      const promo = await promoteCatalogToSku(scanResult.catalogId, session.access_token);
      const skuId = promo?.skuId ?? scanResult.skuId;
      if (skuId) {
        removeCatalogFromWatchlist(scanResult.catalogId);
        addToWatchlist(skuId);
        fetchSkuById(skuId).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
      }
      Alert.alert('Added to Watchlist', `${scanResult.name} is now being tracked.`, [
        ...(skuId ? [{ text: 'View Item', onPress: () => exitToTab(`/sku/${skuId}`) }] : []),
        { text: 'Go to Watchlist', onPress: () => exitToTab('/(tabs)/watchlist') },
        { text: 'Done', style: 'cancel', onPress: () => router.dismissAll() },
      ]);
    }
  };

  const handleCollect = () => {
    if (!scanResult) return;
    setCollectOpen(true);
  };

  const handleCollectConfirm = async (data: CollectionFormData) => {
    if (!scanResult) return;
    setCollectOpen(false);
    addCatalogToCollection({
      catalogId:    scanResult.catalogId,
      name:         scanResult.name,
      short:        scanResult.short,
      categoryId:   scanResult.categoryId,
      qty:          data.qty,
      purchased:    data.purchased,
      purchaseDate: data.purchaseDate,
      condition:    data.condition,
      currentPrice: scanResult.price.median,
      imageUrl:     scanResult.imageUrl,
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      submitCommunityPrices(scanResult, session.access_token);
      const promo = await promoteCatalogToSku(scanResult.catalogId, session.access_token);
      if (promo?.skuId) {
        completeCatalogMigration(scanResult.catalogId, promo.skuId, {
          qty: data.qty, purchased: data.purchased, purchaseDate: data.purchaseDate, condition: data.condition,
        });
        fetchSkuById(promo.skuId).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
      }
      const skuId = promo?.skuId ?? scanResult.skuId;
      Alert.alert('Added to Collection', `${scanResult.name} is in your collection.`, [
        ...(skuId ? [{ text: 'View Item', onPress: () => exitToTab(`/sku/${skuId}`) }] : []),
        { text: 'Go to Collection', onPress: () => exitToTab('/(tabs)/collection') },
        { text: 'Done', style: 'cancel', onPress: () => router.dismissAll() },
      ]);
    }
  };

  const submitCommunityPrices = (result: ScanResult, token: string) => {
    const ppg     = ppgPrice     ? parseFloat(ppgPrice)     : null;
    const retail  = retailPrice  ? parseFloat(retailPrice)  : null;
    if ((ppg != null || retail != null) && user?.id) {
      submitCommunityPrice({
        catalogId:   result.catalogId,
        ppgPrice:    ppg,
        retailPrice: retail,
        ebayMedian:  result.price.median,
        userId:      user.id,
        accessToken: token,
      }).catch(() => {});
    }
  };

  const handleDiscard = () => router.dismissAll();

  const handleViewDetails = () => {
    if (!scanResult?.skuId) return;
    exitToTab(`/sku/${scanResult.skuId}`);
  };

  const isWatched = scanResult
    ? watchlist.includes(scanResult.skuId ?? '') ||
      catalogWatchlist.some((c) => c.catalogId === scanResult.catalogId)
    : false;

  const stepLabels = scanType === 'visual' ? VISION_LABELS : BARCODE_LABELS;
  const steps: ScanStep[] = ['reading', 'identifying', 'analyzing'];
  const currentStepIdx = steps.indexOf(step);

  // ── Loading phase ─────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <View style={{
          backgroundColor: '#181818', borderRadius: 20, padding: 32,
          width: '100%', alignItems: 'center',
          borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.1)',
        }}>
          <ActivityIndicator color="#FF5500" size="large" style={{ marginBottom: 24 }} />
          {steps.map((s, i) => {
            const isDone   = i < currentStepIdx;
            const isActive = s === step;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: isDone ? 0.5 : isActive ? 1 : 0.28 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: isDone ? '#3DD68C' : isActive ? '#FF5500' : 'rgba(225,228,230,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  {isDone && (
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth={3} strokeLinecap="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {isActive && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ color: isActive ? '#E1E4E6' : 'rgba(225,228,230,0.7)', fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 14 }}>
                  {stepLabels[s]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Error phase ───────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <View style={[styles.fill, { backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </Svg>
        </View>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#E1E4E6', textAlign: 'center', marginBottom: 10 }}>
          Couldn't find a match
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: 'rgba(225,228,230,0.6)', textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
          {errorMsg}
        </Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: '#FF5500', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFF' }}>Try Again</Text>
        </Pressable>

        <UpgradeSheet
          open={upgradeCtx !== null}
          context={upgradeCtx ?? 'scanQuota'}
          theme={buildTheme(isDark)}
          onClose={() => { setUpgradeCtx(null); router.back(); }}
          onConfirm={() => { setUpgradeCtx(null); router.back(); }}
        />
      </View>
    );
  }

  // ── Result phase ──────────────────────────────────────────────────────────

  const result = scanResult!;
  const cat    = catById(result.categoryId);
  const demand = demandLabel(result.sellabilityScore);
  const scorePercent = Math.min(100, Math.max(0, result.sellabilityScore));

  return (
    <View style={[styles.fill, { backgroundColor: '#0D0D0D' }]}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(225,228,230,0.08)',
      }}>
        <View style={{ width: 36 }} />
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: '#E1E4E6' }}>Scan Result</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FF5500' }}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Product header ── */}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 20, marginBottom: 20 }}>
          {result.imageUrl
            ? <Image source={{ uri: result.imageUrl }} style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#1E1E1E' }} />
            : <View style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="rgba(225,228,230,0.25)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 3l-4-4-4 4" />
                </Svg>
              </View>
          }
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#E1E4E6', letterSpacing: -0.3 }} numberOfLines={2}>
              {result.name}
            </Text>
            {result.series && (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(225,228,230,0.6)' }} numberOfLines={1}>
                {result.series}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)' }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#60A5FA', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {cat?.label ?? result.categoryId}
                </Text>
              </View>
              {result.isNewToCatalog && (
                <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(16,185,129,0.5)' }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#10B981', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    New Discovery
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Sellability Score ── */}
        <View style={{ backgroundColor: '#181818', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.08)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: 'rgba(225,228,230,0.5)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Sellability Score
            </Text>
            {!isPremium && (
              <View style={{ backgroundColor: 'rgba(201,157,78,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: '#C99D4E', fontSize: 10 }}>★</Text>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#C99D4E', letterSpacing: 0.5 }}>PREMIUM</Text>
              </View>
            )}
          </View>

          {/* Gradient bar + indicator in one container so the dot sits on the bar */}
          <View style={{ height: 20, justifyContent: 'center', marginBottom: 4 }}>
            <View style={{ height: 10, borderRadius: 5, overflow: 'hidden' }}>
              <LinearGradient colors={['#EF4444', '#F59E0B', '#84CC16', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </View>
            <View style={{
              position: 'absolute',
              left: `${scorePercent}%` as any,
              transform: [{ translateX: -10 }],
              width: 20, height: 20, borderRadius: 10,
              backgroundColor: demand.color,
              borderWidth: 2.5, borderColor: '#181818',
            }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(225,228,230,0.4)' }}>Very Low</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(225,228,230,0.4)' }}>Very High</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 42, color: demand.color, letterSpacing: -1, lineHeight: 46 }}>
              {scorePercent}%
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: 'rgba(225,228,230,0.7)', marginTop: 6, flex: 1, lineHeight: 20 }}>
              likelihood of{'\n'}selling quickly
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(225,228,230,0.5)' }}>
              {result.soldCount > 0 ? `${result.soldCount} sold` : '— sold'} · {result.activeListings} active
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: demand.color }} />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: demand.color }}>{demand.label}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(225,228,230,0.6)' }}>
            Forecast: {forecast(scorePercent)}
          </Text>
        </View>

        {/* ── Hot Score ── */}
        <View style={{ backgroundColor: '#181818', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.08)' }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: 'rgba(225,228,230,0.5)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
            Estimated Hot Score
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <LinearGradient
                colors={['#FF5500', '#F59E0B', '#84CC16']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: `${Math.min(100, result.scoreEstimate)}%`, flex: 1, borderRadius: 4 }}
              />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#FF5500', width: 36, textAlign: 'right' }}>
              {result.scoreEstimate}
            </Text>
          </View>
        </View>

        {/* ── Price card (actual eBay sold data) ── */}
        <View style={{ backgroundColor: '#181818', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.08)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }}>
            {[
              { label: 'Low',    value: result.price.low },
              { label: 'Median', value: result.price.median },
              { label: 'High',   value: result.price.high },
            ].map(({ label, value }) => (
              <View key={label} style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#FF5500', letterSpacing: -0.5 }}>
                  {fmtPrice(value)}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(225,228,230,0.5)', marginTop: 3 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(225,228,230,0.4)', textAlign: 'center' }}>
            {result.soldCount > 0
              ? `Based on ${Math.min(result.soldCount, 50)} recent eBay sales`
              : `${result.activeListings} active listings`
            }
          </Text>
        </View>

        {/* ── Community Data ── */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: 'rgba(225,228,230,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
          Community Data
        </Text>

        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: 'rgba(225,228,230,0.5)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
          PPG Price
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.1)' }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: 'rgba(225,228,230,0.4)', marginRight: 6 }}>$</Text>
          <TextInput
            value={ppgPrice}
            onChangeText={setPpgPrice}
            placeholder="0.00"
            placeholderTextColor="rgba(225,228,230,0.25)"
            keyboardType="decimal-pad"
            style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#E1E4E6' }}
          />
        </View>

        <Pressable onPress={() => setShowRetail(!showRetail)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: showRetail ? 12 : 16 }}>
          <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: showRetail ? '#FF5500' : 'rgba(225,228,230,0.3)', backgroundColor: showRetail ? '#FF5500' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {showRetail && (
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3} strokeLinecap="round">
                <Path d="M20 6L9 17l-5-5" />
              </Svg>
            )}
          </View>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#E1E4E6' }}>I know the retail price</Text>
        </Pressable>

        {showRetail && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.1)' }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: 'rgba(225,228,230,0.4)', marginRight: 6 }}>$</Text>
            <TextInput
              value={retailPrice}
              onChangeText={setRetailPrice}
              placeholder="Retail price"
              placeholderTextColor="rgba(225,228,230,0.25)"
              keyboardType="decimal-pad"
              style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#E1E4E6' }}
            />
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 28 }}>
          <Text style={{ fontSize: 13 }}>⚡</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(225,228,230,0.5)', flex: 1, lineHeight: 18 }}>
            Earn +2 Sparks for each price you share — help the community grow the catalog
          </Text>
        </View>

        {/* ── Action buttons ── */}
        {result.skuId && (
          <Pressable
            onPress={handleViewDetails}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: 'rgba(255,85,0,0.4)', borderRadius: 14,
              paddingVertical: 14, alignItems: 'center', marginBottom: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FF5500' }}>
              View Full Details →
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleWatch}
          disabled={isWatched}
          style={({ pressed }) => ({
            backgroundColor: isWatched ? 'rgba(255,85,0,0.4)' : '#FF5500',
            borderRadius: 14, paddingVertical: 16, flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 10, opacity: pressed ? 0.85 : 1,
          })}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill={isWatched ? 'none' : '#FFF'} stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><Circle cx="12" cy="12" r="3" />
          </Svg>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFF' }}>
            {isWatched ? 'Already Watching' : 'Add to Watchlist'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleCollect}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 14, marginBottom: 16, opacity: pressed ? 0.7 : 1,
          })}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(225,228,230,0.7)" strokeWidth={2} strokeLinecap="round">
            <Path d="M12 5v14M5 12h14" />
          </Svg>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: 'rgba(225,228,230,0.7)' }}>
            Add to Collection
          </Text>
        </Pressable>

        <Pressable onPress={handleDiscard} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(225,228,230,0.35)' }}>
            Not the right product?
          </Text>
        </Pressable>
      </ScrollView>

      <AddToCollectionSheet
        open={collectOpen}
        theme={theme}
        onClose={() => setCollectOpen(false)}
        onConfirm={handleCollectConfirm}
        catalogItem={result ? {
          name:       result.name,
          series:     result.series ?? '',
          imageUrl:   result.imageUrl,
          median:     result.price.median,
          categoryId: result.categoryId,
        } : undefined}
      />

      <UpgradeSheet
        open={upgradeCtx !== null}
        context={upgradeCtx ?? 'scanQuota'}
        theme={theme}
        onClose={() => { setUpgradeCtx(null); router.back(); }}
        onConfirm={() => { setUpgradeCtx(null); router.back(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
