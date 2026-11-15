/**
 * STAC HTTP client
 */

import { logger } from "@core/lib/logger";
import { boundedFetch } from "@core/lib/async";
import type { STACConfig } from "./STACConfig";
import { DEFAULT_MAX_PAGES, DEFAULT_TIMEOUT_MS } from "./STACConfig";
import type {
    STACCatalog,
    STACCollection,
    STACCollectionsResponse,
    STACEntity,
    STACItem,
} from "../types";
import { isSTACCatalog, isSTACCollection } from "../types";

/**
 * Entity types the single-entity gate admits. FeatureCollection pages
 * have their own gate in parseItemsResponse.
 */
const ENTITY_TYPES: ReadonlySet<string> = new Set([
    "Catalog",
    "Collection",
    "Feature",
]);

/**
 * Shape guard for a fetched entity: the wire value of `type` must be one
 * of the known kinds and `id` a string — presence checks alone would let
 * any JSON object through as a "Collection".
 */
function isStacEntityShape(data: unknown): data is STACEntity {
    if (!data || typeof data !== "object") return false;
    const record = data as Record<string, unknown>;
    return (
        typeof record.stac_version === "string" &&
        typeof record.type === "string" &&
        ENTITY_TYPES.has(record.type) &&
        typeof record.id === "string"
    );
}

/** Element guard for /collections responses. */
function isCollectionShape(value: unknown): value is STACCollection {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return (
        record.type === "Collection" && typeof record.id === "string"
    );
}

/** Element guard for item listings and single-feature responses. */
function isItemShape(value: unknown): value is STACItem {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return record.type === "Feature" && typeof record.id === "string";
}

export class STACClient {
    constructor(private readonly config: STACConfig) {}

    async fetchEntity(
        url: string,
        baseUrlOverride?: string,
    ): Promise<STACEntity> {
        const data: unknown = await this.request(url, baseUrlOverride);

        if (!isStacEntityShape(data)) {
            throw new Error(
                "Response does not appear to be a valid STAC entity",
            );
        }

        return data;
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

        const raw = (data as STACCollectionsResponse).collections;
        const collections = raw.filter(isCollectionShape);
        const dropped = raw.length - collections.length;
        if (dropped > 0) {
            logger.warn(
                `Dropped ${dropped} malformed collection(s) from: ${collectionsUrl}`,
            );
        }
        logger.debug(
            `Loaded ${collections.length} collections from: ${collectionsUrl}`,
        );
        return collections;
    }

    /**
     * Fetches all items from a paginated STAC API endpoint.
     * Follows "next" links until maxPages is reached or no further pages exist.
     */
    async fetchItemsAll(
        url: string,
        baseUrlOverride?: string,
    ): Promise<STACItem[]> {
        const maxPages = this.config.maxPages ?? DEFAULT_MAX_PAGES;
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


    private async request(
        url: string,
        baseUrlOverride?: string,
    ): Promise<unknown> {
        const absoluteUrl = this.resolveUrl(url, baseUrlOverride);
        const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;

        // Only the network/JSON stage is wrapped — an HTTP status error is
        // already precise and must not be re-wrapped by the catch below.
        let response: Response;
        try {
            response = await boundedFetch(absoluteUrl, {
                headers: { Accept: "application/json", ...this.config.headers },
                timeoutMs: timeout,
            });
        } catch (error) {
            if (
                error instanceof TypeError &&
                error.message === "Failed to fetch"
            ) {
                // The browser reports CORS refusals exactly like network
                // deaths; only the text differs, so translate it here —
                // the user-facing hint is the actionable part.
                throw new Error(
                    `Failed to fetch from ${url}: network error or CORS ` +
                        `(the STAC server must allow cross-origin reads)`,
                );
            }
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to fetch from ${url}: ${message}`);
        }

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${response.statusText} (${absoluteUrl})`,
            );
        }

        try {
            return await response.json();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse JSON from ${url}: ${message}`);
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
/** Parse a FeatureCollection page; null when the payload is not one. */
function parseFeatureCollection(
    record: Record<string, unknown>,
    sourceUrl: string,
): { items: STACItem[]; nextHref: string | null } | null {
    if (!("features" in record) || !Array.isArray(record.features)) {
        return null;
    }
    const fc = record as unknown as {
        features: unknown[];
        links?: Array<{ rel: string; href: string }>;
    };
    const items = fc.features.filter(isItemShape);
    const dropped = fc.features.length - items.length;
    if (dropped > 0) {
        logger.warn(
            `Dropped ${dropped} malformed item(s) from: ${sourceUrl}`,
        );
    }
    const nextLink = fc.links?.find((l) => l.rel === "next");
    return { items, nextHref: nextLink?.href ?? null };
}

function parseItemsResponse(
    data: unknown,
    sourceUrl: string,
): { items: STACItem[]; nextHref: string | null } {
    if (!data || typeof data !== "object") {
        throw new Error(`Invalid response from ${sourceUrl}`);
    }

    const record = data as Record<string, unknown>;

    if (record.type === "Feature") {
        if (!isItemShape(data)) {
            throw new Error(
                `Response from ${sourceUrl} is not a valid STAC Item or FeatureCollection`,
            );
        }
        return { items: [data], nextHref: null };
    }

    const page = parseFeatureCollection(record, sourceUrl);
    if (page) return page;

    throw new Error(
        `Response from ${sourceUrl} is not a valid STAC Item or FeatureCollection`,
    );
}
