/**
 * Type-safe reads of style values — style-config values are untrusted, only
 * well-typed ones reach maplibre. The shared guards behind every protocol's
 * opacity/color extraction.
 */

/** The value when it is a number, otherwise the fallback. */
export function styleNumber(value: unknown, fallback: number): number {
    return typeof value === "number" ? value : fallback;
}

/** The value when it is a string, otherwise the fallback. */
export function styleColor(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
}
