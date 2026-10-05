import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The backend runs on the development machine, whose LAN address changes every
// time it rejoins a network — a personal hotspot hands out a different
// 172.20.10.x lease on each connect. A hardcoded literal here meant every
// reconnect broke the whole app with "Network request timed out" until someone
// edited this line by hand. Derive the host instead from whatever machine Metro
// is already serving this bundle from: by definition that is the same machine.
const API_PORT = 8085;

// Used only when no dev-server host can be read — a release build or a
// standalone binary. Point this at the deployed backend when there is one.
const FALLBACK_HOST = '172.20.10.5';

/** The "host:port" Expo recorded for the dev server, across SDK/manifest shapes. */
function devServerHostUri() {
  return (
    Constants.expoConfig?.hostUri
    || Constants.expoGoConfig?.debuggerHost
    || Constants.manifest2?.extra?.expoClient?.hostUri
    || ''
  );
}

function resolveApiHost() {
  const host = String(devServerHostUri()).split('/')[0].split(':')[0];
  if (!host) return FALLBACK_HOST;
  // An Android emulator's own loopback is the emulator, not the Mac — it reaches
  // the host machine only through 10.0.2.2.
  if (host === 'localhost' || host === '127.0.0.1') {
    return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  }
  return host;
}

// EXPO_PUBLIC_API_BASE wins when set, so a build can be aimed at staging or
// production without touching this file.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || `http://${resolveApiHost()}:${API_PORT}`;

if (__DEV__) console.log('[apiClient] API_BASE =', API_BASE);

export const STORAGE_KEYS = {
  token: 'th.token',
  refreshToken: 'th.refreshToken',
  userId: 'th.userId',
  role: 'th.role',
  nurseId: 'th.nurseId',
  // Paystack needs a real email for every charge and receipt. Nothing else
  // stored here yields one, and there is no /me endpoint to ask.
  email: 'th.email',
};

export async function getStoredToken() {
  return AsyncStorage.getItem(STORAGE_KEYS.token);
}

export async function getStoredUserId() {
  return AsyncStorage.getItem(STORAGE_KEYS.userId);
}

export async function getStoredRole() {
  return AsyncStorage.getItem(STORAGE_KEYS.role);
}

export async function getStoredNurseId() {
  return AsyncStorage.getItem(STORAGE_KEYS.nurseId);
}

export async function getStoredEmail() {
  return AsyncStorage.getItem(STORAGE_KEYS.email);
}

export async function storeSession({ token, refreshToken, userId, role, email }) {
  const pairs = [
    [STORAGE_KEYS.token, token],
    [STORAGE_KEYS.userId, String(userId)],
    [STORAGE_KEYS.role, String(role)],
  ];
  if (refreshToken) pairs.push([STORAGE_KEYS.refreshToken, refreshToken]);
  if (email) pairs.push([STORAGE_KEYS.email, String(email)]);
  await AsyncStorage.multiSet(pairs);
}

const PERSISTED_LOCAL_KEYS = new Set([
  'nessa.biometric.enabled',
  'nessa.biometric.email',
  'nessa.biometric.refreshToken',
]);

export async function clearSession() {
  const keys = Object.values(STORAGE_KEYS);
  const removable = keys.filter((key) => !PERSISTED_LOCAL_KEYS.has(key));
  if (removable.length) await AsyncStorage.multiRemove(removable);
}

async function attemptTokenRefresh() {
  const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearSession();
      return null;
    }
    const data = await res.json();
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.token, data.token],
      ...(data.refreshToken ? [[STORAGE_KEYS.refreshToken, data.refreshToken]] : []),
    ]);
    return data.token;
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body, authenticated = true, _retry = true } = {}) {
  const token = authenticated ? await getStoredToken() : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && _retry && authenticated) {
    const newToken = await attemptTokenRefresh();
    if (newToken) return api(path, { method, body, authenticated, _retry: false });

    // The refresh failed, so the session is genuinely dead. Every screen used
    // to catch this and console.error its own copy — "Error fetching patient
    // appointments: Session expired" — while the user sat on a dashboard that
    // silently loaded nothing and was never asked to sign in again.
    //
    // Clear it once, here, and tell the navigator. Screens keep getting a
    // rejected promise so their own loading states unwind, but the error is
    // marked so they can skip showing a technical alert for something the app
    // is already handling.
    await clearSession();
    DeviceEventEmitter.emit('sessionExpired');

    const err = new Error('Your session has ended. Please sign in again.');
    err.sessionExpired = true;
    throw err;
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return null;

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      errMsg = err.error || err.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function uploadFile(path, fileUri, mimeType = 'image/jpeg', { withMeta = false } = {}) {
  const token = await getStoredToken();
  const ownerId = await getStoredUserId();

  // 1 — Create the upload session (ownerId is required by the backend).
  //
  // `domain` is a CATEGORY column, varchar(64) NOT NULL — not a storage path.
  // Passing the full path overflowed it for anything under a uuid-scoped prefix
  // (e.g. "client-chats/<uuid>/voice/<ts>.m4a" is 73 chars), and the overflow came
  // back as a bare 409 "Request conflicts with existing data." — which is why
  // sending a voice note or attachment failed. Use the leading path segment as the
  // domain and keep the full path as the file name (varchar(255)).
  const fullPath = path || 'chat';
  const domain = String(fullPath).split('/')[0].slice(0, 64) || 'chat';
  const fileName = String(fullPath).slice(-255);
  const session = await api('/api/v1/files/upload-session', {
    method: 'POST',
    body: { ownerId, fileName, mimeType, domain },
  });

  // 2 — PUT the bytes to the (Postgres-backed) upload endpoint. Make the url
  // absolute — React Native's fetch can't resolve a relative path.
  const fileRes = await fetch(fileUri);
  const blob = await fileRes.blob();
  const uploadUrl = session?.uploadUrl;
  if (uploadUrl) {
    const abs = /^https?:\/\//i.test(uploadUrl) ? uploadUrl : `${API_BASE}${uploadUrl}`;
    await fetch(abs, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: blob,
    }).catch(() => {});
  }

  // 3 — Finalize the file record.
  await api('/api/v1/files/complete', {
    method: 'POST',
    body: { fileId: session?.fileId, publicUrl: session?.publicUrl },
  }).catch(() => {});

  // 4 — Return the token-signed url.
  //
  // Absolute for the CALLER (<Image> and the audio player need a full url), but
  // note that whatever gets STORED with the message will contain this host. A
  // host is only valid on the network it was captured on: an attachment
  // uploaded from a laptop hotspot (172.20.x.x) is unreachable from the same
  // account on LTE, which is why a voice note played in the simulator and not
  // on a real phone.
  //
  // The reader side therefore re-points /api/ urls at the CURRENT API base —
  // see utils/therapistClientChat.resolveMediaHost. That is what makes old
  // attachments keep working; this line only has to be correct for right now.
  const url = session?.publicUrl || '';
  const absolute = url && url.startsWith('/') ? `${API_BASE}${url}` : url;
  // `withMeta` is for callers that need the file id too (document
  // classification works on the stored file). Everyone else keeps the URL.
  return withMeta ? { url: absolute, fileId: session?.fileId } : absolute;
}
