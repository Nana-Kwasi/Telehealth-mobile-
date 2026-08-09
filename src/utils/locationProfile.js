import { api } from '../services/apiClient';

const LOCATION_KEYS = [
  'country', 'city', 'area', 'region', 'street',
  'ghanaDigitalAddress', 'latitude', 'longitude',
  'formattedAddress', 'address',
];

export function mergeLocationProfile(...sources) {
  const filtered = sources.filter(Boolean);
  const out = Object.assign({}, ...filtered);
  for (const key of LOCATION_KEYS) {
    for (const src of filtered) {
      const v = src[key];
      if (v != null && v !== '') { out[key] = v; break; }
    }
  }
  out.locationMeta = Object.assign({}, ...filtered.map((s) => s.locationMeta || {}));
  out.location = Object.assign({}, ...filtered.map((s) => s.location || {}));
  return out;
}

export async function fetchAuthLocationProfile(uid) {
  if (!uid) return null;
  try {
    return await api(`/api/v1/patients/${uid}`);
  } catch {
    return null;
  }
}
