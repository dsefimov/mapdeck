/**
 * Approximate meters per degree of longitude at the given latitude.
 * 111,320 m is one degree of longitude at the equator (the WGS84 equatorial
 * circumference divided by 360); parallels shrink with the cosine of latitude.
 */
export function metersPerDegreeAt(latDeg: number): number {
    return 111_320 * Math.cos((latDeg * Math.PI) / 180);
}
