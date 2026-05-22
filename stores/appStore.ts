import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CollectionItem, DBUser, SKU, PriceAlert, AppNotification, CatalogWatchlistItem, CatalogCollectionItem } from '../lib/types';
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

  // Catalog watchlist + collection (scan-based, no SKU yet)
  catalogWatchlist: CatalogWatchlistItem[];
  catalogCollection: CatalogCollectionItem[];

  // Price alerts + notifications
  priceAlerts: PriceAlert[];
  notifications: AppNotification[];
  unreadCount: number;

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

  // Catalog watchlist actions
  addCatalogToWatchlist: (item: CatalogWatchlistItem) => boolean;
  removeCatalogFromWatchlist: (catalogId: string) => void;
  isWatchingCatalog: (catalogId: string) => boolean;

  // Catalog collection actions
  addCatalogToCollection: (item: CatalogCollectionItem) => void;
  removeCatalogFromCollection: (catalogId: string) => void;
  isCatalogInCollection: (catalogId: string) => boolean;

  // Price alerts
  loadPriceAlerts: (userId: string) => Promise<void>;
  addPriceAlert: (skuId: string, direction: 'above' | 'below', targetPrice: number) => Promise<void>;
  removePriceAlert: (alertId: string) => void;
  deleteAlertsForSku: (skuId: string) => void;

  // Notifications
  loadNotifications: (userId: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => void;
  reactivatePriceAlert: (alertId: string, notificationId: string) => void;
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
  catalogWatchlist: [],
  catalogCollection: [],
  priceAlerts: [],
  notifications: [],
  unreadCount: 0,
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
    const [collection, watchlist, priceAlerts, notifications, catalogWatchlist, catalogCollection] = await Promise.all([
      api.fetchCollection(userId),
      api.fetchWatchlist(userId),
      api.fetchPriceAlerts(userId),
      api.fetchNotifications(userId),
      api.fetchCatalogWatchlist(userId),
      api.fetchCatalogCollection(userId),
    ]);
    set({
      collection,
      watchlist,
      priceAlerts,
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
      catalogWatchlist,
      catalogCollection,
    });
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
    const { watchlist, catalogWatchlist, isPremium } = get();
    if (watchlist.includes(skuId)) return true;
    if (!isPremium && watchlist.length + catalogWatchlist.length >= 20) return false;
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

  addCatalogToWatchlist: (item) => {
    const { watchlist, catalogWatchlist, isPremium } = get();
    if (catalogWatchlist.some((c) => c.catalogId === item.catalogId)) return true;
    if (!isPremium && watchlist.length + catalogWatchlist.length >= 20) return false;
    set({ catalogWatchlist: [item, ...catalogWatchlist] });
    const userId = get().user?.id;
    if (userId) api.addCatalogWatchlistItem(userId, item.catalogId).catch(console.error);
    return true;
  },

  removeCatalogFromWatchlist: (catalogId) => {
    set((state) => ({
      catalogWatchlist: state.catalogWatchlist.filter((c) => c.catalogId !== catalogId),
    }));
    const userId = get().user?.id;
    if (userId) api.removeCatalogWatchlistItem(userId, catalogId).catch(console.error);
  },

  isWatchingCatalog: (catalogId) => get().catalogWatchlist.some((c) => c.catalogId === catalogId),

  addCatalogToCollection: (item) => {
    set((state) => {
      const existing = state.catalogCollection.find((c) => c.catalogId === item.catalogId);
      if (existing) {
        return {
          catalogCollection: state.catalogCollection.map((c) =>
            c.catalogId === item.catalogId ? { ...c, qty: c.qty + item.qty } : c
          ),
        };
      }
      return { catalogCollection: [item, ...state.catalogCollection] };
    });
    const userId = get().user?.id;
    if (userId) {
      const updated = get().catalogCollection.find((c) => c.catalogId === item.catalogId) ?? item;
      api.upsertCatalogCollectionItem(userId, item.catalogId, updated).catch(console.error);
    }
  },

  removeCatalogFromCollection: (catalogId) => {
    set((state) => ({
      catalogCollection: state.catalogCollection.filter((c) => c.catalogId !== catalogId),
    }));
    const userId = get().user?.id;
    if (userId) api.deleteCatalogCollectionItem(userId, catalogId).catch(console.error);
  },

  isCatalogInCollection: (catalogId) => get().catalogCollection.some((c) => c.catalogId === catalogId),

  loadPriceAlerts: async (userId) => {
    const priceAlerts = await api.fetchPriceAlerts(userId);
    set({ priceAlerts });
  },

  addPriceAlert: async (skuId, direction, targetPrice) => {
    const userId = get().user?.id;
    if (!userId) return;
    const alert = await api.createPriceAlert(userId, skuId, direction, targetPrice);
    if (alert) {
      set((state) => ({ priceAlerts: [alert, ...state.priceAlerts] }));
    }
  },

  removePriceAlert: (alertId) => {
    set((state) => ({ priceAlerts: state.priceAlerts.filter((a) => a.id !== alertId) }));
    api.deletePriceAlert(alertId).catch(console.error);
  },

  deleteAlertsForSku: (skuId) => {
    const toDelete = get().priceAlerts.filter((a) => a.skuId === skuId);
    set((state) => ({ priceAlerts: state.priceAlerts.filter((a) => a.skuId !== skuId) }));
    toDelete.forEach((a) => api.deletePriceAlert(a.id).catch(console.error));
  },

  loadNotifications: async (userId) => {
    const notifications = await api.fetchNotifications(userId);
    set({ notifications, unreadCount: notifications.filter((n) => !n.isRead).length });
  },

  markNotificationRead: (notificationId) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.isRead).length };
    });
    api.markNotificationRead(notificationId).catch(console.error);
  },

  reactivatePriceAlert: (alertId, notificationId) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      const priceAlerts = state.priceAlerts.map((a) =>
        a.id === alertId ? { ...a, isActive: true, triggeredAt: null } : a
      );
      return { notifications, priceAlerts, unreadCount: notifications.filter((n) => !n.isRead).length };
    });
    api.reactivatePriceAlert(alertId).catch(console.error);
    api.markNotificationRead(notificationId).catch(console.error);
  },
}));
