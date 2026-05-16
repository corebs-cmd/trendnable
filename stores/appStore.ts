import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CollectionItem, DBUser, SKU } from '../lib/types';
import * as api from '../lib/api';

interface AppState {
  // Auth
  user: DBUser | null;
  isPremium: boolean;
  isAuthReady: boolean;

  // UI
  isDark: boolean;

  // Onboarding
  hasOnboarded: boolean;

  // Hot SKU catalog (loaded from Supabase on app start)
  hotSkus: SKU[];
  skusLoading: boolean;
  skusError: string | null;

  // Collection
  collection: CollectionItem[];

  // Watchlist
  watchlist: string[];

  // Preferences
  followedFandoms: string[];
  followedCategories: string[];

  // Actions
  setUser: (user: DBUser | null) => void;
  setIsPremium: (premium: boolean) => void;
  setIsAuthReady: (ready: boolean) => void;
  setIsDark: (dark: boolean) => void;
  setHasOnboarded: (v: boolean) => void;
  setFollowedFandoms: (fandoms: string[]) => void;
  setFollowedCategories: (cats: string[]) => void;

  // Loads hot SKU catalog from Supabase (no auth required)
  loadHotSkus: () => Promise<void>;
  retryLoadHotSkus: () => Promise<void>;

  // Loads user collection + watchlist from Supabase
  loadUserData: (userId: string) => Promise<void>;

  // Collection
  addToCollection: (item: CollectionItem) => void;
  removeFromCollection: (skuId: string) => void;
  updateCollectionItem: (skuId: string, updates: Partial<CollectionItem>) => void;

  // Watchlist — addToWatchlist returns false if free cap is hit
  addToWatchlist: (skuId: string) => boolean;
  removeFromWatchlist: (skuId: string) => void;
  toggleWatchlist: (skuId: string) => boolean;
  isWatching: (skuId: string) => boolean;
  isInCollection: (skuId: string) => boolean;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  isPremium: false,
  isAuthReady: false,
  isDark: true,
  hasOnboarded: false,
  hotSkus: [],
  skusLoading: false,
  skusError: null,
  collection: [],
  watchlist: [],
  followedFandoms: [],
  followedCategories: [],

  setUser: (user) => set({ user }),
  setIsPremium: (isPremium) => set({ isPremium }),
  setIsAuthReady: (isAuthReady) => set({ isAuthReady }),

  setIsDark: (isDark) => {
    set({ isDark });
    AsyncStorage.setItem('isDark', JSON.stringify(isDark)).catch(() => {});
  },

  setHasOnboarded: (hasOnboarded) => {
    set({ hasOnboarded });
    AsyncStorage.setItem('hasOnboarded', JSON.stringify(hasOnboarded)).catch(() => {});
  },

  setFollowedFandoms: (followedFandoms) => set({ followedFandoms }),
  setFollowedCategories: (followedCategories) => set({ followedCategories }),

  loadHotSkus: async () => {
    set({ skusLoading: true, skusError: null });
    try {
      const skus = await api.fetchHotSkus();
      set({ hotSkus: skus, skusLoading: false });
    } catch (e: any) {
      console.error('loadHotSkus failed:', e);
      set({ skusLoading: false, skusError: e?.message ?? 'Failed to load' });
    }
  },

  retryLoadHotSkus: async () => {
    await (useAppStore.getState() as AppState).loadHotSkus();
  },

  loadUserData: async (userId) => {
    const [collection, watchlist] = await Promise.all([
      api.fetchCollection(userId),
      api.fetchWatchlist(userId),
    ]);
    set({ collection, watchlist });
  },

  addToCollection: (item) => {
    set((state) => {
      const existing = state.collection.find((c) => c.skuId === item.skuId);
      if (existing) {
        return {
          collection: state.collection.map((c) =>
            c.skuId === item.skuId ? { ...c, qty: c.qty + item.qty } : c
          ),
        };
      }
      return { collection: [...state.collection, item] };
    });
    const userId = get().user?.id;
    if (userId) {
      const updated = get().collection.find((c) => c.skuId === item.skuId) ?? item;
      api.upsertCollectionItem(userId, updated).catch(console.error);
    }
  },

  removeFromCollection: (skuId) => {
    set((state) => ({
      collection: state.collection.filter((c) => c.skuId !== skuId),
    }));
    const userId = get().user?.id;
    if (userId) api.deleteCollectionItem(userId, skuId).catch(console.error);
  },

  updateCollectionItem: (skuId, updates) => {
    set((state) => ({
      collection: state.collection.map((c) =>
        c.skuId === skuId ? { ...c, ...updates } : c
      ),
    }));
    const userId = get().user?.id;
    if (userId) {
      const updated = get().collection.find((c) => c.skuId === skuId);
      if (updated) api.upsertCollectionItem(userId, updated).catch(console.error);
    }
  },

  addToWatchlist: (skuId) => {
    const { watchlist, isPremium } = get();
    if (watchlist.includes(skuId)) return true;
    if (!isPremium && watchlist.length >= 20) return false;
    set({ watchlist: [...watchlist, skuId] });
    const userId = get().user?.id;
    if (userId) api.addWatchlistItem(userId, skuId).catch(console.error);
    return true;
  },

  removeFromWatchlist: (skuId) => {
    set((state) => ({
      watchlist: state.watchlist.filter((id) => id !== skuId),
    }));
    const userId = get().user?.id;
    if (userId) api.removeWatchlistItem(userId, skuId).catch(console.error);
  },

  toggleWatchlist: (skuId) => {
    const { watchlist } = get();
    if (watchlist.includes(skuId)) {
      get().removeFromWatchlist(skuId);
      return true;
    }
    return get().addToWatchlist(skuId);
  },

  isWatching: (skuId) => get().watchlist.includes(skuId),
  isInCollection: (skuId) => get().collection.some((c) => c.skuId === skuId),
}));
