import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, STORAGE_KEYS } from './apiClient';

let clientDataCache = null;
let therapistDataCache = null;

export async function fetchClientData() {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('No authenticated user');

  // A profile row is created at signup, but accounts made before that fix (or any
  // account whose profile write failed) have none, and the endpoint answers 400
  // "Patient not found". Throwing here took the whole dashboard down with
  // "Error loading dashboard data"; fall back to the stored session instead so the
  // screen still renders and the rest of the widgets load.
  const clientData = await api(`/api/v1/patients/${userId}`).catch(() => null);
  // Always load the stored session — not just when the fetch fails. The profile
  // row returns fullName/name as EMPTY STRINGS for a therapy client (the name
  // lives on the user account, not the patient profile), and an empty string is
  // falsy, so the greeting fell straight through to the literal "Client" while
  // the drawer — which reads the session profile — showed the real name.
  let stored = null;
  try {
    const raw = await AsyncStorage.getItem('userProfile');
    stored = raw ? JSON.parse(raw) : null;
  } catch { stored = null; }

  const pick = (...vals) => vals.find((v) => typeof v === 'string' && v.trim()) || null;
  let name = pick(
    clientData?.fullName,
    clientData?.name,
    stored?.fullName,
    stored?.name,
    stored?.displayName,
  );
  // Last resort: ask the backend who this account is.
  if (!name) {
    try {
      const rr = await api(`/api/v1/auth/mobile/resolve-role/${userId}`);
      name = pick(rr?.profile?.fullName, rr?.profile?.name, rr?.profile?.displayName);
    } catch { /* keep the generic label */ }
  }

  const result = {
    id: userId,
    uid: userId,
    ...(clientData || {}),
    email: clientData?.email || stored?.email || '',
    name: name || 'Client',
    fullName: name || 'Client',
    role: 'client',
    status: clientData?.status || stored?.status || 'active',
  };

  // Who is this client's therapist?
  //
  // assignedTherapistId/assignedTherapist are Firestore-era fields that the REST
  // backend never writes — choosing a therapist records a row in
  // therapist_client_assignments_v2 instead. Reading only those fields left
  // `result.therapist` undefined for clients who had already picked (and paid
  // for) someone, so their dashboard kept prompting them to find a therapist.
  // Prefer the legacy field when present, then fall back to the assignment.
  let therapistId = clientData?.assignedTherapistId || clientData?.assignedTherapist;
  if (!therapistId) {
    try {
      const rows = await api(
        `/api/v1/therapy-management/assignments?clientId=${encodeURIComponent(userId)}`,
      );
      const active = (Array.isArray(rows) ? rows : [])
        .filter((a) => String(a.status || '').toLowerCase() === 'active')
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      therapistId = active?.therapistId || null;
    } catch {}
  }
  if (therapistId) {
    try {
      const therapistData = await api(`/api/v1/therapists/${therapistId}`);
      if (therapistData) {
        therapistDataCache = { id: therapistId, ...therapistData };
        result.therapist = therapistDataCache;
        result.assignedTherapistId = therapistId;
        await AsyncStorage.setItem('therapistData', JSON.stringify(therapistDataCache));
      }
    } catch {}
  }

  clientDataCache = result;
  await AsyncStorage.setItem('clientData', JSON.stringify(result));
  await AsyncStorage.setItem('th.clientId', userId);
  return result;
}

export function getCachedClientData() {
  return clientDataCache;
}

export function getCachedTherapistData() {
  return therapistDataCache;
}

export async function refreshClientData() {
  clientDataCache = null;
  therapistDataCache = null;
  return fetchClientData();
}

export function subscribeToClientData(callback) {
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      const data = await fetchClientData();
      if (!cancelled) callback(data);
    } catch {
      if (!cancelled) callback(null);
    }
  };

  poll();
  const id = setInterval(poll, 30_000);

  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
