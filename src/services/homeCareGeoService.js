import * as Location from 'expo-location';

export async function getCurrentLocationMobile() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  // Highest accuracy + no cached fix: Balanced resolves from wifi/cell towers and
  // frequently returns a stale position, which is why a moved user kept reporting
  // their previous location. Accuracy/timestamp are returned so callers can send
  // them to the backend, which rejects stale or coarse updates.
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    maximumAge: 0,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    gpsTimestamp: new Date(pos.timestamp).toISOString(),
  };
}

export async function geocodeAddressMobile(address) {
  const text = String(address || '').trim();
  if (!text) return null;
  try {
    const results = await Location.geocodeAsync(text);
    if (!results?.[0]) return null;
    return { latitude: results[0].latitude, longitude: results[0].longitude };
  } catch {
    return null;
  }
}

export async function reverseGeocodeMobile(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const r = results?.[0];
    if (!r) return null;
    const parts = [r.name, r.street, r.district, r.city, r.region, r.postalCode, r.country].filter(Boolean);
    const line = [...new Set(parts)].join(', ');
    return line || null;
  } catch {
    return null;
  }
}
