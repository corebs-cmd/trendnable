import { View, Text } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import type { Theme } from '@/lib/theme';

const SZ = 20;

type Feature = {
  icon: (color: string) => React.ReactNode;
  color: string;
  bg: string;
  bgDark: string;
  title: string;
  desc: string;
  where: string;
  free?: string;
  pro?: string;
};

const FEATURES: Feature[] = [
  {
    // Exact FlameIcon from the Hot tab
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth={0} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3.5 2-4 0 2 1 3 2 3 0-4-1-6 1-9z" />
      </Svg>
    ),
    color:  '#FB923C',
    bg:     'rgba(251,146,60,0.13)',
    bgDark: 'rgba(251,146,60,0.22)',
    title: 'Hot List',
    desc:  'Your daily trending feed — ranked by momentum and hot score. Refreshed every morning.',
    where: 'Hot tab',
  },
  {
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill={c} stroke="none">
        <Rect x="3" y="3" width="7" height="7" rx="1" />
        <Rect x="14" y="3" width="7" height="7" rx="1" />
        <Rect x="3" y="14" width="7" height="7" rx="1" />
        <Rect x="14" y="14" width="7" height="7" rx="1" />
      </Svg>
    ),
    color:  '#FF5500',
    bg:     'rgba(255,85,0,0.12)',
    bgDark: 'rgba(255,85,0,0.22)',
    title: 'Browse & Search',
    desc:  'Explore all categories and fandoms. Search surfaces both actively tracked items and everything in the full catalog — even items not yet on the Hot list.',
    where: 'Browse tab',
  },
  {
    // Trend line chart — represents price history on PDP
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M2 19L8 11l4 4 5-7 4 3" />
        <Path d="M2 22h20" strokeWidth={1.4} />
      </Svg>
    ),
    color:  '#8B5CF6',
    bg:     'rgba(139,92,246,0.12)',
    bgDark: 'rgba(139,92,246,0.22)',
    title: 'Item Details',
    desc:  'Price history chart, trend signals, buy/sell insight, AI-written narrative, and Where to Buy links — eBay, Mercari, and PopnBeats.',
    where: 'Tap any item',
    free:  '30-day chart only',
    pro:   '90-day + 1Y charts · AI narration',
  },
  {
    // Exact EyeIcon from the Watchlist tab
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9}>
        <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <Circle cx="12" cy="12" r="3" fill={c} />
      </Svg>
    ),
    color:  '#CC220B',
    bg:     'rgba(204,34,11,0.12)',
    bgDark: 'rgba(204,34,11,0.22)',
    title: 'Watchlist',
    desc:  "Save items you're watching. Get notified when they spike or drop.",
    where: 'Watchlist tab',
    free:  'Up to 20 items',
    pro:   'Unlimited items',
  },
  {
    // Exact StackIcon from the Collection tab
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth={1.7} strokeLinejoin="round">
        <Path d="M12 3 3 8l9 5 9-5-9-5z" />
        <Path d="M3 13l9 5 9-5" fill="none" />
        <Path d="M3 18l9 5 9-5" fill="none" />
      </Svg>
    ),
    color:  '#16A34A',
    bg:     'rgba(22,163,74,0.12)',
    bgDark: 'rgba(22,163,74,0.22)',
    title: 'Your Collection',
    desc:  'Log what you own. Track total portfolio value, P&L, and category breakdown. Export your full collection as a CSV delivered to your inbox.',
    where: 'Collection tab',
    free:  'Value visible · P&L locked',
    pro:   'Full P&L · category breakdown · free export',
  },
  {
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 16V4M8 8l4-4 4 4" />
        <Path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" />
      </Svg>
    ),
    color:  '#0EA5E9',
    bg:     'rgba(14,165,233,0.12)',
    bgDark: 'rgba(14,165,233,0.22)',
    title: 'Collection Export',
    desc:  'Export your full collection as a CSV file. Premium users get it free. Free users can purchase a single export for $1.99 — delivered directly to your email with a summary of your portfolio.',
    where: 'Collection tab → export icon',
    free:  'Single export · $1.99',
    pro:   'Unlimited exports included',
  },
  {
    // Bell icon — represents push notifications
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </Svg>
    ),
    color:  '#D97706',
    bg:     'rgba(217,119,6,0.12)',
    bgDark: 'rgba(217,119,6,0.22)',
    title: 'Price Alerts',
    desc:  'Get a push notification when a watchlist item makes a significant move.',
    where: 'Settings › Notifications',
  },
  {
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
        <Rect x="7" y="7" width="10" height="10" rx="1" />
      </Svg>
    ),
    color:  '#F59E0B',
    bg:     'rgba(245,158,11,0.12)',
    bgDark: 'rgba(245,158,11,0.22)',
    title: 'Scan & Identify',
    desc:  'Scan a barcode to instantly look up a collectible, or use Visual Scan to point your camera at any item and let AI identify it.',
    where: 'Collection tab → Scan buttons',
    free:  '1 visual scan per day',
    pro:   'Unlimited visual scans',
  },
  {
    // Filter/sliders icon — represents tuning your categories
    icon: (c) => (
      <Svg width={SZ} height={SZ} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round">
        <Path d="M4 6h16M7 12h10M10 18h4" />
      </Svg>
    ),
    color:  '#BE185D',
    bg:     'rgba(190,24,93,0.12)',
    bgDark: 'rgba(190,24,93,0.22)',
    title: 'My Categories',
    desc:  'Tune your Hot feed to only surface the categories you actively collect.',
    where: 'Settings › My Categories',
  },
];

// ── Free vs Pro row ────────────────────────────────────────────────────────────

function TierRow({ free, pro, theme }: { free: string; pro: string; theme: Theme }) {
  return (
    <View style={{ marginTop: 9, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{
          paddingHorizontal: 5, height: 15, borderRadius: 4,
          backgroundColor: 'rgba(120,120,120,0.14)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 8.5, color: theme.muted, letterSpacing: 0.3 }}>
            FREE
          </Text>
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted }}>
          {free}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{
          paddingHorizontal: 5, height: 15, borderRadius: 4,
          backgroundColor: 'rgba(232,163,61,0.18)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 8.5, color: '#E8A33D', letterSpacing: 0.3 }}>
            ★ PRO
          </Text>
        </View>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.text }}>
          {pro}
        </Text>
      </View>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FeatureGuide({
  theme,
  isDark,
}: {
  theme: Theme;
  isDark: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {FEATURES.map((f) => (
        <View
          key={f.title}
          style={{
            backgroundColor: theme.surface,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          {/* Colored icon box */}
          <View style={{
            width: 44, height: 44, borderRadius: 11,
            backgroundColor: isDark ? f.bgDark : f.bg,
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {f.icon(f.color)}
          </View>

          {/* Text content */}
          <View style={{ flex: 1 }}>
            <Text style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 14.5, color: theme.text, marginBottom: 3,
            }}>
              {f.title}
            </Text>
            <Text style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 12.5, color: theme.muted, lineHeight: 17,
            }}>
              {f.desc}
            </Text>

            {/* Free vs Pro — only for gated features */}
            {f.free && f.pro && (
              <TierRow free={f.free} pro={f.pro} theme={theme} />
            )}

            {/* Location pill */}
            <View style={{
              alignSelf: 'flex-start', marginTop: 10,
              backgroundColor: isDark ? f.bgDark : f.bg,
              borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
            }}>
              <Text style={{
                fontFamily: 'JetBrainsMono_400Regular',
                fontSize: 10.5, color: f.color,
              }}>
                → {f.where}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
