/** Normalize raw hex input to `#RRGGBB`, or null when it is not one. */
export function normalizeHex(raw: string): string | null {
    const digits = raw.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(digits)) return null;
    return `#${digits.toLowerCase()}`;
}
