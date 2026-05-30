import { observable, runInAction } from "mobx";
import {
    type SourceAdapter,
    type TreeNode,
    type ReportRole,
    LayerTreeNodeTypes,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import { type STACConfig } from "../core/STACConfig";
import { STACClient } from "../core/STACClient";
import { STACCache } from "../core/STACCache";
import { STACEntityMapper } from "../mapping/STACEntityMapper";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import type { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import { resolveBaseUrl, filterLinksByRel } from "../utils/url";
import {
    isSTACCollection,
    isSTACItem,
    type STACCatalog,
    type STACCollection,
    type STACItem,
} from "../types";

interface InitializedState {
    client: STACClient;
    cache: STACCache;
    mapper: STACEntityMapper;
    config: STACConfig;
}

export class STACTreeAdapter implements SourceAdapter {
    readonly type = "stac";
    private state: InitializedState | null = null;

    constructor(
        private readonly layerConfigRegistry: LayerConfigRegistry,
        readonly roleRegistry: RoleResolverRegistry,
    ) {}

    initialize(config: Record<string, unknown>): void {
        const stacConfig = extractConfig(config);
        const cache = new STACCache();

        this.state = {
            config: stacConfig,
            cache,
            client: new STACClient(stacConfig),
            mapper: new STACEntityMapper(
                cache,
                this.layerConfigRegistry,
                this.roleRegistry,
            ),
        };

        logger.debug("STAC adapter initialized");
    }

    async fetchRoot(): Promise<TreeNode[]> {
        const { client, cache, mapper, config } = this.getState();

        try {
            const catalog = await client.fetchCatalog(config.url);
            cache.store(catalog);

            const nodes: TreeNode[] = [];

            // Handle child links → collections (static STAC)
            const collectionNodes = await fetchChildCollections(catalog, {
                client,
                cache,
                mapper,
            });
            for (const n of collectionNodes) {
                if (n) nodes.push(n);
            }

            // Handle collections API endpoint (STAC API — e.g., HubOcean)
            const apiCollectionsLink = filterLinksByRel(
                catalog.links,
                "collections",
            )[0];
            if (apiCollectionsLink) {
                logger.debug("STAC mode: api");
                const apiNodes = await fetchCollectionsFromApi(
                    apiCollectionsLink.href,
                    { client, cache, mapper },
                );
                for (const n of apiNodes) {
                    if (n) nodes.push(n);
                }
            } else {
                logger.debug("STAC mode: static");
            }

            // Handle item links directly in catalog (items linked without Collection container)
            const itemNodes = await fetchCatalogItems(catalog, {
                client,
                cache,
                mapper,
            });
            for (const n of itemNodes) {
                if (n) nodes.push(n);
            }

            if (nodes.length === 0) {
                logger.warn(
                    `No children or items found in catalog ${catalog.id}`,
                );
            }

            return nodes;
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

        const baseUrl = resolveBaseUrl(collection.links, config.baseUrl);
        const ctx = { client, cache, mapper };

        const { itemPromises, collectionPromises } = buildChildFetchPromises(
            collection,
            baseUrl,
            ctx,
        );

        const itemResults = await Promise.all(itemPromises);
        const collectionNodes = (await Promise.all(collectionPromises)).flat();

        // Merge collected reports from items into parent GroupNode
        runInAction(() => {
            for (const result of itemResults) {
                parent.roles.reports.push(...result.collectedReports);
            }
        });

        const itemNodes = itemResults.flatMap((r) => r.nodes);
        return [...itemNodes, ...collectionNodes];
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

interface FetchItemsResult {
    nodes: TreeNode[];
    collectedReports: ReportRole[];
}

function collectReportsFromNodes(nodes: TreeNode[]): ReportRole[] {
    return nodes.flatMap((n) => n.roles?.reports ?? []);
}

async function fetchChildCollections(
    catalog: STACCatalog | STACCollection,
    ctx: FetchContext,
): Promise<(TreeNode | null)[]> {
    const childLinks = filterLinksByRel(catalog.links, "child");
    if (childLinks.length === 0) return [];

    logger.debug(
        `Found ${childLinks.length} child link(s), fetching collections`,
    );

    return Promise.all(
        childLinks.map(async (link) => {
            try {
                const entity = await ctx.client.fetchEntity(link.href);
                if (!isSTACCollection(entity)) return null;
                ctx.cache.store(entity);
                return ctx.mapper.mapCollectionToGroupNode(
                    entity,
                    observable.array<string>([]),
                );
            } catch (error) {
                logger.warn(`Failed to fetch child ${link.href}:`, error);
                return null;
            }
        }),
    );
}

async function fetchCatalogItems(
    catalog: STACCatalog | STACCollection,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    const itemLinks = filterLinksByRel(catalog.links, "item");
    if (itemLinks.length === 0) return [];

    const results: TreeNode[] = [];
    for (const link of itemLinks) {
        try {
            const items = await ctx.client.fetchItemsAll(link.href);
            items.forEach((item) => ctx.cache.store(item));
            for (const item of items) {
                const node = ctx.mapper.mapItemToLayerNode(item);
                if (node) results.push(node);
            }
        } catch (error) {
            logger.warn(`Failed to fetch item ${link.href}:`, error);
        }
    }
    return results;
}

/**
 * Fetch collections from a STAC API /collections endpoint
 * and map each to a GroupNode.
 */
async function fetchCollectionsFromApi(
    collectionsUrl: string,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    try {
        const collections = await ctx.client.fetchCollections(collectionsUrl);
        const nodes: TreeNode[] = [];

        for (const collection of collections) {
            ctx.cache.store(collection);
            nodes.push(
                ctx.mapper.mapCollectionToGroupNode(
                    collection,
                    observable.array<string>([]),
                ),
            );
        }

        logger.debug(
            `Mapped ${nodes.length} collection(s) from API: ${collectionsUrl}`,
        );
        return nodes;
    } catch (error) {
        logger.warn(
            `Failed to fetch collections from ${collectionsUrl}:`,
            error,
        );
        return [];
    }
}

function buildChildFetchPromises(
    collection: STACCollection,
    baseUrl: string | undefined,
    ctx: FetchContext,
): {
    itemPromises: Promise<FetchItemsResult>[];
    collectionPromises: Promise<TreeNode[]>[];
} {
    const itemPromises: Promise<FetchItemsResult>[] = [];
    const collectionPromises: Promise<TreeNode[]>[] = [];
    const itemsLink = filterLinksByRel(collection.links, "items")[0];
    const itemLinks = filterLinksByRel(collection.links, "item");

    if (itemsLink) {
        itemPromises.push(fetchItemsFromUrl(itemsLink.href, baseUrl, ctx));
    } else if (itemLinks.length > 0) {
        for (const link of itemLinks) {
            itemPromises.push(fetchItemsFromUrl(link.href, baseUrl, ctx));
        }
    } else {
        logger.warn(
            `No items or item links found in collection ${collection.id}`,
        );
    }

    // "collection" rel is a back-reference from Item to parent, not a navigation link
    const childLinks = filterLinksByRel(collection.links, "child");

    for (const link of childLinks) {
        collectionPromises.push(fetchChildCollection(link.href, baseUrl, ctx));
    }

    return { itemPromises, collectionPromises };
}

async function fetchItemsFromUrl(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<FetchItemsResult> {
    try {
        const items = await ctx.client.fetchItemsAll(href, baseUrl);
        const enriched = await enrichItems(items, ctx);
        enriched.forEach((item) => ctx.cache.store(item));

        const nodes = mapItemsToNodes(enriched, ctx.mapper);
        const collectedReports = collectReportsFromNodes(nodes);

        return { nodes, collectedReports };
    } catch (error) {
        logger.warn(`Failed to load items from ${href}:`, error);
        return { nodes: [], collectedReports: [] };
    }
}

/**
 * Enrich items that have no assets by fetching individual item details.
 * Some STAC APIs (e.g., HubOcean) return lightweight items in list
 * responses with empty `assets`, but full assets are available when
 * fetching each item individually via its `self` link.
 *
 * Requests are batched to avoid 429 rate limiting.
 */
const ENRICH_BATCH_SIZE = 5;

async function enrichItems(
    items: STACItem[],
    ctx: FetchContext,
): Promise<STACItem[]> {
    const toEnrich: STACItem[] = [];
    const enriched: STACItem[] = [];

    for (const item of items) {
        const assetKeys = item.assets ? Object.keys(item.assets) : [];
        if (assetKeys.length === 0) {
            toEnrich.push(item);
        } else {
            enriched.push(item);
        }
    }

    if (toEnrich.length === 0) return items;

    logger.debug(
        `Enriching ${toEnrich.length} item(s) in batches of ${ENRICH_BATCH_SIZE}`,
    );

    let enrichedCount = 0;

    for (let i = 0; i < toEnrich.length; i += ENRICH_BATCH_SIZE) {
        const batch = toEnrich.slice(i, i + ENRICH_BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(async (item) => {
                const selfLink = item.links?.find((l) => l.rel === "self");
                if (!selfLink?.href) return null;
                const entity = await ctx.client.fetchEntity(selfLink.href);
                if (!isSTACItem(entity)) {
                    logger.warn(
                        `Self link ${selfLink.href} returned non-Item: ${entity.type}`,
                    );
                    return null;
                }
                return entity;
            }),
        );

        for (const result of results) {
            if (result.status === "fulfilled" && result.value) {
                enriched.push(result.value);
                ctx.cache.store(result.value);
                enrichedCount++;
            }
        }
    }

    if (enrichedCount < toEnrich.length) {
        logger.debug(
            `Enriched ${enrichedCount} of ${toEnrich.length} item(s) ` +
                `(${toEnrich.length - enrichedCount} failed or have no self link)`,
        );
    }

    return enriched;
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

    const parsedMaxPages = parseMaxPages(raw.maxPages);
    if (parsedMaxPages !== undefined) result.maxPages = parsedMaxPages;

    return result;
}

function parseMaxPages(raw: unknown): number | undefined {
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return undefined;
}

function parseHeaders(raw: unknown): Record<string, string> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") headers[k] = v;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
}
