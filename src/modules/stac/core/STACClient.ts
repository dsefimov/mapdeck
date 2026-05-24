/**
 * STAC HTTP client
 * Replaces api.ts with a class-based approach
 */

import { logger } from "@core/shared/diagnostics/logger";
import type { STACConfig } from "./STACConfig";
import type {
    STACCatalog,
    STACEntity,
    STACItem,
    STACFeatureCollection,
} from "../types";
import { isSTACCatalog, isSTACItem, isSTACFeatureCollection } from "../types";

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
    ): Promise<STACCatalog> {
        logger.info(`Fetching STAC catalog from: ${catalogUrl}`);
        const entity = await this.fetchEntity(catalogUrl, baseUrlOverride);

        if (!isSTACCatalog(entity)) {
            throw new Error(
                `Expected STAC Catalog but got type: ${entity.type}`,
            );
        }

        logger.info(
            `Loaded STAC catalog: ${entity.id} (${entity.title || "untitled"})`,
        );
        return entity;
    }

    async fetchItems(
        itemLink: string,
        baseUrlOverride?: string,
    ): Promise<STACItem[]> {
        const entity = await this.fetchEntity(itemLink, baseUrlOverride);

        if (isSTACItem(entity)) {
            return [entity];
        }
        if (isSTACFeatureCollection(entity)) {
            return entity.features;
        }

        throw new Error(
            `Expected STAC Item or FeatureCollection but got type: ${entity.type}`,
        );
    }

    /**
     * Fetch items from STAC API /items endpoint.
     * This endpoint returns a FeatureCollection that may lack root-level stac_version,
     * so we bypass fetchEntity validation.
     */
    async fetchItemsFromCollection(
        itemsUrl: string,
        baseUrlOverride?: string,
    ): Promise<STACItem[]> {
        logger.info(`Fetching STAC items from: ${itemsUrl}`);

        const data: unknown = await this.request(itemsUrl, baseUrlOverride);

        if (
            !data ||
            typeof data !== "object" ||
            !("features" in data) ||
            !Array.isArray((data as Record<string, unknown>).features)
        ) {
            throw new Error(
                "Response does not appear to be a valid STAC API items response",
            );
        }

        const fc = data as STACFeatureCollection;
        logger.info(`Loaded ${fc.features.length} items from: ${itemsUrl}`);
        return fc.features;
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
