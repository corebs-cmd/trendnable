import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../stores/appStore';
import { buildTheme } from '../../lib/theme';
import { CATEGORIES, FANDOMS } from '../../lib/appConfig';
import * as api from '../../lib/api';

type Step = 'welcome' | 'categories' | 'fandoms' | 'ready';
const STEPS: Step[] = ['welcome', 'categories', 'fandoms', 'ready'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const theme = buildTheme(isDark);
  const { setHasOnboarded, setFollowedCategories, setFollowedFandoms } = useAppStore();

  const [stepIdx, setStepIdx] = useState(0);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedFandoms, setSelectedFandoms] = useState<string[]>([]);

  const step = STEPS[stepIdx];

  const toggleCat = (id: string) => {
    setSelectedCats((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const toggleFandom = (id: string) => {
    setSelectedFandoms((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const handleNext = async () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      if (selectedCats.length > 0) setFollowedCategories(selectedCats);
      if (selectedFandoms.length > 0) setFollowedFandoms(selectedFandoms);

      const { user } = useAppStore.getState();
      if (user) {
        await api.updateUserPreferences(user.id, {
          followedCategories: selectedCats.length > 0 ? selectedCats : undefined,
          followedFandoms: selectedFandoms.length > 0 ? selectedFandoms : undefined,
        });
      }

      setHasOnboarded(true);
      router.replace('/');
    }
  };

  const handleSkip = () => {
    setHasOnboarded(true);
    router.replace('/');
  };

  const nextLabel =
    step === 'welcome' ? 'Get started' :
    step === 'ready' ? 'Open Trendnable' : 'Continue';

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Progress dots */}
      <View style={[styles.progressRow, { paddingTop: insets.top + 16 }]}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i <= stepIdx ? theme.accent : theme.hotBarTrack },
            ]}
          />
        ))}
      </View>

      {/* Skip button */}
      {step !== 'ready' && (
        <Pressable
          onPress={handleSkip}
          style={[styles.skipBtn, { top: insets.top + 14 }]}
        >
          <Text style={[styles.skipText, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>Skip</Text>
        </Pressable>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'welcome' && <WelcomeStep theme={theme} />}
        {step === 'categories' && (
          <CategoriesStep theme={theme} selected={selectedCats} onToggle={toggleCat} />
        )}
        {step === 'fandoms' && (
          <FandomsStep theme={theme} selected={selectedFandoms} onToggle={toggleFandom} />
        )}
        {step === 'ready' && (
          <ReadyStep theme={theme} cats={selectedCats} fandoms={selectedFandoms} />
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: theme.hairline }]}>
        {stepIdx > 0 && (
          <Pressable
            onPress={() => setStepIdx((i) => i - 1)}
            style={[styles.backBtn, { backgroundColor: theme.surface2 }]}
          >
            <Text style={[styles.backBtnText, { color: theme.text, fontFamily: 'Inter_400Regular' }]}>←</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleNext}
          style={[styles.nextBtn, { backgroundColor: theme.accent, flex: 1 }]}
        >
          <Text style={[styles.nextBtnText, { color: theme.accentInk, fontFamily: 'Inter_600SemiBold' }]}>
            {nextLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function WelcomeStep({ theme }: { theme: any }) {
  return (
    <View>
      <View style={[styles.welcomeLogo, { backgroundColor: theme.accent }]}>
        <Text style={[styles.welcomeLogoText, { color: theme.accentInk, fontFamily: 'Inter_700Bold' }]}>T</Text>
      </View>
      <Text style={[styles.welcomeEyebrow, { color: theme.accent, fontFamily: 'JetBrainsMono_400Regular' }]}>
        Welcome to
      </Text>
      <Text style={[styles.welcomeTitle, { color: theme.text, fontFamily: 'Inter_700Bold' }]}>
        Trendnable
      </Text>
      <Text style={[styles.welcomeSub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
        Daily trend intelligence for collectors. Track what's moving across your fandoms — and what's moving in your collection.
      </Text>

      <View style={{ marginTop: 36, gap: 20 }}>
        {[
          { g: '◯', t: 'Daily hot list', s: "See what's actually trending today — not last month." },
          { g: '◍', t: 'Cross-category', s: 'Funko, TCG, Pop Mart, Hot Toys, NECA, diecast — all in one feed.' },
          { g: '◎', t: 'Your collection', s: 'Track value and trends in the items you own.' },
        ].map(({ g, t, s }) => (
          <View key={t} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.featureGlyph, { color: theme.accent }]}>{g}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: theme.text, fontFamily: 'Inter_600SemiBold' }]}>{t}</Text>
              <Text style={[styles.featureSub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>{s}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function CategoriesStep({ theme, selected, onToggle }: { theme: any; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <View>
      <Text style={[styles.stepTitle, { color: theme.text, fontFamily: 'Inter_700Bold' }]}>What do you collect?</Text>
      <Text style={[styles.stepSub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
        Pick anything you actively follow. You can change this later.
      </Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((c) => {
          const active = selected.includes(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => onToggle(c.id)}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: theme.surface,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  borderWidth: active ? 2 : 0,
                  borderColor: active ? theme.accent : 'transparent',
                },
              ]}
            >
              <View style={[styles.categoryImagePlaceholder, { backgroundColor: theme.surface2 }]}>
                <Text style={[styles.categoryGlyph, { color: theme.faint, fontFamily: 'JetBrainsMono_400Regular' }]}>
                  {c.type === 'figure' ? '◎' : c.type === 'card' ? '▭' : c.type === 'box' ? '⬡' : '🚗'}
                </Text>
                {active && (
                  <View style={[styles.checkBadge, { backgroundColor: theme.accent }]}>
                    <Text style={{ color: theme.accentInk, fontSize: 12, fontWeight: '700' }}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.categoryLabel, { color: theme.text, fontFamily: 'Inter_600SemiBold' }]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FandomsStep({ theme, selected, onToggle }: { theme: any; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <View>
      <Text style={[styles.stepTitle, { color: theme.text, fontFamily: 'Inter_700Bold' }]}>And which fandoms?</Text>
      <Text style={[styles.stepSub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
        Your Hot feed will lean into these.
      </Text>
      <View style={styles.fandomChips}>
        {FANDOMS.map((f) => {
          const active = selected.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => onToggle(f.id)}
              style={[
                styles.fandomChip,
                {
                  backgroundColor: active ? theme.text : theme.surface2,
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 4,
                },
              ]}
            >
              <Text
                style={[
                  styles.fandomChipText,
                  {
                    color: active ? theme.surface : theme.text,
                    fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    fontSize: 14,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ReadyStep({ theme, cats, fandoms }: { theme: any; cats: string[]; fandoms: string[] }) {
  return (
    <View>
      <Text style={[styles.readyTitle, { color: theme.text, fontFamily: 'Inter_700Bold' }]}>You're ready.</Text>
      <Text style={[styles.readySub, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
        We'll show you what's moving in {cats.length || 6} categories and {fandoms.length || 'all'} fandoms — refreshed every morning.
      </Text>
      <View style={[styles.readyPreview, { backgroundColor: theme.surface }]}>
        <Text style={[styles.readyPreviewLabel, { color: theme.faint, fontFamily: 'JetBrainsMono_400Regular' }]}>
          PREVIEW · HOT TODAY
        </Text>
        {[
          { name: 'Luffy Gear 5 — Awakening', hot: 91, delta: 7 },
          { name: 'Charizard ex — 151 Special', hot: 87, delta: 12 },
        ].map((item) => (
          <View key={item.name} style={styles.readyPreviewRow}>
            <View style={[styles.readyThumb, { backgroundColor: theme.surface2 }]}>
              <Text style={{ color: theme.faint, fontSize: 16 }}>◎</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.readyItemName, { color: theme.text, fontFamily: 'Inter_600SemiBold' }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text style={[styles.readyItemMeta, { color: theme.muted, fontFamily: 'JetBrainsMono_400Regular' }]}>
                Hot {item.hot}
              </Text>
            </View>
            <Text style={[styles.readyDelta, { color: theme.pos, fontFamily: 'JetBrainsMono_700Bold' }]}>
              ↑{item.delta}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 4,
  },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 999,
  },
  skipBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    padding: 4,
  },
  skipText: { fontSize: 13 },
  scroll: { flex: 1 },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 48, height: 48, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 18 },
  nextBtn: {
    height: 48, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnText: { fontSize: 16 },
  // Welcome
  welcomeLogo: {
    width: 72, height: 72, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, marginTop: 40,
  },
  welcomeLogoText: { fontSize: 36 },
  welcomeEyebrow: {
    fontSize: 11, letterSpacing: 0.18, textTransform: 'uppercase', marginBottom: 8,
  },
  welcomeTitle: { fontSize: 52, letterSpacing: -0.03, lineHeight: 50, marginBottom: 14 },
  welcomeSub: { fontSize: 17, lineHeight: 24 },
  featureRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureGlyph: { fontSize: 18 },
  featureTitle: { fontSize: 15, marginBottom: 3 },
  featureSub: { fontSize: 13, lineHeight: 18 },
  // Categories
  stepTitle: { fontSize: 28, letterSpacing: -0.02, lineHeight: 30, marginBottom: 8 },
  stepSub: { fontSize: 14.5, lineHeight: 20, marginBottom: 24 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: {
    width: '47%', borderRadius: 6, padding: 12,
    flexDirection: 'column', gap: 10,
  },
  categoryImagePlaceholder: {
    width: '100%', aspectRatio: 1,
    borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  categoryGlyph: { fontSize: 36 },
  checkBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryLabel: { fontSize: 14 },
  // Fandoms
  fandomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },
  fandomChip: { alignItems: 'center', justifyContent: 'center' },
  fandomChipText: {},
  // Ready
  readyTitle: { fontSize: 32, letterSpacing: -0.02, marginTop: 30, marginBottom: 10 },
  readySub: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  readyPreview: { borderRadius: 6, padding: 18, gap: 12 },
  readyPreviewLabel: { fontSize: 10.5, letterSpacing: 0.1, marginBottom: 8 },
  readyPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readyThumb: { width: 40, height: 40, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  readyItemName: { fontSize: 13.5 },
  readyItemMeta: { fontSize: 11, marginTop: 2 },
  readyDelta: { fontSize: 13 },
});
