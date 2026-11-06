/**
 * Shared geo formatters and data converters.
 * Pure functions for human-readable distance/area/volume output.
 */
import type { GeoPoint } from "./types";

interface UnitTier {
    /** Value at which this tier takes over, in base units. */
    readonly from: number;
    /** Multiplier from base units to this tier's unit. */
    readonly scale: number;
    readonly unit: string;
    readonly digits: number;
}

/**
 * Pick the tier by magnitude and format to its fixed digits. The tier
 * is re-picked when rounding carries the display into the next tier
 * (999.999 m shows as 1.00 km, not 1000.00 m). The sign is kept; the
 * tier is chosen by magnitude, so -1500 m shows as -1.50 km. NaN has
 * no magnitude and renders as "—".
 */
function formatByMagnitude(
    value: number,
    tiers: readonly UnitTier[],
): string {
    if (Number.isNaN(value)) return "—";

    const magnitude = Math.abs(value);
    const index = tiers.findIndex((tier) => magnitude >= tier.from);
    const tier = tiers[index]!;
    const next = tiers[index - 1];
    const display = value * tier.scale;

    if (
        next !== undefined &&
        Number(display.toFixed(tier.digits)) >= next.from * tier.scale
    ) {
        return `${(value * next.scale).toFixed(next.digits)} ${next.unit}`;
    }
    return `${display.toFixed(tier.digits)} ${tier.unit}`;
}

const DISTANCE_TIERS: readonly UnitTier[] = [
    { from: 1_000, scale: 1 / 1_000, unit: "km", digits: 2 },
    { from: 1, scale: 1, unit: "m", digits: 2 },
    { from: 0, scale: 100, unit: "cm", digits: 1 },
];

const AREA_TIERS: readonly UnitTier[] = [
    { from: 1_000_000, scale: 1 / 1_000_000, unit: "km²", digits: 3 },
    { from: 10_000, scale: 1 / 10_000, unit: "ha", digits: 2 },
    { from: 1, scale: 1, unit: "m²", digits: 2 },
    { from: 0, scale: 10_000, unit: "cm²", digits: 1 },
];

const VOLUME_TIERS: readonly UnitTier[] = [
    { from: 1_000_000, scale: 1 / 1_000_000, unit: "km³", digits: 3 },
    { from: 1, scale: 1, unit: "m³", digits: 2 },
    { from: 0.001, scale: 1_000, unit: "litres", digits: 1 },
    { from: 0, scale: 1_000_000, unit: "ml", digits: 1 },
];

/** Format a distance in meters. */
export function formatDistance(meters: number): string {
    return formatByMagnitude(meters, DISTANCE_TIERS);
}

/** Format an area in square meters. */
export function formatArea(squareMeters: number): string {
    return formatByMagnitude(squareMeters, AREA_TIERS);
}

/** Format a volume in cubic meters. */
export function formatVolume(cubicMeters: number): string {
    return formatByMagnitude(cubicMeters, VOLUME_TIERS);
}

/**
 * Unpack a GeoPoint into a [lng, lat, z] tuple — the coordinate layout
 * deck.gl layers take.
 */
export function geoPointToLngLatZ(
    point: GeoPoint,
): [number, number, number] {
    return [point.lng, point.lat, point.z];
}
