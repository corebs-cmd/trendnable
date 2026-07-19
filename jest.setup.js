// Mock native modules that can't run in Jest environment
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-url-polyfill/auto', () => {});

// Mock Supabase client so tests don't need real credentials
jest.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn(() => ({ select: jest.fn(), insert: jest.fn(), update: jest.fn(), eq: jest.fn() })),
    functions: {
      invoke: jest.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
  },
}));

// Mock React Native Linking (used in downloadCollectionExport)
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
}));
