import { ColorScheme } from "@core/contracts";

const SCHEMES = new Set<string>(Object.values(ColorScheme));

/**
 * Resolves a style-metadata value to a color scheme: a value becomes a
 * scheme only when it names one; anything else falls back to `RGB`.
 */
export function resolveColorScheme(value: unknown): ColorScheme {
    return typeof value === "string" && SCHEMES.has(value)
        ? (value as ColorScheme)
        : ColorScheme.RGB;
}
