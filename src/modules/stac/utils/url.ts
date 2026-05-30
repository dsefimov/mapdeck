/**
 * URL utility functions for STAC data processing
 */

import type { STACLink } from "../types";

const DEFAULT_LOCALHOST = "http://localhost";

/**
 * Get default base URL based on environment
 */
function getDefaultBaseUrl(): string {
    return typeof window !== "undefined"
        ? window.location.href
        : DEFAULT_LOCALHOST;
}

/**
 * Resolve base URL from a given URL and optional fallback
 *
 * @param url - The URL to resolve base from
 * @param fallbackBaseUrl - Optional fallback base URL
 * @returns Resolved base URL
 */
export function resolveBaseUrlFromUrl(
    url: string,
    fallbackBaseUrl?: string,
): string {
    try {
        const base = fallbackBaseUrl || getDefaultBaseUrl();
        const parsed = new URL(url, base);
        const dir = parsed.pathname.substring(
            0,
            parsed.pathname.lastIndexOf("/") + 1,
        );
        return parsed.origin + dir;
    } catch {
        return fallbackBaseUrl || getDefaultBaseUrl();
    }
}

/**
 * Resolve base URL from STAC links
 * Uses the 'self' link if available, otherwise falls back to default
 *
 * @param links - STAC links array (from a collection/catalog/item)
 * @param fallbackBaseUrl - Optional fallback base URL
 * @returns Resolved base URL
 */
export function resolveBaseUrl(
    links: readonly STACLink[],
    fallbackBaseUrl?: string,
): string {
    const selfLink = links.find((link) => link.rel === "self");
    const baseUrl = fallbackBaseUrl || getDefaultBaseUrl();

    if (!selfLink?.href) {
        return baseUrl;
    }

    return resolveBaseUrlFromUrl(selfLink.href, baseUrl);
}

/**
 * Filter STAC links by relation type (rel)
 *
 * @param links - Array of STAC links
 * @param rel - Relation type to filter by
 * @returns Filtered array of links
 */
export function filterLinksByRel(
    links: readonly STACLink[],
    rel: string,
): STACLink[] {
    return links.filter((link) => link.rel === rel);
}
