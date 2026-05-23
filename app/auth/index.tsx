import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../../stores/appStore';
import { buildTheme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import * as api from '../../lib/api';

type Mode = 'login' | 'signup';

function mapAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please check your inbox and confirm your email first.';
  if (/user already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/password should be at least/i.test(msg)) return 'Password must be at least 6 characters.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a moment and try again.';
  if (/network request failed/i.test(msg)) return 'No internet connection. Check your network and try again.';
  return msg;
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const theme = buildTheme(isDark);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const store = useAppStore.getState();

      if (mode === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;

        let profile = await api.fetchUserProfile(data.user.id);
        if (!profile) {
          profile = await api.createUserProfile(data.user.id, email.trim(), null);
        }

        if (profile) {
          store.setUser(profile);
          store.setIsPremium(profile.is_premium);
          store.setFollowedFandoms(profile.followed_fandoms);
          store.setFollowedCategories(profile.followed_categories);
          await store.loadUserData(data.user.id);
        }

        const savedOnboarded = await AsyncStorage.getItem('hasOnboarded');
        if (!savedOnboarded || savedOnboarded === 'false') {
          router.replace('/onboarding');
        } else {
          router.replace('/');
        }
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;

        if (data.user) {
          const profile = await api.createUserProfile(
            data.user.id,
            email.trim(),
            name.trim() || null
          );
          if (profile) {
            store.setUser(profile);
            store.setIsPremium(false);
          }
        }

        router.replace('/onboarding');
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Something went wrong';
      setError(mapAuthError(raw));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    useAppStore.getState().setIsAuthReady(true);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/trendnable_logo_b.png')}
            style={{ width: 52, height: 52, borderRadius: 14 }}
            resizeMode="contain"
          />
        </View>

        <Text style={[styles.headline, { color: theme.text, fontFamily: 'Inter_700Bold' }]}>
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </Text>
        <Text style={[styles.sub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
          {mode === 'login'
            ? 'Sign in to access your collection and watchlist.'
            : "Track what's trending in your hobbies."}
        </Text>

        {/* Fields */}
        {mode === 'signup' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.faint, fontFamily: 'JetBrainsMono_400Regular' }]}>
              NAME
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={theme.faint}
              autoComplete="name"
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text, fontFamily: 'Inter_400Regular', borderColor: theme.hairline }]}
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.faint, fontFamily: 'JetBrainsMono_400Regular' }]}>
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={theme.faint}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, fontFamily: 'Inter_400Regular', borderColor: theme.hairline }]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.faint, fontFamily: 'JetBrainsMono_400Regular' }]}>
            PASSWORD
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={theme.faint}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, fontFamily: 'Inter_400Regular', borderColor: theme.hairline }]}
          />
        </View>

        {error && (
          <Text style={[styles.error, { color: theme.neg, fontFamily: 'Inter_400Regular' }]}>{error}</Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 }]}
        >
          <Text style={[styles.primaryBtnText, { color: theme.accentInk, fontFamily: 'Inter_600SemiBold' }]}>
            {loading ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          style={styles.switchRow}
        >
          <Text style={[styles.switchText, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          </Text>
          <Text style={[styles.switchLink, { color: theme.accent, fontFamily: 'Inter_600SemiBold' }]}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <Text style={[styles.dividerText, { color: theme.faint, fontFamily: 'Inter_400Regular' }]}>or</Text>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
        </View>

        <Pressable onPress={handleGuest} style={[styles.guestBtn, { borderColor: theme.hairline }]}>
          <Text style={[styles.guestBtnText, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
            Continue as guest
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  logoRow: { alignItems: 'flex-start', marginBottom: 32 },
  headline: { fontSize: 32, letterSpacing: -0.03, lineHeight: 36, marginBottom: 8 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 32 },
  field: { marginBottom: 16 },
  label: { fontSize: 10.5, letterSpacing: 0.12, marginBottom: 8 },
  input: {
    height: 48, paddingHorizontal: 16, borderRadius: 8,
    fontSize: 15, borderWidth: StyleSheet.hairlineWidth,
  },
  error: { fontSize: 13, marginBottom: 12 },
  primaryBtn: {
    height: 52, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  switchText: { fontSize: 14 },
  switchLink: { fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 12 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
  guestBtn: {
    height: 48, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  guestBtnText: { fontSize: 15 },
});
