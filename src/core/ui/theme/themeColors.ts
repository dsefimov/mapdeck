/**
 * Utility to read CSS custom property colors and convert to RGBA arrays for Deck.gl
 *
 * CSS custom property names for theme colors.
 * Reusable across all map tools and components.
 */
import { hexToRgba } from "@core/lib/color";

/** Semantic color tokens (see theme.css). */
export const THEME_TEXT = "--color-text";
export const THEME_TEXT_SECONDARY = "--color-text-secondary";
export const THEME_BG = "--color-bg";
export const THEME_BORDER = "--color-border";
export const THEME_TRACK = "--color-track";
export const THEME_ACCENT = "--color-accent";
export const THEME_ACCENT_800 = "--color-accent-800";
export const THEME_ON_ACCENT = "--color-on-accent";
export const THEME_ERROR = "--color-error";
export const THEME_SUCCESS = "--color-success";

/** Tool-specific color tokens (see tool-tokens.css). */
export const THEME_MEASURE_STROKE = "--tool-measure-stroke";
export const THEME_MEASURE_FILL = "--tool-measure-fill";
export const THEME_MEASURE_PREVIEW = "--tool-measure-preview";

/**
 * Light-theme fallbacks (SSR/tests: no window/document). The hex constants
 * are the source; the RGBA arrays are derived, so CSS and deck.gl defaults
 * cannot drift apart.
 */
export const DEFAULT_ACCENT_CSS = "#0051ca";
/** Text (#343a40) — CSS fallback for maplibre paint (no var() support). */
export const DEFAULT_TEXT_CSS = "#343a40";
export const DEFAULT_COLOR_TEXT: [number, number, number, number] = hexToRgba(
    DEFAULT_TEXT_CSS,
    255,
);
export const DEFAULT_COLOR_ACCENT: [number, number, number, number] =
    hexToRgba(DEFAULT_ACCENT_CSS, 255);

/**
 * Alpha values (0-255) for Deck.gl layer colors.
 * Reusable across all measurement tools.
 */
export const COLOR_ALPHA_FILL = 60;
export const COLOR_ALPHA_STROKE = 200;
export const COLOR_ALPHA_PREVIEW = 150;

/** Measure colors resolved for deck.gl (RGBA) and maplibre paint (CSS). */
export interface MeasureColors {
    stroke: [number, number, number, number];
    fill: [number, number, number, number];
    preview: [number, number, number, number];
    css: { stroke: string; fill: string };
}

/**
 * Single source of measure colors for deck.gl and maplibre paint.
 * Reads theme tokens in the browser, light defaults in SSR/tests.
 */
export function getMeasureColors(): MeasureColors {
    // SSR/test: no CSSOM — light theme defaults
    if (typeof window === "undefined" || typeof document === "undefined") {
        return {
            stroke: withAlpha(DEFAULT_COLOR_ACCENT, COLOR_ALPHA_STROKE),
            fill: withAlpha(DEFAULT_COLOR_ACCENT, COLOR_ALPHA_FILL),
            preview: withAlpha(DEFAULT_COLOR_ACCENT, COLOR_ALPHA_PREVIEW),
            css: { stroke: DEFAULT_ACCENT_CSS, fill: DEFAULT_ACCENT_CSS },
        };
    }
    const stroke = getThemeColor(
        THEME_MEASURE_STROKE,
        COLOR_ALPHA_STROKE,
        DEFAULT_COLOR_ACCENT,
    );
    const fill = getThemeColor(
        THEME_MEASURE_FILL,
        COLOR_ALPHA_FILL,
        DEFAULT_COLOR_ACCENT,
    );
    const preview = getThemeColor(
        THEME_MEASURE_PREVIEW,
        COLOR_ALPHA_PREVIEW,
        DEFAULT_COLOR_ACCENT,
    );
    const cssStroke = getThemeValue(THEME_MEASURE_STROKE, DEFAULT_ACCENT_CSS);
    return {
        stroke,
        fill,
        preview,
        css: { stroke: cssStroke, fill: cssStroke },
    };
}

/**
 * Read a CSS custom property value from the theme root (default `<html>`;
 * `setThemeRoot` points an embedded instance at its container). Falls back
 * to the provided default when the property is not set or when document is
 * unavailable (SSR, test).
 */
export function getThemeValue(
    cssVariable: string,
    fallback: string = "",
): string {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return fallback;
    }
    const value = window
        .getComputedStyle(currentThemeRoot())
        .getPropertyValue(cssVariable)
        .trim();
    return value || fallback;
}

/** Replaces the alpha channel of an RGBA tuple. */
function withAlpha(
    rgba: readonly [number, number, number, number],
    alpha: number,
): [number, number, number, number] {
    return [rgba[0], rgba[1], rgba[2], alpha];
}

/**
 * Get a theme color as an RGBA array [r, g, b, a]
 * Reads from CSS custom properties on the theme root (default `<html>`)
 * @param cssVariable - CSS custom property name (e.g., "--color-accent")
 * @param alpha - Alpha value 0-255 (default: 255) — honored in every branch,
 *                including the fallbacks
 * @param fallback - RGBA used when the property is not set or there is no
 *                   DOM (default: the text-gray light-theme default)
 */
export function getThemeColor(
    cssVariable: string,
    alpha: number = 255,
    fallback: readonly [number, number, number, number] = DEFAULT_COLOR_TEXT,
): [number, number, number, number] {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return withAlpha(fallback, alpha);
    }

    const value = window
        .getComputedStyle(currentThemeRoot())
        .getPropertyValue(cssVariable)
        .trim();

    if (!value) {
        return withAlpha(fallback, alpha);
    }

    if (value.startsWith("#")) {
        return hexToRgba(value, alpha);
    }

    return [0, 0, 0, alpha];
}

type ThemeListener = () => void;

const themeListeners = new Set<ThemeListener>();
let themeRoot: HTMLElement | null = null;
let themeObserver: MutationObserver | null = null;

function currentThemeRoot(): HTMLElement {
    return themeRoot ?? document.documentElement;
}

function notifyThemeListeners(): void {
    for (const listener of themeListeners) listener();
}

function observeThemeRoot(): void {
    themeObserver?.disconnect();
    themeObserver = null;
    if (typeof MutationObserver === "undefined") return;
    themeObserver = new MutationObserver(notifyThemeListeners);
    themeObserver.observe(currentThemeRoot(), {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
}

/**
 * Points the theme reader and observer at an element. Defaults to `<html>`;
 * an embedded instance points it at its container so the library reads and
 * watches its own token carrier instead of the host page. One theme root
 * per page: the reader is module-level, so a second call re-points every
 * reader — a page running two instances picks one root for both.
 */
export function setThemeRoot(element: HTMLElement): void {
    themeRoot = element;
    observeThemeRoot();
    notifyThemeListeners();
}

/**
 * Subscribe to theme switches. The theme changes when the `data-theme`
 * attribute on the theme root changes (see theme.css); re-pointing the root
 * via `setThemeRoot` notifies too. SSR-safe: without a DOM the observer
 * never starts and the returned unsubscribe is a no-op.
 */
export function subscribeTheme(listener: ThemeListener): () => void {
    if (themeObserver === null && typeof document !== "undefined") {
        observeThemeRoot();
    }
    themeListeners.add(listener);
    return () => themeListeners.delete(listener);
}
