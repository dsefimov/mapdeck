/**
 * Defaults applied when the corresponding optional {@link STACConfig} field
 * is unset. Declared beside the interface so the field JSDoc never restates
 * the numbers and drift.
 */

/** Request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Page cap when paginating /items. */
export const DEFAULT_MAX_PAGES = 10;

export interface STACConfig {
    /** STAC catalog URL (required) */
    url: string;

    /** Base URL for relative links (optional) */
    baseUrl?: string;

    /** Request timeout in milliseconds (optional; defaults to {@link DEFAULT_TIMEOUT_MS}) */
    timeout?: number;

    /** Additional HTTP headers (optional) */
    headers?: Record<string, string>;

    /** Maximum number of pages when paginating /items (optional; defaults to {@link DEFAULT_MAX_PAGES}) */
    maxPages?: number;
}
