import { useEffect, useState } from 'react';
import { API_BASE } from '../services/apiClient';

/*
 * The feature switches the super admin sets in System Config › Features.
 * Screens hide what is switched off; the server refuses it either way.
 * Fetched once per app session and shared; unknown or unreadable means "on".
 */
let cache = null;
let pending = null;
const listeners = new Set();

function load() {
  if (pending) return pending;
  pending = fetch(`${API_BASE}/api/v1/admin/system-config/public/settings`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((s) => { cache = (s && s.features) || {}; })
    .catch(() => { cache = {}; })
    .finally(() => { listeners.forEach((l) => l(cache)); pending = null; });
  return pending;
}

export function usePlatformFeatures() {
  const [features, setFeatures] = useState(cache || {});
  useEffect(() => {
    listeners.add(setFeatures);
    if (cache) setFeatures(cache); else load();
    return () => { listeners.delete(setFeatures); };
  }, []);
  return features;
}

/** True unless the admin switched this feature off. */
export const featureOn = (features, key) => !key || features[key] !== false;

/** Drawer screen names that belong to a switchable feature. */
export const SCREEN_FEATURE = {
  TherapyCommunity: 'community', MedicalCommunity: 'community',
  TherapistCommunityModeration: 'community', DoctorCommunityModeration: 'community',
};
