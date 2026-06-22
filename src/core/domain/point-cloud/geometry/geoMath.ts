/**
 * Approximate meters per degree of longitude at the given latitude.
 * 111,320 m/deg is the equatorial meridian arc-length constant.
 */
export function metersPerDegreeAt(latDeg: number): number {
    return 111_320 * Math.cos((latDeg * Math.PI) / 180);
}
