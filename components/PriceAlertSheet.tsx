import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { SKU } from '@/lib/types';
import { useAppStore } from '@/stores/appStore';
import Sheet from '@/components/Sheet';

interface Props {
  open: boolean;
  sku: SKU;
  theme: Theme;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function PriceAlertSheet({ open, sku, theme, onClose, onUpgrade }: Props) {
  const isPremium        = useAppStore((s) => s.isPremium);
  const addPriceAlert    = useAppStore((s) => s.addPriceAlert);
  const removePriceAlert = useAppStore((s) => s.removePriceAlert);
  const allAlerts        = useAppStore((s) => s.priceAlerts);
  const activeAlerts     = allAlerts.filter((a) => a.skuId === sku.id && a.isActive);

  const [direction, setDirection]               = useState<'above' | 'below'>('below');
  const [customInput, setCustomInput]           = useState('');
  const [selectedSuggestion, setSelectedSugg]  = useState<number | null>(null);
  const [saving, setSaving]                     = useState(false);

  const currentPrice = sku.price.median;

  const suggestions = useMemo(() => {
    if (direction === 'below') {
      return [
        { label: '−10%', price: Math.round(currentPrice * 0.9) },
        { label: '−20%', price: Math.round(currentPrice * 0.8) },
        { label: '−30%', price: Math.round(currentPrice * 0.7) },
      ];
    }
    return [
      { label: '+10%', price: Math.round(currentPrice * 1.1) },
      { label: '+20%', price: Math.round(currentPrice * 1.2) },
      { label: '+30%', price: Math.round(currentPrice * 1.3) },
    ];
  }, [direction, currentPrice]);

  const parsedCustom  = customInput ? parseFloat(customInput) : null;
  const targetPrice   = parsedCustom ?? selectedSuggestion;
  const canSave       = targetPrice != null && targetPrice > 0 && !isNaN(targetPrice);

  const handleDirectionChange = (dir: 'above' | 'below') => {
    setDirection(dir);
    setCustomInput('');
    setSelectedSugg(null);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await addPriceAlert(sku.id, direction, targetPrice!);
    setSaving(false);
    setCustomInput('');
    setSelectedSugg(null);
  };

  if (!isPremium) {
    return (
      <Sheet open={open} onClose={onClose} theme={theme} title="Price Alerts">
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 16 }}>
          <View style={{
            width: 60, height: 60, borderRadius: 18,
            backgroundColor: theme.premium,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={theme.premiumInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 01-3.46 0" />
            </Svg>
          </View>
          <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 22, color: theme.text, letterSpacing: -0.4, textAlign: 'center' }}>
            Price Alerts
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
            Get notified the moment a watched item hits your price target. Premium only.
          </Text>
          <Pressable
            onPress={() => { onClose(); onUpgrade(); }}
            style={({ pressed }) => ({
              backgroundColor: theme.premium, borderRadius: 999,
              paddingHorizontal: 28, paddingVertical: 13,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.premiumInk }}>
              Unlock Premium
            </Text>
          </Pressable>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Price Alert">
      <View style={{ gap: 20 }}>
        {/* Current price */}
        <View style={{
          backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 14,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
            {sku.short}  ·  current median
          </Text>
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 20, color: theme.premium, fontVariant: ['tabular-nums'] }}>
            ${currentPrice.toFixed(0)}
          </Text>
        </View>

        {/* Direction toggle */}
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 }}>
            Alert me when price goes
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['below', 'above'] as const).map((dir) => (
              <Pressable
                key={dir}
                onPress={() => handleDirectionChange(dir)}
                style={({ pressed }) => ({
                  flex: 1, height: 42, borderRadius: theme.radius,
                  backgroundColor: direction === dir ? theme.accent : theme.surface2,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 14,
                  color: direction === dir ? theme.accentInk : theme.muted,
                }}>
                  {dir === 'below' ? '↓  Below' : '↑  Above'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Suggestion chips */}
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 }}>
            Quick targets
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {suggestions.map((s) => {
              const isSelected = selectedSuggestion === s.price && !customInput;
              return (
                <Pressable
                  key={s.label}
                  onPress={() => { setSelectedSugg(s.price); setCustomInput(''); }}
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: theme.radius,
                    backgroundColor: isSelected ? `${theme.accent}18` : theme.surface2,
                    borderWidth: 1,
                    borderColor: isSelected ? theme.accent : 'transparent',
                    paddingVertical: 10, alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, color: isSelected ? theme.accent : theme.text, fontVariant: ['tabular-nums'] }}>
                    ${s.price}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: isSelected ? theme.accent : theme.faint, marginTop: 2 }}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Custom input */}
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 }}>
            Custom price
          </Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.surface2, borderRadius: theme.radius,
            borderWidth: 1, borderColor: customInput ? theme.accent : 'transparent',
            paddingHorizontal: 14, height: 48,
          }}>
            <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 20, color: theme.muted, marginRight: 4 }}>$</Text>
            <TextInput
              value={customInput}
              onChangeText={(t) => { setCustomInput(t); setSelectedSugg(null); }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.faint}
              style={{
                flex: 1,
                fontFamily: 'JetBrainsMono_700Bold',
                fontSize: 20,
                color: theme.text,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>
        </View>

        {/* Set Alert CTA */}
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={({ pressed }) => ({
            height: 52, borderRadius: theme.radius,
            backgroundColor: canSave ? theme.accent : theme.surface2,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : (canSave ? 1 : 0.5),
          })}
        >
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: canSave ? theme.accentInk : theme.faint }}>
            {saving
              ? 'Saving…'
              : targetPrice != null
                ? `Alert when ${direction} $${targetPrice.toFixed(0)}`
                : 'Set Alert'}
          </Text>
        </Pressable>

        {/* Existing active alerts */}
        {activeAlerts.length > 0 && (
          <View>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 }}>
              Active alerts
            </Text>
            <View style={{ gap: 8 }}>
              {activeAlerts.map((alert) => (
                <View key={alert.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 12,
                }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 999,
                    backgroundColor: alert.direction === 'above' ? `${theme.pos}22` : `${theme.neg}22`,
                    alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  }}>
                    <Text style={{ fontSize: 14, color: alert.direction === 'above' ? theme.pos : theme.neg }}>
                      {alert.direction === 'above' ? '↑' : '↓'}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.text, flex: 1 }}>
                    {alert.direction === 'above' ? 'Above' : 'Below'}{' '}
                    <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: theme.premium }}>
                      ${alert.targetPrice.toFixed(0)}
                    </Text>
                  </Text>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Delete alert',
                        `Remove the ${alert.direction} $${alert.targetPrice.toFixed(0)} alert?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removePriceAlert(alert.id) },
                        ]
                      )
                    }
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2} strokeLinecap="round">
                      <Path d="M18 6L6 18M6 6l12 12" />
                    </Svg>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}
