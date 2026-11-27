import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * A random id for this install, kept in secure storage (it survives log out).
 * Sent at sign-in and with the 2-step code, so 2-step sign-in only asks on a new phone.
 * The server only keeps a hash of it.
 */

const KEY = 'device_id';
let cached: string | null = null;
let pending: Promise<string | null> | null = null;

export const getDeviceId = async (): Promise<string | null> => {
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEY);
        if (saved) return (cached = saved);
        const id = Crypto.randomUUID();
        await SecureStore.setItemAsync(KEY, id);
        return (cached = id);
      } catch {
        // No secure storage: sign-in still works, it just asks for a code each time.
        return null;
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
};

/** "iOS 18.2" / "Android 34": a plain label for the trusted phone (no device name, which often has the owner's). */
export const getDeviceLabel = () => `${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS} ${Platform.Version}`;

/** The fields the login and 2-step endpoints take. */
export const deviceFields = async (): Promise<{ device_id?: string; device_label?: string }> => {
  const device_id = await getDeviceId();
  return device_id ? { device_id, device_label: getDeviceLabel() } : {};
};
