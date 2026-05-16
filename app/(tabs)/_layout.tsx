import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppStore } from '../../stores/appStore';
import { buildTheme } from '../../lib/theme';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

// ── Tab icons (match prototype exactly) ───────────────────────────────────

function FlameIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={color} strokeWidth={active ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3.5 2-4 0 2 1 3 2 3 0-4-1-6 1-9z" />
    </Svg>
  );
}

function GridIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={color} strokeWidth={active ? 2 : 1.6}>
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
      <Rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}

function StackIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={color} strokeWidth={active ? 2 : 1.6} strokeLinejoin="round">
      <Path d="M12 3 3 8l9 5 9-5-9-5z" />
      <Path d="M3 13l9 5 9-5" fill="none" />
      <Path d="M3 18l9 5 9-5" fill="none" />
    </Svg>
  );
}

function EyeIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2 : 1.6}>
      <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <Circle cx="12" cy="12" r="3" fill={active ? color : 'none'} />
    </Svg>
  );
}

function GearIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2 : 1.6} strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" fill={active ? color : 'none'} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

const TAB_CONFIG = [
  { name: 'index',      label: 'Hot',        Icon: FlameIcon },
  { name: 'browse',     label: 'Browse',     Icon: GridIcon },
  { name: 'collection', label: 'Collection', Icon: StackIcon },
  { name: 'watchlist',  label: 'Watchlist',  Icon: EyeIcon },
  { name: 'settings',   label: 'Settings',   Icon: GearIcon },
];

// ── Standard full-width tab bar matching prototype ─────────────────────────

function TrendnableTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isDark = useAppStore((s) => s.isDark);
  const theme = buildTheme(isDark);

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(insets.bottom, 8) + 4,
          backgroundColor: theme.navBg,
          borderTopColor: theme.hairline,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const cfg = TAB_CONFIG.find((t) => t.name === route.name);
        if (!cfg) return null;

        const color = focused ? theme.accent : theme.muted;

        return (
          <Pressable
            key={route.name}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={styles.tabItem}
          >
            <cfg.Icon color={color} active={focused} />
            <Text
              style={[
                styles.tabLabel,
                {
                  color,
                  fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_400Regular',
                },
              ]}
            >
              {cfg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingTop: 10,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
    minWidth: 56,
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: -0.1,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TrendnableTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="browse" />
      <Tabs.Screen name="collection" />
      <Tabs.Screen name="watchlist" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
