// ─── notificationService ─────────────────────────────────────────────────────
// In-app notifications and push registration, for every role.
//
// The backend raises one notification per event and fans it out three ways: a
// stored row (history + read state), an SSE frame (live web), and an Expo push
// (this app, even when closed). This module owns the phone's half of that: it
// registers the device's push token so the backend can reach it, and reads the
// stored rows for the notification screen and the bell badge.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api, getStoredUserId } from './apiClient';

// Show notifications while the app is in the foreground too — otherwise a
// message that arrives while the user is reading something else is silent.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
    // Push tokens are only issued to real devices; a simulator returns an error
    // that would otherwise be logged as a failure on every launch.
    if (!Constants.isDevice && Constants.isDevice !== undefined) return null;

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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      || Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenData?.data;
    if (!token) return null;

    const uid = await getStoredUserId();
    if (!uid) return null;

    await api('/api/v1/push-tokens', {
      method: 'POST',
      body: { userId: uid, token, platform: Platform.OS },
    }).catch(() => null); // Registration is best-effort; never block startup.

    return token;
  } catch (e) {
    console.warn('Push registration failed:', e?.message);
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
