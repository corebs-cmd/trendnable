import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
} from 'react-native';
import { Theme, RADIUS } from '@/lib/theme';
import { CollectionFormData, SKU } from '@/lib/types';
import { fmtPrice } from '@/lib/appConfig';
import { useAppStore } from '@/stores/appStore';

import Sheet from '@/components/Sheet';
import Chip from '@/components/Chip';
import PrimaryButton from '@/components/PrimaryButton';
import { ProductThumb } from '@/components/ProductPlaceholder';

// ─── Stepper ────────────────────────────────────────────────────────────────
interface StepperProps {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  theme: Theme;
}
function Stepper({ value, onDecrement, onIncrement, theme }: StepperProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      <Pressable
        onPress={onDecrement}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          backgroundColor: theme.surface2,
          borderTopLeftRadius: RADIUS.chip,
          borderBottomLeftRadius: RADIUS.chip,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            color: value <= 1 ? theme.faint : theme.text,
          }}
        >
          −
        </Text>
      </Pressable>
      <View
        style={{
          width: 52,
          height: 40,
          backgroundColor: theme.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'JetBrainsMono_700Bold',
            fontSize: 16,
            color: theme.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      </View>
      <Pressable
        onPress={onIncrement}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          backgroundColor: theme.surface2,
          borderTopRightRadius: RADIUS.chip,
          borderBottomRightRadius: RADIUS.chip,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            color: theme.text,
          }}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}

// ─── FieldLabel ─────────────────────────────────────────────────────────────
function FieldLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: 'Inter_600SemiBold',
        fontSize: 11,
        color,
        letterSpacing: 0.1 * 11,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {label}
    </Text>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface AddToCollectionSheetProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onConfirm: (data: CollectionFormData) => void;
  // SKU mode (from collection page — search and pick from hotSkus)
  skuId?: string;
  // Catalog/scan mode — pass item data directly, no search needed
  catalogItem?: {
    name: string;
    series: string;
    imageUrl?: string | null;
    median: number;
    categoryId: string;
    cardVariant?: 'raw' | 'graded';
  };
}

const CONDITIONS = ['Sealed', 'Mint', 'Near Mint', 'Loose', 'Damaged'] as const;
type Condition = (typeof CONDITIONS)[number];

const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC'] as const;
type Grader = (typeof GRADERS)[number];

// ─── Main component ──────────────────────────────────────────────────────────
export default function AddToCollectionSheet({
  open,
  skuId,
  catalogItem,
  theme,
  onClose,
  onConfirm,
}: AddToCollectionSheetProps) {
  const hotSkus = useAppStore((s) => s.hotSkus);

  const skuLookup = (id: string | undefined): SKU | undefined =>
    id ? hotSkus.find((s) => s.id === id) : undefined;

  const [selected, setSelected] = useState<string | undefined>(skuId);
  const [searchQuery, setSearchQuery] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<string>(() => {
    if (catalogItem) return String(catalogItem.median);
    const s = skuLookup(skuId);
    return s ? String(s.price.median) : '';
  });
  const [condition, setCondition] = useState<Condition>('Mint');
  const [grader, setGrader] = useState<Grader>('PSA');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');

  const selectedSku = skuLookup(selected);

  // In catalog mode we skip the search view entirely
  const isCatalogMode = !!catalogItem;
  const isSearchView = !isCatalogMode && !selected;

  const filteredSKUs = hotSkus.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.series.toLowerCase().includes(q) ||
      s.short.toLowerCase().includes(q)
    );
  });

  const priceNum = parseFloat(price) || 0;
  const totalCost = priceNum * qty;

  // Current value: catalog mode uses catalogItem.median; SKU mode uses selectedSku median
  const currentValue = isCatalogMode
    ? catalogItem.median * qty
    : selectedSku
    ? selectedSku.price.median * qty
    : 0;

  // Detect graded TCG: catalog mode uses catalogItem props; SKU mode uses selectedSku
  const isTcgGraded = isCatalogMode
    ? catalogItem.categoryId === 'tcg' && catalogItem.cardVariant === 'graded'
    : !!(selectedSku?.category === 'tcg' && selectedSku?.cardVariant === 'graded');

  function handleSelect(id: string) {
    setSelected(id);
    const s = skuLookup(id);
    if (s) setPrice(String(s.price.median));
  }

  function handleConfirm() {
    // In catalog mode we don't need a selectedSku; in SKU mode we require one
    if (!isCatalogMode && !selected) return;

    const data: CollectionFormData = {
      ...(selected ? { skuId: selected } : {}),
      qty,
      purchased: priceNum,
      purchaseDate: new Date().toISOString().slice(0, 10),
      condition: isTcgGraded ? `${grader}${grade ? ` ${grade}` : ''}` : condition,
      notes: notes.trim() || undefined,
      forSale: false,
      ...(isTcgGraded
        ? { cardVariant: 'graded' as const, cardGrader: grader, cardGrade: grade || undefined }
        : isCatalogMode
          ? catalogItem.categoryId === 'tcg'
            ? { cardVariant: (catalogItem.cardVariant ?? 'raw') as 'raw' | 'graded' }
            : {}
          : selectedSku?.category === 'tcg'
            ? { cardVariant: 'raw' as const }
            : {}),
    };

    onConfirm(data);

    // reset
    setQty(1);
    setPrice(isCatalogMode ? String(catalogItem.median) : '');
    setCondition('Mint');
    setGrader('PSA');
    setGrade('');
    setNotes('');
    setSelected(skuId);
    setSearchQuery('');
  }

  // Derive header display values depending on mode
  const headerName = isCatalogMode ? catalogItem.name : selectedSku?.name ?? '';
  const headerSeries = isCatalogMode ? catalogItem.series : selectedSku?.series ?? '';
  const headerMedian = isCatalogMode ? catalogItem.median : selectedSku?.price.median ?? 0;
  const headerImageUrl = isCatalogMode ? catalogItem.imageUrl : selectedSku?.imageUrl;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      theme={theme}
      title="Add to Collection"
    >
      {/* ── Search view (SKU mode only, before item is selected) ── */}
      {isSearchView ? (
        <View>
          {/* Search input */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.surface2,
              borderRadius: RADIUS.card,
              paddingHorizontal: 12,
              height: 44,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: theme.faint, marginRight: 8, fontSize: 15 }}>⌕</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search SKUs…"
              placeholderTextColor={theme.faint}
              style={{
                flex: 1,
                color: theme.text,
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
              }}
              autoFocus
            />
          </View>

          {/* Results */}
          <View>
            {filteredSKUs.map((s, idx) => (
              <Pressable
                key={s.id}
                onPress={() => handleSelect(s.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.surface,
                  borderRadius: theme.radius,
                  padding: 10,
                  marginBottom: idx < filteredSKUs.length - 1 ? 8 : 0,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <ProductThumb sku={s} theme={theme} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      fontFamily: theme.fontDispBold,
                      fontSize: 14,
                      color: theme.text,
                      letterSpacing: -0.2,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 12,
                      color: theme.muted,
                    }}
                  >
                    {fmtPrice(s.price.median)} · {s.series}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        /* ── Form view (catalog mode always; SKU mode after item picked) ── */
        <View>
          {/* Selected item header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.surface2,
              borderRadius: theme.radius,
              padding: 12,
              marginBottom: 20,
            }}
          >
            {/* Thumbnail: catalog mode renders image or placeholder; SKU mode uses ProductThumb */}
            {isCatalogMode ? (
              headerImageUrl ? (
                <Image
                  source={{ uri: headerImageUrl }}
                  style={{ width: 60, height: 60, borderRadius: RADIUS.card }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: RADIUS.card,
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>📦</Text>
                </View>
              )
            ) : selectedSku ? (
              <ProductThumb sku={selectedSku} theme={theme} size={60} />
            ) : null}

            <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: theme.fontDispBold,
                  fontSize: 15,
                  color: theme.text,
                  letterSpacing: -0.2,
                  marginBottom: 2,
                }}
                numberOfLines={1}
              >
                {headerName}
              </Text>
              <Text
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 12,
                  color: theme.muted,
                }}
              >
                Today's median {fmtPrice(headerMedian)}
              </Text>
            </View>

            {/* Change button only available in SKU search mode (not catalog, not fixed skuId) */}
            {!isCatalogMode && !skuId && (
              <Pressable
                onPress={() => setSelected(undefined)}
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
              >
                <Text
                  style={{
                    fontFamily: 'Inter_700Bold',
                    fontSize: 13,
                    color: theme.accent,
                  }}
                >
                  Change
                </Text>
              </Pressable>
            )}
          </View>

          {/* Quantity */}
          <View style={{ marginBottom: 20 }}>
            <FieldLabel label="Quantity" color={theme.faint} />
            <Stepper
              value={qty}
              onDecrement={() => setQty((v) => Math.max(1, v - 1))}
              onIncrement={() => setQty((v) => v + 1)}
              theme={theme}
            />
          </View>

          {/* Purchase price */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.faint, letterSpacing: 0.1 * 11, textTransform: 'uppercase' }}>
                Purchase price
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: priceNum <= 0 ? theme.neg : theme.faint }}>
                {priceNum <= 0 ? 'Required' : '✓ set'}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.surface2,
                borderRadius: RADIUS.card,
                paddingHorizontal: 14,
                height: 48,
                borderWidth: 1,
                borderColor: priceNum <= 0 ? theme.neg + '55' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: 'JetBrainsMono_400Regular',
                  fontSize: 16,
                  color: theme.muted,
                  marginRight: 4,
                }}
              >
                $
              </Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.faint}
                style={{
                  flex: 1,
                  color: theme.text,
                  fontFamily: 'JetBrainsMono_400Regular',
                  fontSize: 16,
                  fontVariant: ['tabular-nums'],
                }}
              />
            </View>
          </View>

          {/* Condition / Grading — graded TCG cards get grader+grade, everything else gets condition chips */}
          {isTcgGraded ? (
            <View style={{ marginBottom: 20 }}>
              <FieldLabel label="Grader" color={theme.faint} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {GRADERS.map((g) => (
                  <Chip
                    key={g}
                    theme={theme}
                    size="xs"
                    active={grader === g}
                    onClick={() => setGrader(g)}
                  >
                    {g}
                  </Chip>
                ))}
              </View>
              <FieldLabel label="Grade" color={theme.faint} />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.surface2,
                  borderRadius: RADIUS.card,
                  paddingHorizontal: 14,
                  height: 48,
                }}
              >
                <TextInput
                  value={grade}
                  onChangeText={setGrade}
                  keyboardType="decimal-pad"
                  placeholder="10, 9.5, 9…"
                  placeholderTextColor={theme.faint}
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontFamily: 'JetBrainsMono_400Regular',
                    fontSize: 16,
                    fontVariant: ['tabular-nums'],
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 20 }}>
              <FieldLabel label="Condition" color={theme.faint} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c}
                    theme={theme}
                    size="xs"
                    active={condition === c}
                    onClick={() => setCondition(c)}
                  >
                    {c}
                  </Chip>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={{ marginBottom: 20 }}>
            <FieldLabel label="Notes" color={theme.faint} />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes…"
              placeholderTextColor={theme.faint}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: theme.surface2,
                borderRadius: RADIUS.card,
                padding: 12,
                color: theme.text,
                fontFamily: 'Inter_400Regular',
                fontSize: 14,
                lineHeight: 21,
                minHeight: 76,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {/* Summary row */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.surface2,
              borderRadius: RADIUS.card,
              padding: 14,
              marginBottom: 20,
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: 'JetBrainsMono_400Regular',
                  fontSize: 9,
                  color: theme.faint,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Total cost
              </Text>
              <Text
                style={{
                  fontFamily: 'JetBrainsMono_700Bold',
                  fontSize: 18,
                  color: theme.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {fmtPrice(totalCost)}
              </Text>
            </View>
            <View
              style={{
                width: 1,
                backgroundColor: theme.hairline,
                marginVertical: 2,
              }}
            />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontFamily: 'JetBrainsMono_400Regular',
                  fontSize: 9,
                  color: theme.faint,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Current value
              </Text>
              <Text
                style={{
                  fontFamily: 'JetBrainsMono_700Bold',
                  fontSize: 18,
                  color: theme.pos,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {fmtPrice(currentValue)}
              </Text>
            </View>
          </View>

          {/* CTA */}
          <PrimaryButton
            theme={theme}
            size="lg"
            onPress={handleConfirm}
            disabled={(!isCatalogMode && !selected) || priceNum <= 0}
          >
            Add to collection
          </PrimaryButton>
        </View>
      )}
    </Sheet>
  );
}
