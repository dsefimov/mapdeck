/**
 * STAC HTTP client
 * Replaces api.ts with a class-based approach
 */

import { logger } from "@core/shared/diagnostics/logger";
import type { STACConfig } from "./STACConfig";
import type {
    STACCatalog,
    STACCollection,
    STACCollectionsResponse,
    STACEntity,
    STACItem,
} from "../types";
import { isSTACCatalog, isSTACCollection } from "../types";

export class STACClient {
    constructor(private readonly config: STACConfig) {}

    async fetchEntity(
        url: string,
        baseUrlOverride?: string,
    ): Promise<STACEntity> {
        const data: unknown = await this.request(url, baseUrlOverride);

        if (
            !data ||
            typeof data !== "object" ||
            !("stac_version" in data) ||
            !("type" in data)
        ) {
            throw new Error(
                "Response does not appear to be a valid STAC entity",
            );
        }

        return data as STACEntity;
    }

    async fetchCatalog(
        catalogUrl: string,
        baseUrlOverride?: string,
    ): Promise<STACCatalog | STACCollection> {
        logger.debug(`Fetching STAC catalog from: ${catalogUrl}`);
        const entity = await this.fetchEntity(catalogUrl, baseUrlOverride);

        if (!isSTACCatalog(entity) && !isSTACCollection(entity)) {
            throw new Error(
                `Expected STAC Catalog or Collection but got type: ${entity.type}`,
            );
        }

        const label = isSTACCollection(entity) ? "Collection" : "Catalog";
        logger.debug(
            `Loaded STAC ${label}: ${entity.id} (${entity.title || "untitled"})`,
        );
        return entity;
    }

    /**
     * Fetch all collections from a STAC API /collections endpoint.
     * This endpoint returns a Collections response (not a single entity),
     * so we bypass fetchEntity validation.
     */
    async fetchCollections(
        collectionsUrl: string,
        baseUrlOverride?: string,
    ): Promise<STACCollection[]> {
        logger.debug(`Fetching STAC collections from: ${collectionsUrl}`);

        const data: unknown = await this.request(
            collectionsUrl,
            baseUrlOverride,
        );

        if (
            !data ||
            typeof data !== "object" ||
            !("collections" in data) ||
            !Array.isArray((data as Record<string, unknown>).collections)
        ) {
            throw new Error(
                "Response does not appear to be a valid STAC collections response",
            );
        }

        const response = data as STACCollectionsResponse;
        logger.debug(
            `Loaded ${response.collections.length} collections from: ${collectionsUrl}`,
        );
        return response.collections as STACCollection[];
    }

    /**
     * Fetches all items from a paginated STAC API endpoint.
     * Follows "next" links until maxPages is reached or no further pages exist.
     */
    async fetchItemsAll(
        url: string,
        baseUrlOverride?: string,
    ): Promise<STACItem[]> {
        const maxPages = this.config.maxPages ?? 10;
        const allItems: STACItem[] = [];
        let nextUrl: string | null = url;
        let page = 0;

        while (nextUrl && page < maxPages) {
            const data = await this.request(nextUrl, baseUrlOverride);
            const { items, nextHref } = parseItemsResponse(data, nextUrl);
            allItems.push(...items);
            nextUrl = nextHref;
            page++;
        }

        if (nextUrl) {
            logger.warn(
                `Stopped paginating after ${maxPages} pages for ${url}`,
            );
        }

        return allItems;
    }

    // ---- private ----

    private async request(
        url: string,
        baseUrlOverride?: string,
    ): Promise<unknown> {
        const absoluteUrl = this.resolveUrl(url, baseUrlOverride);
        const timeout = this.config.timeout ?? 10_000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(absoluteUrl, {
                headers: { Accept: "application/json", ...this.config.headers },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            return await response.json();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to fetch from ${url}: ${message}`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private resolveUrl(url: string, baseUrlOverride?: string): string {
        const base = baseUrlOverride ?? this.config.baseUrl;
        if (!base) {
            return url;
        }

        try {
            return new URL(url, base).href;
        } catch {
            return url;
        }
    }
}

/**
 * Parses a STAC response into items and the next page link.
 * Handles both single items and FeatureCollections with pagination links.
 */
function parseItemsResponse(
    data: unknown,
    sourceUrl: string,
): { items: STACItem[]; nextHref: string | null } {
    if (!data || typeof data !== "object") {
        throw new Error(`Invalid response from ${sourceUrl}`);
    }

    const record = data as Record<string, unknown>;

    // Single Item
    if (record.type === "Feature") {
        return { items: [data as STACItem], nextHref: null };
    }

    // FeatureCollection
    if ("features" in record && Array.isArray(record.features)) {
        const fc = data as {
            features: STACItem[];
            links?: Array<{ rel: string; href: string }>;
        };
        const nextLink = fc.links?.find((l) => l.rel === "next");
        return {
            items: fc.features,
            nextHref: nextLink?.href ?? null,
        };
    }

    throw new Error(
        `Response from ${sourceUrl} is not a valid STAC Item or FeatureCollection`,
    );
}
