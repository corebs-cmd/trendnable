/**
 * Scan screen — camera only, zero async work, zero setState while camera active.
 *
 * Architecture (VisionCamera v5 + navigate-then-process):
 *   1. Barcode detected via useCodeScanner (AVFoundation, native thread)
 *   2. runOnJS(handleBarcode) dispatches asynchronously to JS — no mutex held
 *   3. setPendingScan() writes to module-level var (no Fabric commit)
 *   4. router.push('/scan-processing') → camera unmounts
 *   5. All async work (session, API, setState) happens on the processing screen
 *
 * Installation required before first build:
 *   npx expo install react-native-vision-camera react-native-nitro-modules react-native-nitro-image
 *   npx expo prebuild --clean && cd ios && pod install
 *
 * Add to app.json plugins:
 *   ["react-native-vision-camera", { "cameraPermissionText": "Trendnable uses your camera to scan collectibles." }]
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Linking,
  StyleSheet,
  Dimensions,
} from 'react-native';
// @ts-ignore — react-native-vision-camera must be installed before types resolve
// Run: npx expo install react-native-vision-camera react-native-nitro-modules react-native-nitro-image
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import { setPendingScan } from '@/lib/scanHandoff';
import UpgradeSheet from '@/components/UpgradeSheet';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FRAME_SIZE = 240;

type ScanMode = 'barcode' | 'visual';

export default function ScanScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const isDark   = useAppStore((s) => s.isDark);
  const isPremium = useAppStore((s) => s.isPremium);
  const theme    = buildTheme(isDark);
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();

  const [scanMode, setScanMode] = useState<ScanMode>(
    modeParam === 'visual' ? 'visual' : 'barcode'
  );
  const [upgradeCtx, setUpgradeCtx] = useState<'visionScan' | null>(null);

  const lockedRef = useRef(false);
  const cameraRef = useRef<Camera>(null);

  // Reset the lock every time this screen gains focus. When the user returns
  // from scan-processing via "Done", back, or an error alert dismissal, the
  // ref is still true from the previous scan — silently blocking all new taps.
  useFocusEffect(
    useCallback(() => {
      lockedRef.current = false;
    }, [])
  );

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  useEffect(() => {
    if (modeParam === 'visual' && !isPremium) {
      setScanMode('barcode');
      setUpgradeCtx('visionScan');
    }
  }, []);

  // ── Barcode ───────────────────────────────────────────────────────────────
  // Called via runOnJS — arrives on JS thread asynchronously, no mutex held.
  const handleBarcode = useCallback((value: string) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setPendingScan({ type: 'barcode', value });
    router.push('/scan-processing');
  }, [router]);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39'],
    onCodeScanned: (codes: any[]) => {
      'worklet';
      if (codes.length > 0 && codes[0].value) {
        runOnJS(handleBarcode)(codes[0].value);
      }
    },
  });

  // ── Visual capture ────────────────────────────────────────────────────────
  const handleVisualCapture = useCallback(async () => {
    if (lockedRef.current || !cameraRef.current) return;
    lockedRef.current = true;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      if (!photo?.path) { lockedRef.current = false; return; }
      // photo.path is an absolute path without file:// prefix
      setPendingScan({ type: 'visual', photoUri: `file://${photo.path}` });
      router.push('/scan-processing');
    } catch {
      lockedRef.current = false;
    }
  }, [router]);

  const handleModeToggle = (mode: ScanMode) => {
    if (mode === 'visual' && !isPremium) {
      setUpgradeCtx('visionScan');
      return;
    }
    lockedRef.current = false;
    setScanMode(mode);
  };

  // ── Permission gate ───────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <Text style={{ color: '#E1E4E6', fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
          Camera access is required to scan products
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={{ backgroundColor: '#FF5500', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}
        >
          <Text style={{ color: '#FFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Open Settings</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: 'rgba(225,228,230,0.55)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return <View style={[styles.fill, { backgroundColor: '#000' }]} />;
  }

  const frameTop  = (SCREEN_H - FRAME_SIZE) / 2 - 30;
  const frameLeft = (SCREEN_W - FRAME_SIZE) / 2;

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!lockedRef.current}
        codeScanner={scanMode === 'barcode' ? codeScanner : undefined}
        photo={scanMode === 'visual'}
      />

      {/* ── Barcode viewfinder overlay ── */}
      {scanMode === 'barcode' && (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: frameTop, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE, left: 0, width: frameLeft, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          <View style={{ position: 'absolute', top: frameTop, bottom: SCREEN_H - frameTop - FRAME_SIZE, right: 0, width: frameLeft, backgroundColor: 'rgba(0,0,0,0.62)' }} />
          {/* Corner brackets */}
          {[
            { top: frameTop,                    left: frameLeft },
            { top: frameTop,                    left: frameLeft + FRAME_SIZE - 24 },
            { top: frameTop + FRAME_SIZE - 3,   left: frameLeft },
            { top: frameTop + FRAME_SIZE - 3,   left: frameLeft + FRAME_SIZE - 24 },
          ].map((pos, idx) => (
            <View key={idx} style={{ position: 'absolute', ...pos }}>
              {idx < 2
                ? <><View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} /><View style={{ width: 3, height: 24, backgroundColor: '#FF5500', alignSelf: idx % 2 === 1 ? 'flex-end' : undefined }} /></>
                : <><View style={{ width: 3, height: 24, backgroundColor: '#FF5500', marginTop: -21, alignSelf: idx % 2 === 1 ? 'flex-end' : undefined }} /><View style={{ width: 24, height: 3, backgroundColor: '#FF5500' }} /></>
              }
            </View>
          ))}
          <View style={{ position: 'absolute', top: frameTop + FRAME_SIZE + 20, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(225,228,230,0.8)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>
              Align barcode inside the frame
            </Text>
          </View>
        </>
      )}

      {/* ── Visual mode overlay ── */}
      {scanMode === 'visual' && (
        <>
          <View style={{ position: 'absolute', bottom: insets.bottom + 130, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(225,228,230,0.85)', fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
              Point at the front of the collectable
            </Text>
            <Text style={{ color: 'rgba(225,228,230,0.50)', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }}>
              Box, figure, or card — fill the frame
            </Text>
          </View>
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

      {/* ── Mode toggle ── */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' }}>
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 3, borderWidth: 0.5, borderColor: 'rgba(225,228,230,0.15)' }}>
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
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: scanMode === 'barcode' ? '#FFF' : 'rgba(225,228,230,0.65)' }}>
              Scan Barcode
            </Text>
          </Pressable>

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
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: scanMode === 'visual' ? '#FFF' : 'rgba(225,228,230,0.65)' }}>
              Visual Scan
            </Text>
            {!isPremium && (
              <View style={{ backgroundColor: 'rgba(241,194,76,0.25)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: '#f1c24c', letterSpacing: 0.3 }}>★ PRO</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <UpgradeSheet
        open={upgradeCtx !== null}
        context={upgradeCtx ?? 'visionScan'}
        theme={theme}
        onClose={() => { setUpgradeCtx(null); lockedRef.current = false; }}
        onConfirm={() => { setUpgradeCtx(null); lockedRef.current = false; }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
