/**
 * Distância em metros entre dois pontos WGS84 (fórmula de Haversine).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @param {number} userLat
 * @param {number} userLon
 * @param {number} platformLat
 * @param {number} platformLon
 * @param {number} radiusM
 */
export function isInsideGeofence(userLat, userLon, platformLat, platformLon, radiusM) {
  if (![userLat, userLon, platformLat, platformLon, radiusM].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return false;
  }
  return haversineDistanceM(userLat, userLon, platformLat, platformLon) <= radiusM;
}
