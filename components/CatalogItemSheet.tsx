import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import Sheet from '@/components/Sheet';
import { Theme, categoryColor } from '@/lib/theme';
import { catById, fmtPrice } from '@/lib/appConfig';
import { useAppStore } from '@/stores/appStore';
import { fetchCatalogItemById } from '@/lib/api';

interface CatalogItemSheetProps {
  open: boolean;
  catalogId: string | null;
  theme: Theme;
  onClose: () => void;
}

function Thumb({ uri, categoryId, size, theme }: {
  uri: string | null; categoryId: string; size: number; theme: Theme;
}) {
  const [errored, setErrored] = useState(false);
  const c = categoryColor(categoryId, theme.dark);
  const cat = catById(categoryId);

  if (uri && !errored) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: Math.max(8, size * 0.18) }}
        resizeMode="cover"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <View style={{
      width: size, height: size,
      borderRadius: Math.max(8, size * 0.18),
      backgroundColor: c.tint,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: size * 0.24,
        color: c.ink, letterSpacing: 0.5, textTransform: 'uppercase',
      }}>
        {cat?.short?.slice(0, 3) ?? '???'}
      </Text>
    </View>
  );
}

export default function CatalogItemSheet({ open, catalogId, theme, onClose }: CatalogItemSheetProps) {
  const addCatalogToWatchlist    = useAppStore((s) => s.addCatalogToWatchlist);
  const removeCatalogFromWatchlist = useAppStore((s) => s.removeCatalogFromWatchlist);
  const addCatalogToCollection   = useAppStore((s) => s.addCatalogToCollection);
  const removeCatalogFromCollection = useAppStore((s) => s.removeCatalogFromCollection);
  const isWatchingCatalog        = useAppStore((s) => s.isWatchingCatalog);
  const isCatalogInCollection    = useAppStore((s) => s.isCatalogInCollection);
  const catalogWatchlist         = useAppStore((s) => s.catalogWatchlist);
  const catalogCollection        = useAppStore((s) => s.catalogCollection);

  const [loading, setLoading] = useState(false);
  const [dbItem, setDbItem] = useState<Awaited<ReturnType<typeof fetchCatalogItemById>>>(null);

  const watching    = catalogId ? isWatchingCatalog(catalogId) : false;
  const inCollection = catalogId ? isCatalogInCollection(catalogId) : false;

  const watchItem    = catalogId ? catalogWatchlist.find((c) => c.catalogId === catalogId) : null;
  const collectItem  = catalogId ? catalogCollection.find((c) => c.catalogId === catalogId) : null;

  const name        = watchItem?.name ?? collectItem?.name ?? dbItem?.name ?? '';
  const short       = watchItem?.short ?? collectItem?.short ?? dbItem?.short ?? '';
  const categoryId  = watchItem?.categoryId ?? collectItem?.categoryId ?? dbItem?.categoryId ?? '';
  const price       = watchItem?.price ?? collectItem?.currentPrice ?? dbItem?.priceLatest ?? null;
  const imageUrl    = watchItem?.imageUrl ?? collectItem?.imageUrl ?? dbItem?.imageUrl ?? null;
  const scoreEstimate = watchItem?.scoreEstimate ?? null;

  useEffect(() => {
    if (!open || !catalogId) return;
    if (watchItem || collectItem) return;
    setLoading(true);
    fetchCatalogItemById(catalogId)
      .then(setDbItem)
      .finally(() => setLoading(false));
  }, [open, catalogId]);

  if (!catalogId) return null;

  const handleWatch = () => {
    if (!catalogId || !name) return;
    if (watching) {
      removeCatalogFromWatchlist(catalogId);
    } else {
      addCatalogToWatchlist({
        catalogId, name, short, categoryId,
        fandomId: null, price, scoreEstimate,
        addedAt: new Date().toISOString(),
        imageUrl,
      });
    }
  };

  const handleCollect = () => {
    if (!catalogId || !name) return;
    if (inCollection) {
      removeCatalogFromCollection(catalogId);
    } else {
      addCatalogToCollection({
        catalogId, name, short, categoryId,
        qty: 1,
        purchased: price ?? 0,
        purchaseDate: new Date().toISOString().split('T')[0],
        condition: 'Good',
        currentPrice: price,
        imageUrl,
      });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Product Details">
      {loading ? (
        <ActivityIndicator color={theme.accent} size="large" style={{ marginVertical: 40 }} />
      ) : (
        <>
          {/* Identity */}
          <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
            <Thumb uri={imageUrl} categoryId={categoryId} size={72} theme={theme} />
            <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 17, color: theme.text,
                letterSpacing: -0.3, lineHeight: 22,
              }} numberOfLines={2}>
                {name}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(() => {
                  const c = categoryColor(categoryId, theme.dark);
                  const cat = catById(categoryId);
                  return (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.tint }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: c.ink, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                        {cat?.short ?? categoryId}
                      </Text>
                    </View>
                  );
                })()}
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: theme.surface2, borderWidth: 0.5, borderColor: theme.hairline,
                }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.faint, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Pending SKU
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Price */}
          {price != null && (
            <View style={{
              backgroundColor: theme.surface2, borderRadius: theme.radius,
              padding: 14, marginBottom: 14,
            }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 }}>
                Market Price
              </Text>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 28, color: theme.text, letterSpacing: -0.5 }}>
                {fmtPrice(price)}
              </Text>
            </View>
          )}

          {/* Collection info */}
          {inCollection && collectItem && (
            <View style={{
              backgroundColor: theme.surface2, borderRadius: theme.radius,
              padding: 14, marginBottom: 14, gap: 4,
            }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 4 }}>
                Your Item
              </Text>
              <Text style={{ fontFamily: theme.fontMono, fontSize: 13, color: theme.text }}>
                ×{collectItem.qty} · {collectItem.condition}
              </Text>
              <Text style={{ fontFamily: theme.fontMono, fontSize: 13, color: theme.muted }}>
                Paid {fmtPrice(collectItem.purchased)} on {collectItem.purchaseDate}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={handleWatch}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 16, borderRadius: theme.radius,
                backgroundColor: watching ? theme.surface2 : theme.accent,
                borderWidth: watching ? 1 : 0, borderColor: theme.hairline,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                stroke={watching ? theme.text : theme.accentInk}
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill={watching ? theme.text : theme.accentInk} />
              </Svg>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: watching ? theme.text : theme.accentInk }}>
                {watching ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleCollect}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 16, borderRadius: theme.radius,
                backgroundColor: theme.surface2,
                borderWidth: 1, borderColor: inCollection ? theme.neg : theme.hairline,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                stroke={inCollection ? theme.neg : theme.text}
                strokeWidth={2.2} strokeLinecap="round">
                {inCollection
                  ? <Path d="M18 6L6 18M6 6l12 12" />
                  : <Path d="M12 5v14M5 12h14" />
                }
              </Svg>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: inCollection ? theme.neg : theme.text }}>
                {inCollection ? 'Remove from Collection' : 'Add to Collection'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}
