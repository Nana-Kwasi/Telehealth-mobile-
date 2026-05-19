/** Haversine distance in km between two WGS84 points. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1);
  const b1 = Number(lng1);
  const a2 = Number(lat2);
  const b2 = Number(lng2);
  if (![a1, b1, a2, b2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = ((a2 - a1) * Math.PI) / 180;
  const dLng = ((b2 - b1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function parseCoords(entity) {
  if (!entity) return null;
  const lat = entity.latitude ?? entity.lat ?? entity.location?.latitude ?? entity.location?.lat;
  const lng = entity.longitude ?? entity.lng ?? entity.location?.longitude ?? entity.location?.lng;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { latitude: Number(lat), longitude: Number(lng) };
}

export function attachDistance(list, anchor) {
  if (!anchor) return list.map((n) => ({ ...n, distanceKm: null }));
  return list
    .map((n) => {
      const c = parseCoords(n);
      const distanceKm = c ? haversineKm(anchor.latitude, anchor.longitude, c.latitude, c.longitude) : null;
      return { ...n, distanceKm };
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return (b.ratingAvg || 0) - (a.ratingAvg || 0);
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

export function withinRadiusKm(entity, anchor, radiusKm) {
  const c = parseCoords(entity);
  if (!c || !anchor) return true;
  const d = haversineKm(anchor.latitude, anchor.longitude, c.latitude, c.longitude);
  return d != null && d <= radiusKm;
}

export function formatDistanceKm(km) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}
