/**
 * Clamp latitude and longitude to valid WGS84 ranges.
 * No @core imports — safe for both main-thread code and Web Workers.
 */
export function clampLatLng(lng: number, lat: number): [number, number] {
    return [
        Math.max(-180, Math.min(180, lng)),
        Math.max(-90, Math.min(90, lat)),
    ];
}
