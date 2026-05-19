import * as Location from 'expo-location';

export async function getCurrentLocationMobile() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
