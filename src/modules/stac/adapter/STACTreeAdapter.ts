import { observable } from "mobx";
import {
    type SourceAdapter,
    type TreeNode,
    LayerTreeNodeTypes,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { type STACConfig } from "../core/STACConfig";
import { STACClient } from "../core/STACClient";
import { STACCache } from "../core/STACCache";
import { STACEntityMapper } from "../mapping/STACEntityMapper";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import { resolveBaseUrl, filterLinksByRel } from "../utils/url";
import { isSTACCollection, type STACCollection, type STACItem } from "../types";

interface InitializedState {
    client: STACClient;
    cache: STACCache;
    mapper: STACEntityMapper;
    config: STACConfig;
}

export class STACTreeAdapter implements SourceAdapter {
    readonly type = "stac";
    private state: InitializedState | null = null;

    constructor(private readonly layerConfigRegistry: LayerConfigRegistry) {}

    initialize(config: Record<string, unknown>): void {
        const stacConfig = extractConfig(config);
        const cache = new STACCache();

        this.state = {
            config: stacConfig,
            cache,
            client: new STACClient(stacConfig),
            mapper: new STACEntityMapper(cache, this.layerConfigRegistry),
        };

        logger.debug("STAC adapter initialized");
    }

    async fetchRoot(): Promise<TreeNode[]> {
        const { client, cache, mapper, config } = this.getState();

        try {
            const catalog = await client.fetchCatalog(config.url);
            cache.store(catalog);

            const childLinks = filterLinksByRel(catalog.links, "child");

            if (childLinks.length === 0) {
                logger.warn(`No child links found in catalog ${catalog.id}`);
                return [];
            }

            logger.info(
                `Found ${childLinks.length} child link(s), fetching collections`,
            );

            const nodes = await Promise.all(
                childLinks.map(async (link) => {
                    try {
                        const entity = await client.fetchEntity(link.href);
                        if (!isSTACCollection(entity)) return null;
                        cache.store(entity);
                        return mapper.mapCollectionToGroupNode(
                            entity,
                            observable.array<string>([]),
                        );
                    } catch (error) {
                        logger.warn(
                            `Failed to fetch child ${link.href}:`,
                            error,
                        );
                        return null;
                    }
                }),
            );

            return nodes.filter((n): n is TreeNode => n !== null);
        } catch (error) {
            logger.error("Failed to fetch STAC catalog root:", error);
            throw error;
        }
    }

    async fetchChildren(parent: TreeNode): Promise<TreeNode[]> {
        if (parent.type !== LayerTreeNodeTypes.Group) return [];

        const { client, cache, mapper, config } = this.getState();
        const collection = mapper.getSTACCollectionFromNode(parent);
        if (!collection) return [];

        const baseUrl = resolveBaseUrl(collection, config.baseUrl);
        const promises = buildChildFetchPromises(collection, baseUrl, {
            client,
            cache,
            mapper,
        });

        const results = await Promise.all(promises);
        return results.flat();
    }

    dispose(): void {
        this.state?.cache.clear();
        this.state = null;
    }

    private getState(): InitializedState {
        if (!this.state)
            throw new Error("STAC adapter must be initialized before use");
        return this.state;
    }
}

// ---- Pure functions outside class ----

interface FetchContext {
    client: STACClient;
    cache: STACCache;
    mapper: STACEntityMapper;
}

function buildChildFetchPromises(
    collection: STACCollection,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<TreeNode[]>[] {
    const promises: Promise<TreeNode[]>[] = [];
    const itemsLink = filterLinksByRel(collection.links, "items")[0];
    const itemLinks = filterLinksByRel(collection.links, "item");

    if (itemsLink) {
        promises.push(fetchItemsFromApi(itemsLink.href, baseUrl, ctx));
    } else if (itemLinks.length > 0) {
        for (const link of itemLinks) {
            promises.push(fetchItemsFromLink(link.href, baseUrl, ctx));
        }
    } else {
        logger.warn(
            `No items or item links found in collection ${collection.id}`,
        );
    }

    const childLinks = [
        ...filterLinksByRel(collection.links, "child"),
        ...filterLinksByRel(collection.links, "collection"),
    ];

    for (const link of childLinks) {
        promises.push(fetchChildCollection(link.href, baseUrl, ctx));
    }

    return promises;
}

async function fetchItemsFromApi(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    try {
        const items = await ctx.client.fetchItemsFromCollection(href, baseUrl);
        items.forEach((item) => ctx.cache.store(item));
        return mapItemsToNodes(items, ctx.mapper);
    } catch (error) {
        logger.warn(`Failed to load items from ${href}:`, error);
        return [];
    }
}

async function fetchItemsFromLink(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    try {
        const items = await ctx.client.fetchItems(href, baseUrl);
        items.forEach((item) => ctx.cache.store(item));
        return mapItemsToNodes(items, ctx.mapper);
    } catch (error) {
        logger.warn(`Failed to load items from ${href}:`, error);
        return [];
    }
}

async function fetchChildCollection(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    try {
        const entity = await ctx.client.fetchEntity(href, baseUrl);
        if (!isSTACCollection(entity)) return [];
        ctx.cache.store(entity);
        return [
            ctx.mapper.mapCollectionToGroupNode(
                entity,
                observable.array<string>([]),
            ),
        ];
    } catch (error) {
        logger.warn(`Failed to load collection from ${href}:`, error);
        return [];
    }
}

function mapItemsToNodes(
    items: STACItem[],
    mapper: STACEntityMapper,
): TreeNode[] {
    return items
        .map((item) => mapper.mapItemToLayerNode(item))
        .filter((node): node is TreeNode => node !== null);
}

function extractConfig(raw: Record<string, unknown>): STACConfig {
    const url = raw.url;
    if (typeof url !== "string" || !url.trim()) {
        throw new Error("STAC adapter requires 'url' configuration");
    }

    const result: STACConfig = { url: url.trim() };

    const baseUrl = raw.baseUrl;
    if (typeof baseUrl === "string" && baseUrl.trim()) {
        result.baseUrl = baseUrl.trim();
    }

    const timeout = raw.timeout;
    if (typeof timeout === "number" && isFinite(timeout)) {
        result.timeout = timeout;
    }

    const headers = parseHeaders(raw.headers);
    if (headers) result.headers = headers;

    return result;
}

function parseHeaders(raw: unknown): Record<string, string> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") headers[k] = v;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
}
