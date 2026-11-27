import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import api from './api';

/**
 * Push notifications: permission, the device's Expo push token, and telling the backend about it.
 * The backend sends through Expo (see backend push.service.ts).
 */

const TOKEN_KEY = 'gb_push_token';

// Show alerts as banners even while the app is open (the in-app list updates over the socket too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export const getPushPermission = async (): Promise<PushPermission> => {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  // Must match channelId in the backend's push messages.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Auction alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#4F7BFF',
  });
};

const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Get this device's Expo push token and save it on the backend. Never throws. */
const syncToken = async (): Promise<void> => {
  try {
    // Needs a real device: simulators can't get an APNs token, so this fails or never returns.
    const { data: token } = await withTimeout(
      Notifications.getExpoPushTokenAsync({ projectId: projectId() }),
      20000
    );
    await api.post('/notifications/push-token', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    if (__DEV__) console.warn('[push] could not register this device:', error);
  }
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms)),
  ]);

/**
 * Turn on push for the signed-in user on this device.
 * `ask`: show the iOS/Android permission prompt if the user hasn't decided yet.
 * Resolves with the permission as soon as it's known; the token is saved in the background.
 */
export const registerForPush = async ({ ask }: { ask: boolean }): Promise<PushPermission> => {
  try {
    await ensureAndroidChannel();
    let permission = await getPushPermission();
    if (permission === 'undetermined' && ask) {
      const res = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      });
      permission = res.granted ? 'granted' : 'denied';
    }
    if (permission === 'granted') void syncToken();
    return permission;
  } catch (error) {
    if (__DEV__) console.warn('[push] permission check failed:', error);
    return 'undetermined';
  }
};

/** Stop pushes to this device (call while still signed in, e.g. right before logout). */
export const unregisterPush = async (): Promise<void> => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await api.delete('/notifications/push-token', { data: { token } });
  } catch (error) {
    if (__DEV__) console.warn('[push] could not unregister this device:', error);
  } finally {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }
};

/** Once denied, iOS never shows the prompt again; only the Settings app can turn it back on. */
export const openSystemNotificationSettings = () => Linking.openSettings();

/** Where a tapped alert should take you. */
export const routeForNotification = (
  data: Record<string, unknown> | undefined
): { name: string; params?: Record<string, unknown> } | null => {
  if (!data) return null;
  // "Support replied": the chat screen has the same name in the buyer and seller apps.
  if (data.route === 'SupportChat') return { name: 'SupportChat' };
  const orderId = (data.orderId ?? data.order_id) as string | undefined;
  const auctionId = (data.auctionId ?? data.auction_id) as string | undefined;
  const missedPaymentId = data.missedPaymentId as string | undefined;
  const disputeId = data.disputeId as string | undefined;
  if (missedPaymentId) return { name: 'MissedPayment', params: { missedPaymentId } };
  if (disputeId) return { name: 'Case', params: { disputeId } };
  if (orderId && data.secondChance) return { name: 'SecondChance', params: { orderId } };
  if (orderId) return { name: 'OrderDetail', params: { orderId } };
  if (auctionId) return { name: 'AuctionDetail', params: { auctionId } };
  return { name: 'Notifications' };
};

/** The three group switches older screens use (still honoured by the server). */
export interface AlertPrefs {
  bids: boolean;
  orders: boolean;
  marketing: boolean;
}

/** Everything on Profile › Notifications: one switch per row, channels and quiet hours. */
export interface NotificationSettings extends AlertPrefs {
  outbid: boolean;
  ending_soon: boolean;
  autobid_max: boolean;
  won: boolean;
  payment_reminders: boolean;
  delivery_updates: boolean;
  dispute_updates: boolean;
  saved_search: boolean;
  channels: { push: boolean; email: boolean; sms: boolean };
  quiet_hours: boolean;
}

export type NotificationSettingsChange = Partial<Omit<NotificationSettings, 'channels'>> & {
  channels?: Partial<NotificationSettings['channels']>;
};

export const getAlertPrefs = async (): Promise<NotificationSettings> => {
  const res = await api.get('/notifications/preferences');
  return res.data.data;
};

export const saveAlertPrefs = async (changes: NotificationSettingsChange): Promise<NotificationSettings> => {
  const res = await api.put('/notifications/preferences', changes);
  return res.data.data;
};
