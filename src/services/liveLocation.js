// ─── Live Location ───────────────────────────────────────────────────────────
// Re-detects the signed-in user's device location whenever the app is opened so
// dashboards always show where the user is now, not the address captured at
// onboarding. Mirrors the web implementation.
//
// Storage model (non-destructive):
//  • Universal — every role's auth profile carries `metadata.currentLocation`
//    via PATCH /api/v1/auth/users/{uid}. Existing metadata is preserved.
//  • Native — doctor / home-care nurse / patient also get their own location
//    record refreshed so existing screens reflect it.
//
// All writes are best-effort; a denied permission keeps the last known location.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId, getStoredRole, getStoredToken, getStoredNurseId } from './apiClient';
import { getCurrentLocationMobile, reverseGeocodeMobile } from './homeCareGeoService';

let _lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000;

export async function refreshCurrentLocation({ force = false } = {}) {
  const token = await getStoredToken();
  if (!token) return null;

  const now = Date.now();
  if (!force && now - _lastRunAt < MIN_INTERVAL_MS) return null;
  _lastRunAt = now;

  const coords = await getCurrentLocationMobile().catch(() => null);
  if (!coords) return null; // permission denied / unavailable → keep last known

  const address = await reverseGeocodeMobile(coords.latitude, coords.longitude).catch(() => null);
  const uid = await getStoredUserId();
  const role = (await getStoredRole() || '').toLowerCase();
  const current = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    address: address || null,
    updatedAt: new Date().toISOString(),
  };

  // 1) Universal store on the auth profile metadata (all roles, non-destructive).
  try {
    const resolved = await api(`/api/v1/auth/mobile/resolve-role/${uid}`).catch(() => null);
    const existingMeta = resolved?.profile?.metadata || {};
    await api(`/api/v1/auth/users/${uid}`, {
      method: 'PATCH',
      body: { metadataJson: JSON.stringify({ ...existingMeta, currentLocation: current }) },
    });
  } catch { /* best-effort */ }

  // 2) Refresh the role's own location record.
  try {
    if (role === 'doctor') {
      const prof = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      let meta = {};
      try { meta = prof?.metadataJson ? JSON.parse(prof.metadataJson) : {}; } catch { /* ignore */ }
      meta = {
        ...meta,
        latitude: current.latitude,
        longitude: current.longitude,
        geo: { ...(meta.geo || {}), latitude: current.latitude, longitude: current.longitude },
        currentLocation: current,
      };
      await api(`/api/v1/doctors/${uid}`, {
        method: 'PATCH',
        body: { ...(address ? { location: address } : {}), metadataJson: JSON.stringify(meta) },
      });
    } else if (role === 'homecare_nurse') {
      const nurseId = (await getStoredNurseId()) || uid;
      // Send the GPS accuracy and the device's fix time, not just coordinates: the
      // backend uses them to discard updates that are older or coarser than what it
      // already has, so a late-arriving cached fix can't overwrite a newer one.
      await api(`/api/v1/homecare/nurses/${nurseId}/location`, {
        method: 'PATCH',
        body: {
          latitude: current.latitude,
          longitude: current.longitude,
          ...(coords.accuracy != null ? { accuracy: coords.accuracy } : {}),
          ...(coords.gpsTimestamp ? { gpsTimestamp: coords.gpsTimestamp } : {}),
        },
      });
    } else if (role === 'patient' || role === 'client') {
      await api(`/api/v1/patients/${uid}`, {
        method: 'PATCH',
        body: { ...(address ? { location: address } : {}), latitude: current.latitude, longitude: current.longitude },
      }).catch(() => {});
    }
  } catch { /* best-effort */ }

  // 3) Update the cached profile so screens render current location immediately.
  try {
    const raw = await AsyncStorage.getItem('userProfile');
    const prof = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem('userProfile', JSON.stringify({
      ...prof,
      ...(address ? { location: address } : {}),
      latitude: current.latitude,
      longitude: current.longitude,
      currentLocation: current,
    }));
  } catch { /* ignore */ }

  return current;
}
