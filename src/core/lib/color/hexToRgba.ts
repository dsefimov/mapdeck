/**
 * Convert a hex color string to an RGBA array [r, g, b, a].
 * Alpha is 0-255. Supports "#RRGGBB", "#RGB" and "#RRGGBBAA" formats.
 * Throws on anything else — a NaN channel would silently poison every
 * color derived from it.
 */
const HEX_PATTERN = /^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function hexToRgba(
    hex: string,
    alpha: number = 255,
): [number, number, number, number] {
    const cleaned = hex.replace("#", "").trim();

    if (!HEX_PATTERN.test(cleaned)) {
        throw new Error(`hexToRgba: invalid hex color "${hex}"`);
    }

    if (cleaned.length === 3) {
        const r = parseInt(cleaned[0]! + cleaned[0], 16);
        const g = parseInt(cleaned[1]! + cleaned[1], 16);
        const b = parseInt(cleaned[2]! + cleaned[2], 16);
        return [r, g, b, alpha];
    }

    if (cleaned.length === 8) {
        const r = parseInt(cleaned.substring(0, 2), 16);
        const g = parseInt(cleaned.substring(2, 4), 16);
        const b = parseInt(cleaned.substring(4, 6), 16);
        const a = parseInt(cleaned.substring(6, 8), 16);
        return [r, g, b, a];
    }

    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return [r, g, b, alpha];
}
