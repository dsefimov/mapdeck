/** Hex color: optional `#`, then 3, 6 or 8 hex digits. */
const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** RGBA channels, each 0-255. */
export type Rgba = [r: number, g: number, b: number, a: number];

/**
 * Convert a hex color — `RGB`, `RRGGBB` or `RRGGBBAA`, with or without
 * the leading `#` — to RGBA channels. `defaultAlpha` applies to formats
 * without their own alpha. Throws on anything else — a NaN channel
 * would silently poison every color derived from it.
 */
export function hexToRgba(hex: string, defaultAlpha = 255): Rgba {
    const digits = HEX_COLOR.exec(hex.trim())?.[1];
    if (!digits) {
        throw new Error(`hexToRgba: invalid hex color "${hex}"`);
    }

    const full =
        digits.length === 3
            ? [...digits].map((c) => c + c).join("")
            : digits;
    const channel = (index: number) =>
        parseInt(full.slice(index * 2, index * 2 + 2), 16);

    return [
        channel(0),
        channel(1),
        channel(2),
        full.length === 8 ? channel(3) : defaultAlpha,
    ];
}
