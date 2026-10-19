import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiClient';

/**
 * Sign people out after a period of inactivity, like the web does.
 *
 * The app used to keep a session forever: closed for days, it reopened straight
 * onto the last person's dashboard, so a second person on the same phone booked
 * (and paid) under that account. Now the time the app spends in the background
 * or closed is measured, and past the limit set in System Config
 * (security → sessionTimeoutMinutes, default 60) the session is ended and the
 * person signs in again (Face ID still works for that).
 */
const LAST_ACTIVE = 'nessa.lastActiveAt';
const TIMEOUT_CACHE = 'nessa.sessionTimeoutMin';
const DEFAULT_MINUTES = 60;

export async function touchActivity() {
  try { await AsyncStorage.setItem(LAST_ACTIVE, String(Date.now())); } catch { /* ignore */ }
}

export async function clearActivity() {
  try { await AsyncStorage.removeItem(LAST_ACTIVE); } catch { /* ignore */ }
}

async function timeoutMinutes() {
  // Freshest value from the server; the cached one when offline.
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/system-config/public/settings`);
    if (res.ok) {
      const json = await res.json();
      const m = Number(json?.security?.sessionTimeoutMinutes);
      if (m > 0) {
        AsyncStorage.setItem(TIMEOUT_CACHE, String(m)).catch(() => {});
        return m;
      }
    }
  } catch { /* offline */ }
  const cached = Number(await AsyncStorage.getItem(TIMEOUT_CACHE).catch(() => null));
  return cached > 0 ? cached : DEFAULT_MINUTES;
}

/** Has the app been unused for longer than the limit? */
export async function isIdleExpired() {
  const raw = await AsyncStorage.getItem(LAST_ACTIVE).catch(() => null);
  if (!raw) return false; // never recorded (first run after this update): start counting now
  const minutes = await timeoutMinutes();
  return Date.now() - Number(raw) > minutes * 60 * 1000;
}
