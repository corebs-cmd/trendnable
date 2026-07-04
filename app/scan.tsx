import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';

import * as ImageManipulator from 'expo-image-manipulator';

import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { callScanPipeline, callVisionPipeline, promoteCatalogToSku, fetchSkuById, submitCommunityPrice } from '@/lib/api';
import { ScanResult, UpgradeContext, CollectionFormData } from '@/lib/types';
import ScanResultSheet from '@/components/ScanResultSheet';
import UpgradeSheet from '@/components/UpgradeSheet';
import AddToCollectionSheet from '@/components/AddToCollectionSheet';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FRAME_SIZE = 240;

const ACCEPTED_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;

type ScanStep = 'reading' | 'identifying' | 'analyzing';
type ScanMode = 'barcode' | 'visual';

const BARCODE_STEP_LABELS: Record<ScanStep, string> = {
  reading:     'Reading barcode...',
  identifying: 'Identifying product...',
  analyzing:   'Analyzing pricing...',
};

const VISION_STEP_LABELS: Record<ScanStep, string> = {
  reading:     'Analyzing image...',
  identifying: 'Identifying product...',
  analyzing:   'Fetching pricing...',
};

export default function ScanScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const isDark    = useAppStore((s) => s.isDark);
  const user      = useAppStore((s) => s.user);
  const isPremium = useAppStore((s) => s.isPremium);
  const theme     = buildTheme(isDark);

  const addCatalogToWatchlist      = useAppStore((s) => s.addCatalogToWatchlist);
  const addToWatchlist             = useAppStore((s) => s.addToWatchlist);
  const removeCatalogFromWatchlist = useAppStore((s) => s.removeCatalogFromWatchlist);
  const addCatalogToCollection     = useAppStore((s) => s.addCatalogToCollection);
  const completeCatalogMigration   = useAppStore((s) => s.completeCatalogMigration);
  const mergeSkuIntoHot            = useAppStore((s) => s.mergeSkuIntoHot);
  const scanQuota                  = useAppStore((s) => s.scanQuota);
  const loadScanQuota              = useAppStore((s) => s.loadScanQuota);
  const incrementScanLocal         = useAppStore((s) => s.incrementScanLocal);

  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanMode, setScanMode]         = useState<ScanMode>(modeParam === 'visual' ? 'visual' : 'barcode');
  const [scanning, setScanning]         = useState(false);
  const [step, setStep]                 = useState<ScanStep>('reading');
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null);
  const [sheetOpen, setSheetOpen]           = useState(false);
  const [collectSheetOpen, setCollectSheetOpen] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [communityData, setCommunityData]   = useState<{ ppgPrice: number | null; retailPrice: number | null } | null>(null);

  const lockRef   = useRef(false);
  const cameraRef = useRef<CameraView>(null);

  // Pending work is stored here by the handler and consumed by the useEffect
  // that fires AFTER Fabric commits scanning=true. This is the fix for the
  // Fabric deadlock: any await inside the handler after setScanning(true) never
  // resumes because the JS event loop is blocked by the UIKit commit waiting for
  // the main thread. useEffect runs after the commit, so the event loop is free.
  const pendingWork = useRef<
    | { type: 'visual'; base64: string; token: string }
    | { type: 'barcode'; barcode: string; token: string }
    | null
  >(null);

  const dbgRef = useRef<string[]>([]);
  const [, dbgTick] = useState(0);
  const dbg = (msg: string) => {
    const ts = new Date().toISOString().slice(14, 23);
    dbgRef.current = [`${ts} ${msg}`, ...dbgRef.current].slice(0, 8);
    dbgTick((n) => n + 1);
    console.log('[SCAN]', ts, msg);
  };

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    if (user?.id) loadScanQuota(user.id).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (modeParam === 'visual' && !isPremium) {
      setScanMode('barcode');
      setUpgradeContext('visionScan');
    }
  }, []);

  const remainingScans = scanQuota ? Math.max(0, scanQuota.limit - scanQuota.used) : null;
  const quotaExhausted = !isPremium && remainingScans === 0;

  const stepLabels = scanMode === 'visual' ? VISION_STEP_LABELS : BARCODE_STEP_LABELS;

  const resetScan = () => {
    pendingWork.current = null;
    lockRef.current = false;
    setScanning(false);
    setStep('reading');
  };

  // ── Scan executor — runs AFTER Fabric commits scanning=true ──────────────────
  // useEffect fires after the commit phase, guaranteeing the JS event loop is
  // free. Timers, Promise callbacks, and fetch responses all work normally here.
  useEffect(() => {
    if (!scanning || !pendingWork.current) return;

    const work = pendingWork.current;
    pendingWork.current = null;

    const isBarcode = work.type === 'barcode';
    const identTimer  = setTimeout(() => setStep('identifying'), isBarcode ? 300 : 500);
    const analyzeTimer = setTimeout(() => setStep('analyzing'),   isBarcode ? 1800 : 2000);
    dbg('EFF api call type=' + work.type);

    const apiCall = isBarcode
      ? callScanPipeline((work as any).barcode, work.token)
      : callVisionPipeline((work as any).base64, work.token);

    apiCall
      .then((data) => {
        clearTimeout(identTimer);
        clearTimeout(analyzeTimer);
        dbg('EFF api done name=' + data.name.slice(0, 20));
        if (!isPremium && isBarcode) incrementScanLocal();
        setScanResult(data);
        // Open result sheet WITHOUT calling setScanning(false) here.
        // Reactivating the camera (active=true) in the same Fabric commit as
        // opening the sheet can cause another main-thread block. The sheet is
        // a Modal that renders on top; the overlay behind it is invisible.
        // Camera resumes only when the sheet is dismissed via resetScan().
        setSheetOpen(true);
      })
      .catch((err: any) => {
        clearTimeout(identTimer);
        clearTimeout(analyzeTimer);
        setScanning(false);
        dbg('EFF err=' + (err?.errorCode ?? err?.message ?? 'unknown'));

        const code: string = err?.errorCode ?? '';
        if (code === 'quota_exceeded') {
          if (isBarcode && user?.id) loadScanQuota(user.id).catch(() => {});
          setUpgradeContext('scanQuota');
          lockRef.current = false;
        } else if (code === 'tcg_excluded') {
          Alert.alert('TCG cards excluded', "TCG cards can't be scanned — use search instead.", [{ text: 'OK', onPress: resetScan }]);
        } else if (code === 'not_found') {
          if (isBarcode) {
            Alert.alert(
              'No barcode match',
              "We couldn't find this barcode. Try Visual Scan — point your camera at the item and we'll identify it from the image.",
              [
                { text: 'Try Visual Scan', onPress: () => { resetScan(); if (isPremium) setScanMode('visual'); else setUpgradeContext('visionScan'); } },
                { text: 'Dismiss', style: 'cancel', onPress: resetScan },
              ]
            );
          } else {
            Alert.alert("Couldn't identify item", "Try a clearer angle showing the front of the box or figure. Make sure the item fills the frame.", [{ text: 'Try Again', onPress: resetScan }]);
          }
        } else if (code === 'premium_required') {
          setUpgradeContext('visionScan');
          lockRef.current = false;
        } else if (code === 'timeout') {
          Alert.alert('Taking too long', 'The server is busy. Please try again in a moment.', [{ text: 'OK', onPress: resetScan }]);
        } else {
          Alert.alert('Scan failed', err?.message ?? 'Something went wrong. Please try again.', [{ text: 'OK', onPress: resetScan }]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const handleModeToggle = (mode: ScanMode) => {
    if (mode === 'visual' && !isPremium) {
      setUpgradeContext('visionScan');
      return;
    }
    setScanMode(mode);
  };

  // ── Barcode scan ─────────────────────────────────────────────────────────────
  // Handler only prepares data and sets scanning=true. All async work (API call,
  // timers, error handling) runs in the useEffect above, which fires after Fabric
  // commits the loading overlay — guaranteeing the JS event loop is unblocked.

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (lockRef.current || scanMode !== 'barcode') return;
    lockRef.current = true;
    dbg('B1 barcode=' + result.data.slice(0, 12));

    if (quotaExhausted) {
      setUpgradeContext('scanQuota');
      lockRef.current = false;
      return;
    }

    const { data: { session } } = user ? await supabase.auth.getSession() : { data: { session: null } };
    dbg('B2 session ok=' + !!session?.access_token);
    if (!session?.access_token) {
      Alert.alert('Not signed in', 'Please sign in to scan products.');
      lockRef.current = false;
      return;
    }

    pendingWork.current = { type: 'barcode', barcode: result.data, token: session.access_token };
    setScanning(true);
    setStep('reading');
    dbg('B3 scanning=true → effect will run after commit');
  };

  // ── Visual scan ──────────────────────────────────────────────────────────────

  const handleVisualCapture = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    dbg('1 tap');

    try {
      dbg('2 takePic start');
      const photo = await cameraRef.current?.takePictureAsync({
        base64: true,
        quality: 0.7,
        exif: false,
      });
      dbg('3 takePic done b64=' + (photo?.base64?.length ?? 0));

      if (!photo?.base64 || !photo?.uri) {
        lockRef.current = false;
        return;
      }

      dbg('4 compress start');
      const compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 512 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      dbg('5 compress done b64=' + (compressed.base64?.length ?? 0));

      if (!compressed.base64) {
        lockRef.current = false;
        return;
      }

      const { data: { session } } = user ? await supabase.auth.getSession() : { data: { session: null } };
      dbg('6 session ok=' + !!session?.access_token);
      if (!session?.access_token) {
        Alert.alert('Not signed in', 'Please sign in to use Visual Scan.');
        lockRef.current = false;
        return;
      }

      pendingWork.current = { type: 'visual', base64: compressed.base64, token: session.access_token };
      setScanning(true);
      setStep('reading');
      dbg('7 scanning=true → effect will run after commit');

    } catch {
      lockRef.current = false;
    }
  };

  // ── Action handlers (shared with both modes) ─────────────────────────────────

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
      Alert.alert('Watchlist full', "You've reached the free cap of 20 items. Unlock unlimited with Premium.");
      return;
    }
    setSheetOpen(false);

    const { data: { session } } = await supabase.auth.getSession();

    // Submit community prices if provided
    if (communityData && (communityData.ppgPrice != null || communityData.retailPrice != null)) {
      if (session?.access_token && user?.id) {
        submitCommunityPrice({
          catalogId:   scanResult.catalogId,
          ppgPrice:    communityData.ppgPrice,
          retailPrice: communityData.retailPrice,
          ebayMedian:  scanResult.price.median,
          userId:      user.id,
          accessToken: session.access_token,
        }).then(({ awarded }) => {
          if (awarded > 0) {
            // TODO: useAppStore.getState().addRewardUnits(awarded);
          }
        }).catch(() => {});
      }
    }
    const promotion = session?.access_token
      ? await promoteCatalogToSku(scanResult.catalogId, session.access_token)
      : null;
    const skuId = promotion?.skuId ?? scanResult.skuId;

    // Migrate from catalog watchlist to SKU watchlist now that we have a skuId
    if (skuId) {
      removeCatalogFromWatchlist(scanResult.catalogId);
      addToWatchlist(skuId);
      // Fetch the promoted SKU so it appears in Movers immediately (is_active=false skips v_hot_skus)
      fetchSkuById(skuId).then((sku) => { if (sku) mergeSkuIntoHot(sku); }).catch(() => {});
    }

    Alert.alert(
      'Added to Watchlist',
      `${scanResult.name} is now in your watchlist.`,
      [
        ...(skuId ? [{ text: 'View Item', onPress: () => router.replace(`/sku/${skuId}` as any) }] : []),
        { text: 'Go to Watchlist', onPress: () => router.replace('/(tabs)/watchlist') },
        { text: 'Done', style: 'cancel', onPress: () => router.back() },
      ]
    );
  };

  const handleCollect = () => {
    if (!scanResult) return;
    // Close ScanResultSheet first — two simultaneous RN Modals won't stack on iOS
    setSheetOpen(false);
    setCollectSheetOpen(true);
  };

  const handleRetry = () => {
    setSheetOpen(false);
    setScanResult(null);
    resetScan();
  };

  const handleTryVisual = () => {
    setSheetOpen(false);
    setScanResult(null);
    if (isPremium) {
      setScanMode('visual');
      resetScan();
    } else {
      setUpgradeContext('visionScan');
    }
  };

  const handleCollectConfirm = async (data: CollectionFormData) => {
    if (!scanResult) return;
    setCollectSheetOpen(false);

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
    setSheetOpen(false);

    const { data: { session } } = await supabase.auth.getSession();

    // Submit community prices if provided
    if (communityData && (communityData.ppgPrice != null || communityData.retailPrice != null)) {
      if (session?.access_token && user?.id) {
        submitCommunityPrice({
          catalogId:   scanResult.catalogId,
          ppgPrice:    communityData.ppgPrice,
          retailPrice: communityData.retailPrice,
          ebayMedian:  scanResult.price.median,
          userId:      user.id,
          accessToken: session.access_token,
        }).then(({ awarded }) => {
          if (awarded > 0) {
            // TODO: useAppStore.getState().addRewardUnits(awarded);
          }
        }).catch(() => {});
      }
    }

    const promotion = session?.access_token
      ? await promoteCatalogToSku(scanResult.catalogId, session.access_token)
      : null;
    const skuId = promotion?.skuId ?? scanResult.skuId;

    if (promotion?.skuId) {
      completeCatalogMigration(scanResult.catalogId, promotion.skuId, {
        qty:          data.qty,
        purchased:    data.purchased,
        purchaseDate: data.purchaseDate,
        condition:    data.condition,
      });
      // Ensure the promoted SKU is available locally so the collection page can render it
      fetchSkuById(promotion.skuId).then((sku) => {
        if (sku) mergeSkuIntoHot(sku);
      }).catch(() => {});
    }

    Alert.alert(
      'Added to Collection',
      `${scanResult.name} is now in your collection.`,
      [
        ...(skuId ? [{ text: 'View Item', onPress: () => router.replace(`/sku/${skuId}` as any) }] : []),
        { text: 'Go to Collection', onPress: () => router.replace('/(tabs)/collection') },
        { text: 'Done', style: 'cancel', onPress: () => router.back() },
      ]
    );
  };

  const handleDiscard = () => {
    // Promote to SKU in the background if the item passed the quality gate —
    // grows the catalog even when the user doesn't keep the item.
    if (scanResult?.qualityGatePassed && scanResult.price.median > 0) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          promoteCatalogToSku(scanResult.catalogId, session.access_token).catch(() => {});
        }
      });
    }
    setSheetOpen(false);
    setScanResult(null);
    resetScan();
  };

  // ── Permission states ────────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#FF5500" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <Text style={{ color: '#E1E4E6', fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
          Camera access is required to scan products
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={({ pressed }) => ({ backgroundColor: '#FF5500', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, opacity: pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: '#FFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ marginTop: 20, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: 'rgba(225,228,230,0.55)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main camera view ─────────────────────────────────────────────────────────

  const frameTop  = (SCREEN_H - FRAME_SIZE) / 2 - 30;
  const frameLeft = (SCREEN_W - FRAME_SIZE) / 2;

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>

      {/* Camera — always mounted, paused during scanning.
          active=false suspends the camera session without teardown, freeing the
          iOS main thread so Fabric can commit the loading overlay uncontested. */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={!scanning}
        {...(scanMode === 'barcode' && !scanning ? {
          barcodeScannerSettings: { barcodeTypes: ACCEPTED_TYPES as unknown as any[] },
          onBarcodeScanned: handleBarcodeScanned,
        } : {})}
      />

      {/* ── Barcode mode overlay ── */}
      {scanMode === 'barcode' && !scanning && (
        <>
          {/* Dark strips around cutout */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: frameTop, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE, left: 0, width: frameLeft, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE, right: 0, width: frameLeft, backgroundColor: 'rgba(0,0,0,0.62)' }} />

          {/* Corner brackets */}
          <View style={{ position: 'absolute', top: frameTop, left: frameLeft }}>
            <View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} />
            <View style={{ width: 3, height: 24, backgroundColor: '#FF5500' }} />
          </View>
          <View style={{ position: 'absolute', top: frameTop, left: frameLeft + FRAME_SIZE - 24 }}>
            <View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} />
            <View style={{ width: 3, height: 24, backgroundColor: '#FF5500', alignSelf: 'flex-end' }} />
          </View>
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE - 3, left: frameLeft }}>
            <View style={{ width: 3, height: 24, backgroundColor: '#FF5500', marginTop: -24 + 3 }} />
            <View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} />
          </View>
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE - 3, left: frameLeft + FRAME_SIZE - 24 }}>
            <View style={{ width: 3, height: 24, backgroundColor: '#FF5500', marginTop: -24 + 3, alignSelf: 'flex-end' }} />
            <View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} />
          </View>

          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE + 20, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(225,228,230,0.8)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>
              Align barcode inside the frame
            </Text>
          </View>
        </>
      )}

      {/* ── Visual mode overlay ── */}
      {scanMode === 'visual' && !scanning && (
        <>
          {/* Subtle corner guides to indicate full-frame capture */}
          {[
            { top: frameTop - 20, left: frameLeft - 20 },
            { top: frameTop - 20, left: frameLeft + FRAME_SIZE - 4 },
          ].map((_, i) => null) /* placeholder — just use the capture button */}

          {/* Hint label above capture button */}
          <View style={{ position: 'absolute', bottom: insets.bottom + 130, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(225,228,230,0.85)', fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
              Point at the front of the collectable
            </Text>
            <Text style={{ color: 'rgba(225,228,230,0.50)', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }}>
              Box, figure, or card — fill the frame
            </Text>
          </View>

          {/* Capture button */}
          <Pressable
            onPress={handleVisualCapture}
            accessibilityLabel="Capture photo to identify"
            style={({ pressed }) => ({
              position: 'absolute',
              bottom: insets.bottom + 44,
              alignSelf: 'center',
              width: 74, height: 74, borderRadius: 37,
              backgroundColor: '#FF5500',
              borderWidth: 4, borderColor: 'rgba(255,255,255,0.85)',
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <Circle cx="12" cy="13" r="4" />
            </Svg>
          </Pressable>
        </>
      )}

      {/* ── Loading overlay — always mounted, opacity-driven.
          Conditional rendering adds ~10 native views in one Fabric commit,
          which blocks the JS event loop waiting for main-thread UIKit layout.
          Pre-mounting and toggling opacity is a trivial property update that
          completes between camera frames. ── */}
      <View
        pointerEvents={scanning ? 'box-none' : 'none'}
        style={[StyleSheet.absoluteFill, {
          backgroundColor: 'rgba(13,13,13,0.94)',
          alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
          opacity: scanning ? 1 : 0,
        }]}
      >
        <View style={{
          backgroundColor: '#181818', borderRadius: 20, padding: 32,
          width: '100%', alignItems: 'center',
          borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.1)',
        }}>
          <ActivityIndicator color="#FF5500" size="large" style={{ marginBottom: 24 }} />
          {(['reading', 'identifying', 'analyzing'] as ScanStep[]).map((s, i) => {
            const steps: ScanStep[] = ['reading', 'identifying', 'analyzing'];
            const currentIdx = steps.indexOf(step);
            const isDone   = i < currentIdx;
            const isActive = s === step;
            return (
              <View key={s} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6,
                opacity: isDone ? 0.5 : isActive ? 1 : 0.28,
              }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: isDone ? '#3DD68C' : isActive ? '#FF5500' : 'rgba(225,228,230,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isDone && (
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth={3} strokeLinecap="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {isActive && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{
                  color: isActive ? '#E1E4E6' : 'rgba(225,228,230,0.7)',
                  fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
                  fontSize: 14,
                }}>
                  {stepLabels[s]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Debug panel ── */}
      {dbgRef.current.length > 0 && (
        <View pointerEvents="none" style={{
          position: 'absolute', top: insets.top + 60, left: 8, right: 8,
          padding: 8, backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: 6,
        }}>
          {dbgRef.current.map((line, i) => (
            <Text key={i} style={{ color: '#0F0', fontFamily: 'Menlo', fontSize: 10 }}>{line}</Text>
          ))}
        </View>
      )}

      {/* ── Back button ── */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          position: 'absolute', top: insets.top + 8, left: 16,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center', justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
        accessibilityLabel="Go back"
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#E1E4E6" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M19 12H5M12 5l-7 7 7 7" />
        </Svg>
      </Pressable>

      {/* ── Mode toggle pill ── */}
      {!scanning && (
        <View style={{
          position: 'absolute', top: insets.top + 8, left: 0, right: 0,
          alignItems: 'center', pointerEvents: 'box-none',
        }}>
          <View style={{
            flexDirection: 'row',
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderRadius: 999, padding: 3,
            borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.15)',
          }}>
            {/* Barcode tab */}
            <Pressable
              onPress={() => handleModeToggle('barcode')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                backgroundColor: scanMode === 'barcode' ? '#FF5500' : 'transparent',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={scanMode === 'barcode' ? '#FFF' : 'rgba(225,228,230,0.65)'} strokeWidth={2} strokeLinecap="round">
                <Path d="M3 5h2M7 5h1M11 5h1M3 19h2M7 19h1M11 19h1M3 9v6M7 9v2M7 15v1M11 9v6M15 5h1M19 5h2M15 19h1M19 19h2M15 9v2M15 15v1M19 9v6" />
              </Svg>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 13,
                color: scanMode === 'barcode' ? '#FFF' : 'rgba(225,228,230,0.65)',
              }}>
                Scan Barcode
              </Text>
            </Pressable>

            {/* Visual tab */}
            <Pressable
              onPress={() => handleModeToggle('visual')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                backgroundColor: scanMode === 'visual' ? '#FF5500' : 'transparent',
                opacity: pressed ? 0.8 : (isPremium ? 1 : 0.55),
              })}
            >
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={scanMode === 'visual' ? '#FFF' : 'rgba(225,228,230,0.65)'} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Circle cx="12" cy="13" r="4" />
              </Svg>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 13,
                color: scanMode === 'visual' ? '#FFF' : 'rgba(225,228,230,0.65)',
              }}>
                Visual Scan
              </Text>
              {!isPremium && (
                <View style={{
                  backgroundColor: 'rgba(241,194,76,0.25)',
                  borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
                }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: '#f1c24c', letterSpacing: 0.3 }}>★ PRO</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Barcode scan quota chip (free users, barcode mode only) ── */}
      {!isPremium && scanMode === 'barcode' && remainingScans !== null && !scanning && (
        <View style={{
          position: 'absolute', top: insets.top + 58, left: 0, right: 0,
          alignItems: 'center', pointerEvents: 'box-none',
        }}>
          <Pressable
            onPress={() => quotaExhausted ? setUpgradeContext('scanQuota') : null}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
              backgroundColor: quotaExhausted ? 'rgba(244,63,94,0.18)' : 'rgba(0,0,0,0.45)',
              borderWidth: 1,
              borderColor: quotaExhausted ? 'rgba(251,113,133,0.4)' : 'rgba(225,228,230,0.12)',
              opacity: pressed && quotaExhausted ? 0.7 : 1,
            })}
          >
            <Text style={{
              color: quotaExhausted ? '#fb7185' : '#E1E4E6',
              fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.3,
            }}>
              {quotaExhausted ? 'No scans left · Unlock' : `${remainingScans} scan${remainingScans === 1 ? '' : 's'} left today`}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Result sheet ── */}
      <ScanResultSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setScanResult(null); resetScan(); }}
        theme={theme}
        result={scanResult}
        isPremium={isPremium}
        onUnlockSellability={() => { setSheetOpen(false); setTimeout(() => setUpgradeContext('sellability'), 300); }}
        onWatch={handleWatch}
        onCollect={handleCollect}
        onDiscard={handleDiscard}
        onCommunityData={(data) => setCommunityData(data)}
        scanMode={scanMode}
        onRetry={handleRetry}
        onTryVisual={handleTryVisual}
      />

      <AddToCollectionSheet
        open={collectSheetOpen}
        theme={theme}
        onClose={() => setCollectSheetOpen(false)}
        onConfirm={handleCollectConfirm}
        catalogItem={scanResult ? {
          name:       scanResult.name,
          series:     scanResult.series ?? '',
          imageUrl:   scanResult.imageUrl,
          median:     scanResult.price.median,
          categoryId: scanResult.categoryId,
        } : undefined}
      />

      <UpgradeSheet
        open={upgradeContext !== null}
        context={upgradeContext ?? 'sellability'}
        theme={theme}
        onClose={() => { setUpgradeContext(null); resetScan(); }}
        onConfirm={() => { setUpgradeContext(null); resetScan(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
