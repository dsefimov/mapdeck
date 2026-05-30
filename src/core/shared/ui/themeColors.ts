/**
 * Utility to read CSS custom property colors and convert to RGBA arrays for Deck.gl
 */

/**
 * CSS custom property names for theme colors.
 * Reusable across all map tools and components.
 */
export const THEME_PRIMARY = "--color-primary";
export const THEME_SECONDARY = "--color-secondary";
export const THEME_SUCCESS = "--color-success";

/**
 * Alpha values (0-255) for Deck.gl layer colors.
 * Reusable across all measurement tools.
 */
export const COLOR_ALPHA_FILL = 60;
export const COLOR_ALPHA_STROKE = 200;
export const COLOR_ALPHA_PREVIEW = 150;

/**
 * Convert a hex color string to an RGBA array [r, g, b, a].
 * Alpha is 0-255. Supports "#RRGGBB" format.
 */
export function hexToRgba(
    hex: string,
    alpha: number = 255,
): [number, number, number, number] {
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return [r, g, b, alpha];
}

/**
 * Read a CSS custom property value from :root as a raw string.
 * Falls back to the provided default when the property is not set
 * or when document is unavailable (SSR, test).
 */
export function getThemeValue(
    cssVariable: string,
    fallback: string = "",
): string {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return fallback;
    }
    const value = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue(cssVariable)
        .trim();
    return value || fallback;
}

/**
 * Get a theme color as an RGBA array [r, g, b, a]
 * Reads from CSS custom properties on :root
 * @param cssVariable - CSS custom property name (e.g., "--color-primary")
 * @param alpha - Alpha value 0-255 (default: 255)
 */
export function getThemeColor(
    cssVariable: string,
    alpha: number = 255,
): [number, number, number, number] {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return [0, 0, 0, alpha];
    }

    const value = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue(cssVariable)
        .trim();

    if (!value) {
        return [0, 0, 0, alpha];
    }

    if (value.startsWith("#")) {
        return hexToRgba(value, alpha);
    }

    // Fallback for color-mix or other functions - return black
    return [0, 0, 0, alpha];
}
