// ─── notificationService ─────────────────────────────────────────────────────
// In-app notifications and push registration, for every role.
//
// The backend raises one notification per event and fans it out three ways: a
// stored row (history + read state), an SSE frame (live web), and an Expo push
// (this app, even when closed). This module owns the phone's half of that: it
// registers the device's push token so the backend can reach it, and reads the
// stored rows for the notification screen and the bell badge.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api, getStoredUserId } from './apiClient';

/**
 * The Expo token this device last registered.
 *
 * Kept locally so sign-out can withdraw it without asking Expo for it again —
 * that call needs permission and a network round trip, neither of which is
 * guaranteed at the moment somebody is logging out.
 */
const TOKEN_KEY = 'nessa.push.token';

/**
 * The EAS project a push token is issued against.
 *
 * Expo will not mint a token without it, so when this is missing push cannot
 * work on a real device no matter what permission the user grants. It is
 * surfaced rather than swallowed: "this build has no push project configured"
 * and "you denied notifications" look identical from the outside but need
 * completely different fixes.
 */
function pushProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || null;
}

// Show notifications while the app is in the foreground too — otherwise a
// message that arrives while the user is reading something else is silent.
//
// `shouldShowBanner` and `shouldShowList` replaced `shouldShowAlert`, which is
// deprecated and no longer sufficient on its own: with only the old field set,
// a notification arriving while the app was open displayed nothing. The old
// field stays for any older runtime that still reads it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ask for permission, get this device's Expo push token, and register it with
 * the backend so notifications can reach it.
 *
 * Safe to call on every launch: the backend upserts by token, and a device that
 * has already granted permission is not prompted again.
 *
 * @returns the token, or null when unavailable (simulator, permission refused).
 */
export async function registerForPushNotifications() {
  try {
    // Push tokens are only issued to real devices. `Constants.isDevice` used to
    // guard this, but it no longer exists on expo-constants — the check was
    // reading undefined and could never fire. A simulator now falls through to
    // getExpoPushTokenAsync, which throws and is caught below; the guard is not
    // reinstated because that would mean pulling in expo-device for one boolean.

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return null;

    // Android needs a channel before anything will display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = pushProjectId();
    if (!projectId) {
      console.warn(
        '[push] No EAS projectId in app.json (extra.eas.projectId) — Expo cannot issue a '
        + 'push token. Run `eas init` in the mobile project to create one.',
      );
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData?.data;
    if (!token) return null;

    const uid = await getStoredUserId();
    if (!uid) return null;

    await api('/api/v1/push-tokens', {
      method: 'POST',
      body: { userId: uid, token, platform: Platform.OS },
    }).catch(() => null); // Registration is best-effort; never block startup.

    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    return token;
  } catch (e) {
    console.warn('Push registration failed:', e?.message);
    return null;
  }
}

/**
 * Withdraw this device's push token.
 *
 * Called on sign-out. Without it the token stays registered against the account
 * that just left, so the next person holding the handset keeps seeing that
 * user's notifications on the lock screen — including message previews. On a
 * shared or handed-on phone that is a disclosure, not an annoyance.
 *
 * Never throws: signing out must not be blocked by a failed network call.
 */
export async function unregisterPushNotifications() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    await api('/api/v1/push-tokens/unregister', {
      method: 'POST',
      body: { token },
    }).catch(() => null);
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * What is actually true about push on this device, for the settings screen.
 *
 * Three separate things can each break push, and they need different fixes, so
 * they are reported separately rather than collapsed into one "enabled" flag:
 * the OS permission, whether a token reached the server, and the account-level
 * switch.
 */
export async function getPushStatus() {
  const out = {
    permission: 'undetermined',
    canAskAgain: true,
    deviceRegistered: false,
    devices: 0,
    preferenceOn: true,
    // False means the BUILD cannot do push at all — nothing the user does on
    // this screen will change that, so the screen must not ask them to try.
    configured: Boolean(pushProjectId()),
  };

  try {
    const perm = await Notifications.getPermissionsAsync();
    out.permission = perm?.status || 'undetermined';
    out.canAskAgain = perm?.canAskAgain !== false;
  } catch { /* leave the defaults */ }

  try {
    const uid = await getStoredUserId();
    if (uid) {
      const list = await api(`/api/v1/push-tokens?userId=${encodeURIComponent(uid)}`)
        .catch(() => []);
      const tokens = Array.isArray(list) ? list : [];
      out.devices = tokens.length;
      const mine = await AsyncStorage.getItem(TOKEN_KEY);
      // "Registered" means THIS handset, not merely that the account has some
      // device somewhere — an old phone would otherwise report a green tick here.
      out.deviceRegistered = Boolean(mine) && tokens.some((t) => t.token === mine);
    }
  } catch { /* leave the defaults */ }

  try {
    const prefs = await api('/api/v1/notification-preferences');
    out.preferenceOn = prefs?.pushEnabled !== false;
  } catch { /* leave the defaults */ }

  return out;
}

/** Ask the server to push to my own devices, so push can be tested directly. */
export async function sendTestPush() {
  return api('/api/v1/push-tokens/test', { method: 'POST' });
}

/**
 * Register now, if permission already exists, without prompting.
 *
 * Registration ran only at sign-in, so a session restored from storage — the
 * usual case, since people rarely sign out — never re-registered. A token that
 * had been rotated or pruned as dead stayed missing until the next manual
 * sign-in, and push silently stopped working.
 */
export async function ensurePushRegistered() {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm?.status !== 'granted') return null;
    return await registerForPushNotifications();
  } catch {
    return null;
  }
}

/** The signed-in user's notifications, newest first. */
export async function fetchNotifications() {
  const list = await api('/api/v1/notifications/mine').catch(() => []);
  return Array.isArray(list) ? list : [];
}

/** Unread count for the bell badge. */
export async function fetchUnreadCount() {
  const res = await api('/api/v1/notifications/mine/unread-count').catch(() => null);
  return Number(res?.count) || 0;
}

/** One notification, for the detail screen. */
export async function fetchNotification(id) {
  return api(`/api/v1/notifications/mine/${id}`).catch(() => null);
}

export async function markNotificationRead(id) {
  return api(`/api/v1/notifications/mine/${id}/read`, { method: 'POST' }).catch(() => null);
}

export async function markAllNotificationsRead() {
  return api('/api/v1/notifications/mine/read-all', { method: 'POST' }).catch(() => null);
}

/**
 * Icon name (Ionicons) for an event type, so the list is scannable.
 * Keyed on the family before the first dot: "appointment.booked" → appointment.
 */
export function iconForEvent(eventType) {
  const family = String(eventType || '').split('.')[0];
  switch (family) {
    case 'appointment': return 'calendar-outline';
    case 'message': return 'chatbubble-ellipses-outline';
    case 'prescription': return 'medkit-outline';
    case 'diagnostic': return 'flask-outline';
    case 'therapy': return 'heart-outline';
    case 'couple': return 'people-outline';
    case 'support': return 'help-buoy-outline';
    case 'account': return 'person-circle-outline';
    default: return 'notifications-outline';
  }
}

/** "just now" / "12m" / "3h" / "5d". */
export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
