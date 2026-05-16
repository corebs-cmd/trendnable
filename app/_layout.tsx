import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../stores/appStore';
import { supabase } from '../lib/supabase';
import * as api from '../lib/api';

export default function RootLayout() {
  const isDark = useAppStore((s) => s.isDark);
  const initialized = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    Fraunces_400Regular_Italic,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    if (initialized.current) return;
    initialized.current = true;

    const store = useAppStore.getState();

    (async () => {
      // Restore persisted dark mode
      const storedDark = await AsyncStorage.getItem('isDark');
      if (storedDark !== null) store.setIsDark(JSON.parse(storedDark));

      // Init RevenueCat if a real key is configured
      const rcKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
      if (rcKey && rcKey !== 'your-revenuecat-ios-key') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Purchases = require('react-native-purchases').default;
          Purchases.configure({ apiKey: rcKey });
        } catch (e) {
          console.warn('RevenueCat init failed:', e);
        }
      }

      // Load hot SKUs — no auth needed, available to all users
      store.loadHotSkus().catch(console.error);

      // Restore Supabase session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        let profile = await api.fetchUserProfile(session.user.id);
        if (!profile) {
          profile = await api.createUserProfile(
            session.user.id,
            session.user.email ?? '',
            null
          );
        }

        if (profile) {
          store.setUser(profile);
          store.setIsPremium(profile.is_premium);
          store.setFollowedFandoms(profile.followed_fandoms);
          store.setFollowedCategories(profile.followed_categories);
          await store.loadUserData(session.user.id);
        }

        store.setIsAuthReady(true);

        const savedOnboarded = await AsyncStorage.getItem('hasOnboarded');
        if (!savedOnboarded || savedOnboarded === 'false') {
          router.replace('/onboarding');
        }
        // else: stay on (tabs) — that's the default Stack entry
      } else {
        store.setIsAuthReady(true);
        router.replace('/auth');
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        const s = useAppStore.getState();
        s.setUser(null);
        s.setIsPremium(false);
        router.replace('/auth');
      }
    });

    // Refresh SKU catalog whenever the app returns to the foreground
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        useAppStore.getState().loadHotSkus().catch(console.error);
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
        <Stack.Screen
          name="sku/[id]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
