import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import Svg, { Path, Rect, Circle, G, LinearGradient as SvgLinearGradient, Defs, Stop } from 'react-native-svg';
import { Theme, RADIUS } from '@/lib/theme';
import Sheet from '@/components/Sheet';

// ─── Props ───────────────────────────────────────────────────────────────────
interface IOSShareSheetProps {
  open: boolean;
  theme: Theme;
  previewTitle: string;
  previewSub?: string;
  previewUrl?: string;
  previewThumb?: string;
  onClose: () => void;
}

// ─── Contact/AirDrop data ────────────────────────────────────────────────────
const CONTACTS = [
  { initials: 'JL', color: '#4CAF50' },
  { initials: 'AM', color: '#2196F3' },
  { initials: 'RK', color: '#FF9800' },
  { initials: 'SN', color: '#E91E63' },
];

// ─── App row data ─────────────────────────────────────────────────────────────
type AppItem = {
  label: string;
  bg: string;
  icon: React.ReactNode;
};

// ─── SVG icon helpers ────────────────────────────────────────────────────────
function MessagesIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Defs>
        <SvgLinearGradient id="msg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5BDB5B" />
          <Stop offset="1" stopColor="#2ECC2E" />
        </SvgLinearGradient>
      </Defs>
      <Rect width={28} height={28} rx={6} fill="url(#msg)" />
      <Path
        d="M5 9c0-1.1.9-2 2-2h14a2 2 0 012 2v8a2 2 0 01-2 2H9l-4 3V9z"
        fill="white"
      />
    </Svg>
  );
}

function MailIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Defs>
        <SvgLinearGradient id="mail" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4FC3F7" />
          <Stop offset="1" stopColor="#1565C0" />
        </SvgLinearGradient>
      </Defs>
      <Rect width={28} height={28} rx={6} fill="url(#mail)" />
      <Path
        d="M6 10l8 5 8-5"
        stroke="white"
        strokeWidth={1.5}
        fill="none"
      />
      <Rect x={5} y={9} width={18} height={12} rx={1} stroke="white" strokeWidth={1.4} fill="none" />
    </Svg>
  );
}

function NotesIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill="#FFCA28" />
      <Path d="M9 10h10M9 14h8M9 18h6" stroke="#5D4037" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function RemindersIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill="#F5F5F5" />
      <Circle cx={14} cy={14} r={6} stroke="#E53935" strokeWidth={1.5} fill="none" />
      <Path d="M14 11v3.5l2 2" stroke="#E53935" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function XIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill="#000000" />
      <Path d="M8 8l12 12M20 8L8 20" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function RedditIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill="#FF4500" />
      <Circle cx={14} cy={15} r={6} fill="white" />
      <Circle cx={11.5} cy={15} r={1} fill="#FF4500" />
      <Circle cx={16.5} cy={15} r={1} fill="#FF4500" />
      <Path d="M11 18c1 0.8 5 0.8 6 0" stroke="#FF4500" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <Circle cx={14} cy={9} r={2} fill="white" />
    </Svg>
  );
}

function MoreIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill="#8E8E93" />
      <Circle cx={10} cy={14} r={1.5} fill="white" />
      <Circle cx={14} cy={14} r={1.5} fill="white" />
      <Circle cx={18} cy={14} r={1.5} fill="white" />
    </Svg>
  );
}

// ─── Action row icons ─────────────────────────────────────────────────────────
function CopyIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Rect x={5} y={5} width={11} height={13} rx={2} stroke={color} strokeWidth={1.4} fill="none" />
      <Path d="M5 8H4a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-1" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function SavePhotoIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Rect x={2} y={4} width={16} height={12} rx={2} stroke={color} strokeWidth={1.4} fill="none" />
      <Circle cx={7} cy={8} r={1.5} fill={color} />
      <Path d="M2 14l4-4 3 3 3-3 6 6" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function WatchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={7} stroke={color} strokeWidth={1.4} fill="none" />
      <Circle cx={10} cy={10} r={3} fill={color} fillOpacity={0.4} />
    </Svg>
  );
}

function PrintIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Rect x={4} y={7} width={12} height={8} rx={1} stroke={color} strokeWidth={1.4} fill="none" />
      <Path d="M6 7V4h8v3" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Rect x={6} y={11} width={8} height={4} rx={0.5} stroke={color} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

// ─── AirDrop icon ────────────────────────────────────────────────────────────
function AirDropCircle({ size = 56 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="airdrop" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#6EC6F5" />
            <Stop offset="1" stopColor="#1A9AE6" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#airdrop)" />
        <Path
          d={`M${size * 0.35} ${size * 0.62}L${size * 0.5} ${size * 0.38}L${size * 0.65} ${size * 0.62}`}
          stroke="white"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={`M${size * 0.28} ${size * 0.72}L${size * 0.5} ${size * 0.28}L${size * 0.72} ${size * 0.72}`}
          stroke="white"
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.5}
        />
      </Svg>
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function IOSShareSheet({
  open,
  theme,
  previewTitle,
  previewSub,
  previewUrl,
  previewThumb,
  onClose,
}: IOSShareSheetProps) {
  const apps: AppItem[] = [
    { label: 'Messages', bg: '#2ECC2E', icon: <MessagesIcon /> },
    { label: 'Mail', bg: '#1565C0', icon: <MailIcon /> },
    { label: 'Notes', bg: '#FFCA28', icon: <NotesIcon /> },
    { label: 'Reminders', bg: '#F5F5F5', icon: <RemindersIcon /> },
    { label: 'X', bg: '#000000', icon: <XIcon /> },
    { label: 'Reddit', bg: '#FF4500', icon: <RedditIcon /> },
    { label: 'More', bg: '#8E8E93', icon: <MoreIcon /> },
  ];

  const actions = [
    {
      label: 'Copy',
      icon: <CopyIcon color={theme.text} />,
    },
    {
      label: 'Save to Photos',
      icon: <SavePhotoIcon color={theme.text} />,
    },
    {
      label: 'Add to Watchlist',
      icon: <WatchIcon color={theme.text} />,
    },
    {
      label: 'Print',
      icon: <PrintIcon color={theme.text} />,
    },
  ];

  return (
    <Sheet open={open} onClose={onClose} theme={theme}>
      {/* ── Rich link preview ── */}
      <View
        style={{
          backgroundColor: theme.surface2,
          borderRadius: 14,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        {/* Thumbnail placeholder */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: RADIUS.card,
            backgroundColor: theme.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
            flexShrink: 0,
          }}
        >
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, color: theme.faint }}>
            T
          </Text>
        </View>

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Inter_700Bold',
              fontSize: 14,
              color: theme.text,
              marginBottom: 2,
            }}
            numberOfLines={1}
          >
            {previewTitle}
          </Text>
          {previewSub && (
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 12,
                color: theme.muted,
                marginBottom: 2,
              }}
              numberOfLines={1}
            >
              {previewSub}
            </Text>
          )}
          {previewUrl && (
            <Text
              style={{
                fontFamily: 'JetBrainsMono_400Regular',
                fontSize: 10,
                color: theme.faint,
              }}
              numberOfLines={1}
            >
              {previewUrl}
            </Text>
          )}
        </View>
      </View>

      {/* ── AirDrop + contacts rail ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
        contentContainerStyle={{ gap: 16, paddingHorizontal: 2 }}
      >
        {/* AirDrop */}
        <View style={{ alignItems: 'center', gap: 6 }}>
          <AirDropCircle size={56} />
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 11,
              color: theme.muted,
              textAlign: 'center',
            }}
          >
            AirDrop
          </Text>
        </View>

        {/* Contacts */}
        {CONTACTS.map((c) => (
          <Pressable key={c.initials} style={{ alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: c.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 18,
                  color: 'white',
                }}
              >
                {c.initials}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 11,
                color: theme.muted,
              }}
            >
              {c.initials}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── App icons rail ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 2 }}
      >
        {apps.map((app) => (
          <Pressable
            key={app.label}
            style={({ pressed }) => ({
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {app.icon}
            </View>
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 10,
                color: theme.muted,
                textAlign: 'center',
              }}
            >
              {app.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Grouped action list ── */}
      <View
        style={{
          backgroundColor: theme.surface2,
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        {actions.map((action, idx) => (
          <Pressable
            key={action.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: idx < actions.length - 1 ? 1 : 0,
              borderBottomColor: theme.hairline,
              backgroundColor: pressed
                ? 'rgba(120,180,255,0.07)'
                : 'transparent',
            })}
          >
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 16,
                color: theme.text,
                flex: 1,
              }}
            >
              {action.label}
            </Text>
            {action.icon}
          </Pressable>
        ))}
      </View>

      {/* ── Cancel button ── */}
      <Pressable
        onPress={onClose}
        style={({ pressed }) => ({
          height: 52,
          backgroundColor: pressed
            ? 'rgba(120,180,255,0.07)'
            : theme.surface2,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Text
          style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 17,
            color: theme.text,
          }}
        >
          Cancel
        </Text>
      </Pressable>
    </Sheet>
  );
}
