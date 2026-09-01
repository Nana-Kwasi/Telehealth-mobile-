import AsyncStorage from '@react-native-async-storage/async-storage';
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

export async function storeSession({ token, refreshToken, userId, role }) {
  const pairs = [
    [STORAGE_KEYS.token, token],
    [STORAGE_KEYS.userId, String(userId)],
    [STORAGE_KEYS.role, String(role)],
  ];
  if (refreshToken) pairs.push([STORAGE_KEYS.refreshToken, refreshToken]);
  await AsyncStorage.multiSet(pairs);
}

export async function clearSession() {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
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
    throw new Error('Session expired. Please sign in again.');
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

export async function uploadFile(path, fileUri, mimeType = 'image/jpeg') {
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

  // 4 — Return the token-signed url, made absolute so <Image>/download work.
  const url = session?.publicUrl || '';
  return url && url.startsWith('/') ? `${API_BASE}${url}` : url;
}
