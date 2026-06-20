import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Show alerts, play sound, and set badge when a notification arrives in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Trendnable',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#CC220B',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    // Native APNs device token — goes directly to Apple, no Expo relay
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data as string;
  } catch (err) {
    console.warn('Failed to get device push token:', err);
    return null;
  }
}
