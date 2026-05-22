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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { callScanPipeline } from '@/lib/api';
import { ScanResult } from '@/lib/types';
import ScanResultSheet from '@/components/ScanResultSheet';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FRAME_SIZE = 240;

const ACCEPTED_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;

type ScanStep = 'reading' | 'identifying' | 'analyzing';

const STEP_LABELS: Record<ScanStep, string> = {
  reading:    'Reading barcode...',
  identifying:'Identifying product...',
  analyzing:  'Analyzing pricing...',
};

export default function ScanScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isDark  = useAppStore((s) => s.isDark);
  const user    = useAppStore((s) => s.user);
  const theme   = buildTheme(isDark);

  const addCatalogToWatchlist   = useAppStore((s) => s.addCatalogToWatchlist);
  const addCatalogToCollection  = useAppStore((s) => s.addCatalogToCollection);
  const isWatchingCatalog       = useAppStore((s) => s.isWatchingCatalog);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]         = useState(false);
  const [step, setStep]                 = useState<ScanStep>('reading');
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null);
  const [sheetOpen, setSheetOpen]       = useState(false);

  const lockRef = useRef(false);

  // Request permission on mount if not yet determined
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const resetScan = () => {
    lockRef.current = false;
    setScanning(false);
    setStep('reading');
  };

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (lockRef.current) return;
    lockRef.current = true;

    const barcode = result.data;
    setScanning(true);
    setStep('reading');

    // Brief pause so "Reading barcode..." is visible
    await new Promise((r) => setTimeout(r, 300));
    setStep('identifying');

    // Start the 1.5s timer for "Analyzing pricing..." independently
    const analyzeTimer = setTimeout(() => setStep('analyzing'), 1500);

    try {
      const { data: { session } } = user ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session?.access_token) {
        clearTimeout(analyzeTimer);
        Alert.alert('Not signed in', 'Please sign in to scan products.');
        resetScan();
        return;
      }

      const data = await callScanPipeline(barcode, session.access_token);
      clearTimeout(analyzeTimer);
      setScanResult(data);
      setScanning(false);
      setSheetOpen(true);
    } catch (err: any) {
      clearTimeout(analyzeTimer);
      setScanning(false);

      const code: string = err?.errorCode ?? '';
      if (code === 'tcg_excluded') {
        Alert.alert(
          'TCG cards excluded',
          "TCG cards can't be scanned — use search instead.",
          [{ text: 'OK', onPress: resetScan }]
        );
      } else if (code === 'not_found') {
        Alert.alert(
          'Not found',
          'No product found for this barcode. Try a different product.',
          [{ text: 'OK', onPress: resetScan }]
        );
      } else {
        Alert.alert(
          'Scan failed',
          err?.message ?? 'Something went wrong. Please try again.',
          [{ text: 'OK', onPress: resetScan }]
        );
      }
    }
  };

  const handleWatch = () => {
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
      Alert.alert('Watchlist full', 'You\'ve reached the free cap of 20 items. Upgrade for unlimited.');
      return;
    }
    setSheetOpen(false);
    Alert.alert(
      'Added to Watchlist',
      `${scanResult.name} is now in your watchlist.`,
      [
        { text: 'Go to Watchlist', onPress: () => router.replace('/(tabs)/watchlist') },
        { text: 'Done', style: 'cancel', onPress: () => router.back() },
      ]
    );
  };

  const handleCollect = () => {
    if (!scanResult) return;
    addCatalogToCollection({
      catalogId:    scanResult.catalogId,
      name:         scanResult.name,
      short:        scanResult.short,
      categoryId:   scanResult.categoryId,
      qty:          1,
      purchased:    scanResult.price.median,
      purchaseDate: new Date().toISOString().split('T')[0],
      condition:    'Good',
      currentPrice: scanResult.price.median,
      imageUrl:     scanResult.imageUrl,
    });
    setSheetOpen(false);
    Alert.alert(
      'Added to Collection',
      `${scanResult.name} is now in your collection.`,
      [
        { text: 'Go to Collection', onPress: () => router.replace('/(tabs)/collection') },
        { text: 'Done', style: 'cancel', onPress: () => router.back() },
      ]
    );
  };

  const handleDiscard = () => {
    setSheetOpen(false);
    setScanResult(null);
    resetScan();
  };

  // ── Permission states ──────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#2563EB" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <Text style={{ color: '#F5F0E4', fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
          Camera access is required to scan products
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={({ pressed }) => ({
            backgroundColor: '#2563EB',
            paddingHorizontal: 28, paddingVertical: 14,
            borderRadius: 14,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: '#FFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ marginTop: 20, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: 'rgba(245,240,228,0.55)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main camera view ───────────────────────────────────────────────────────

  const frameTop  = (SCREEN_H - FRAME_SIZE) / 2 - 30;
  const frameLeft = (SCREEN_W - FRAME_SIZE) / 2;

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      {/* Camera */}
      {!scanning && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ACCEPTED_TYPES as unknown as any[] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      )}

      {/* Dark overlay — four strips around the cutout */}
      {!scanning && (
        <>
          {/* Top strip */}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: frameTop,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }} />
          {/* Bottom strip */}
          <View style={{
            position: 'absolute',
            top: frameTop + FRAME_SIZE,
            left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }} />
          {/* Left strip */}
          <View style={{
            position: 'absolute',
            top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE,
            left: 0, width: frameLeft,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }} />
          {/* Right strip */}
          <View style={{
            position: 'absolute',
            top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE,
            right: 0, width: frameLeft,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }} />

          {/* Corner brackets */}
          {/* Top-left */}
          <View style={{ position: 'absolute', top: frameTop, left: frameLeft }}>
            <View style={{ width: 24, height: 3, backgroundColor: '#2563EB' }} />
            <View style={{ width: 3, height: 24, backgroundColor: '#2563EB' }} />
          </View>
          {/* Top-right */}
          <View style={{ position: 'absolute', top: frameTop, left: frameLeft + FRAME_SIZE - 24 }}>
            <View style={{ width: 24, height: 3, backgroundColor: '#2563EB' }} />
            <View style={{ width: 3, height: 24, backgroundColor: '#2563EB', alignSelf: 'flex-end' }} />
          </View>
          {/* Bottom-left */}
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE - 3, left: frameLeft }}>
            <View style={{ width: 3, height: 24, backgroundColor: '#2563EB', marginTop: -24 + 3 }} />
            <View style={{ width: 24, height: 3, backgroundColor: '#2563EB' }} />
          </View>
          {/* Bottom-right */}
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE - 3, left: frameLeft + FRAME_SIZE - 24 }}>
            <View style={{ width: 3, height: 24, backgroundColor: '#2563EB', marginTop: -24 + 3, alignSelf: 'flex-end' }} />
            <View style={{ width: 24, height: 3, backgroundColor: '#2563EB' }} />
          </View>

          {/* Label below frame */}
          <View style={{
            position: 'absolute',
            top: frameTop + FRAME_SIZE + 20,
            left: 0, right: 0,
            alignItems: 'center',
          }}>
            <Text style={{
              color: 'rgba(245,240,228,0.8)',
              fontFamily: 'Inter_400Regular',
              fontSize: 14,
            }}>
              Align barcode inside the frame
            </Text>
          </View>
        </>
      )}

      {/* Loading overlay */}
      {scanning && (
        <View style={[StyleSheet.absoluteFill, {
          backgroundColor: 'rgba(10,20,38,0.94)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        }]}>
          <View style={{
            backgroundColor: '#0F1A2E',
            borderRadius: 20,
            padding: 32,
            width: '100%',
            alignItems: 'center',
            borderWidth: 0.5,
            borderColor: 'rgba(245,240,228,0.1)',
          }}>
            <ActivityIndicator color="#2563EB" size="large" style={{ marginBottom: 24 }} />

            {(['reading', 'identifying', 'analyzing'] as ScanStep[]).map((s, i) => {
              const steps: ScanStep[] = ['reading', 'identifying', 'analyzing'];
              const currentIdx = steps.indexOf(step);
              const isDone    = i < currentIdx;
              const isActive  = s === step;
              return (
                <View key={s} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 6,
                  opacity: isDone ? 0.5 : isActive ? 1 : 0.28,
                }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: isDone ? '#3DD68C' : isActive ? '#2563EB' : 'rgba(245,240,228,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isDone && (
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#0A1426" strokeWidth={3} strokeLinecap="round">
                        <Path d="M20 6L9 17l-5-5" />
                      </Svg>
                    )}
                    {isActive && (
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />
                    )}
                  </View>
                  <Text style={{
                    color: isActive ? '#F5F0E4' : 'rgba(245,240,228,0.7)',
                    fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    fontSize: 14,
                  }}>
                    {STEP_LABELS[s]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          width: 40, height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
        accessibilityLabel="Go back"
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F5F0E4" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M19 12H5M12 5l-7 7 7 7" />
        </Svg>
      </Pressable>

      {/* Result sheet */}
      <ScanResultSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setScanResult(null); resetScan(); }}
        theme={theme}
        result={scanResult}
        onWatch={handleWatch}
        onCollect={handleCollect}
        onDiscard={handleDiscard}
      />
    </View>
  );
}

// Helper to grab the current Supabase session access token
async function getSession(): Promise<{ access_token: string } | null> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
