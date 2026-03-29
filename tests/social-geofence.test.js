import { describe, expect, it } from 'vitest';
import { haversineDistanceM, isInsideGeofence } from '../js/social/geofence.js';
import { PLATFORM_GEOFENCE_RADIUS_M, PLATFORM_LAT, PLATFORM_LON } from '../js/social/constants.js';

describe('haversineDistanceM', () => {
  it('distância zero no mesmo ponto', () => {
    expect(haversineDistanceM(PLATFORM_LAT, PLATFORM_LON, PLATFORM_LAT, PLATFORM_LON)).toBe(0);
  });
  it('ponto distante fica fora do raio da plataforma', () => {
    const d = haversineDistanceM(PLATFORM_LAT, PLATFORM_LON, PLATFORM_LAT + 0.02, PLATFORM_LON + 0.02);
    expect(d).toBeGreaterThan(PLATFORM_GEOFENCE_RADIUS_M);
  });
});

describe('isInsideGeofence', () => {
  it('NaN não conta como dentro', () => {
    expect(isInsideGeofence(NaN, PLATFORM_LON, PLATFORM_LAT, PLATFORM_LON, 150)).toBe(false);
  });
  it('centro da plataforma está dentro', () => {
    expect(
      isInsideGeofence(PLATFORM_LAT, PLATFORM_LON, PLATFORM_LAT, PLATFORM_LON, PLATFORM_GEOFENCE_RADIUS_M)
    ).toBe(true);
  });
});
