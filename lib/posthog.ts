import PostHog from 'posthog-react-native';

const key  = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';

export const posthog = new PostHog(key, {
  host:     'https://us.i.posthog.com',
  // Disable when no key is set (dev without key, or unit tests)
  disabled: !key || key === 'YOUR_POSTHOG_KEY_HERE',
  // Session replay disabled — bills extra on mobile
  enableSessionReplay: false,
});
