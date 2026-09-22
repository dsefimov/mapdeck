import type { SourceAdapter } from "@core/contracts";
import { type TreeNode, type GroupNode, type LayerNode, LayerTreeNodeTypes } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { type STACConfig } from "../core/STACConfig";
import { STACClient } from "../core/STACClient";
import { STACCache } from "../core/STACCache";
import { STACEntityMapper } from "../mapping/STACEntityMapper";
import type { CapabilitySource } from "../mapping/capabilities";
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
        readonly roleRegistry: RoleResolverRegistry,
        private capabilitySource: CapabilitySource,
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
                this.roleRegistry,
                this.capabilitySource,
            ),
        };

        logger.debug("STAC adapter initialized");
    }

    async fetchRoot(): Promise<TreeNode[]> {
        const { client, cache, mapper, config } = this.getState();
        const ctx: FetchContext = { client, cache, mapper };

        try {
            const catalog = await client.fetchCatalog(config.url);
            cache.store(catalog);

            const batches: TreeNode[][] = [
                (await fetchChildCollections(catalog, ctx)).filter(
                    (n): n is GroupNode => n !== null,
                ),
            ];

            const apiCollectionsLink = filterLinksByRel(
                catalog.links,
                "collections",
            )[0];
            if (apiCollectionsLink) {
                logger.debug("STAC mode: api");
                batches.push(
                    await fetchCollectionsFromApi(
                        apiCollectionsLink.href,
                        ctx,
                    ),
                );
            } else {
                logger.debug("STAC mode: static");
            }

            batches.push(await fetchCatalogItems(catalog, ctx));

            const nodes = dedupeById(batches.flat());
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
        const itemNodes = itemResults.flat();
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


interface FetchContext {
    client: STACClient;
    cache: STACCache;
    mapper: STACEntityMapper;
}

/**
 * Fetch, validate, cache and map one collection link; null on any failure
 * or when the entity is not a collection.
 */
async function loadCollectionNode(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<GroupNode | null> {
    try {
        const entity = await ctx.client.fetchEntity(href, baseUrl);
        if (!isSTACCollection(entity)) return null;
        ctx.cache.store(entity);
        return ctx.mapper.mapCollectionToGroupNode(entity);
    } catch (error) {
        logger.warn(`Failed to load collection ${href}:`, error);
        return null;
    }
}

/**
 * One collection can arrive both as a child link and through the
 * /collections API — without dedupe the tree would render it twice.
 */
function dedupeById(nodes: readonly TreeNode[]): TreeNode[] {
    const seen = new Set<string>();
    const unique: TreeNode[] = [];
    for (const node of nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        unique.push(node);
    }
    return unique;
}

async function fetchChildCollections(
    catalog: STACCatalog | STACCollection,
    ctx: FetchContext,
): Promise<(GroupNode | null)[]> {
    const childLinks = filterLinksByRel(catalog.links, "child");
    if (childLinks.length === 0) return [];

    logger.debug(
        `Found ${childLinks.length} child link(s), fetching collections`,
    );

    return Promise.all(
        childLinks.map((link) => loadCollectionNode(link.href, undefined, ctx)),
    );
}

async function fetchCatalogItems(
    catalog: STACCatalog | STACCollection,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    const itemLinks = filterLinksByRel(catalog.links, "item");
    if (itemLinks.length === 0) return [];

    logger.debug(
        `Found ${itemLinks.length} item link(s) at the catalog root`,
    );

    // Root item links run the same pipeline as collection items — parallel
    // and enriched: a lightweight listing (items without assets) can sit at
    // the root just as well, and root links are as independent of each
    // other as collection ones. Per-link failures degrade inside.
    const batches = await Promise.all(
        itemLinks.map((link) => fetchItemsFromUrl(link.href, undefined, ctx)),
    );
    return batches.flat();
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
                ctx.mapper.mapCollectionToGroupNode(collection),
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
    itemPromises: Promise<TreeNode[]>[];
    collectionPromises: Promise<TreeNode[]>[];
} {
    const itemPromises: Promise<TreeNode[]>[] = [];
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
): Promise<TreeNode[]> {
    try {
        const items = await ctx.client.fetchItemsAll(href, baseUrl);
        const enriched = await enrichItems(items, ctx);
        enriched.forEach((item) => ctx.cache.store(item));
        return mapItemsToNodes(enriched, ctx.mapper);
    } catch (error) {
        logger.warn(`Failed to load items from ${href}:`, error);
        return [];
    }
}

/**
 * Enrich items that arrive without assets by fetching each item's full
 * form through its `self` link — a listing may embed lightweight items,
 * and the standard's self link is the canonical way back to the complete
 * representation.
 *
 * Requests are batched to avoid 429 rate limiting.
 */
const ENRICH_BATCH_SIZE = 5;

/**
 * Ceiling on per-item enrichment fetches: one N+1 walk over a huge listing
 * must not turn into thousands of requests. Items beyond the cap keep their
 * list-response shape (no assets) instead of hanging the tree load.
 */
const ENRICH_MAX_ITEMS = 200;

function partitionByAssets(
    items: STACItem[],
): { withAssets: STACItem[]; assetless: STACItem[] } {
    const withAssets: STACItem[] = [];
    const assetless: STACItem[] = [];
    for (const item of items) {
        const assetKeys = item.assets ? Object.keys(item.assets) : [];
        (assetKeys.length === 0 ? assetless : withAssets).push(item);
    }
    return { withAssets, assetless };
}

/** Fetches one item's full shape through its self link, null if impossible. */
async function fetchFullItem(
    item: STACItem,
    ctx: FetchContext,
): Promise<STACItem | null> {
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
}

/** One enrichment batch: settled self-link fetches, cached on success. */
async function enrichBatch(
    batch: STACItem[],
    ctx: FetchContext,
): Promise<STACItem[]> {
    const results = await Promise.allSettled(
        batch.map((item) => fetchFullItem(item, ctx)),
    );
    const enriched: STACItem[] = [];
    for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
            enriched.push(result.value);
            ctx.cache.store(result.value);
        }
    }
    return enriched;
}

async function enrichItems(
    items: STACItem[],
    ctx: FetchContext,
): Promise<STACItem[]> {
    const { withAssets, assetless } = partitionByAssets(items);
    if (assetless.length === 0) return items;

    const enrichable = assetless.slice(0, ENRICH_MAX_ITEMS);
    if (assetless.length > ENRICH_MAX_ITEMS) {
        logger.warn(
            `Enriching only the first ${ENRICH_MAX_ITEMS} of ` +
                `${assetless.length} asset-less item(s) — the rest keep their ` +
                `list shape`,
        );
    }

    logger.debug(
        `Enriching ${enrichable.length} item(s) in batches of ${ENRICH_BATCH_SIZE}`,
    );

    let enrichedCount = 0;
    for (let i = 0; i < enrichable.length; i += ENRICH_BATCH_SIZE) {
        const batch = await enrichBatch(
            enrichable.slice(i, i + ENRICH_BATCH_SIZE),
            ctx,
        );
        enrichedCount += batch.length;
        withAssets.push(...batch);
    }

    if (enrichedCount < assetless.length) {
        logger.debug(
            `Enriched ${enrichedCount} of ${assetless.length} item(s) ` +
                `(${assetless.length - enrichedCount} failed or have no self link)`,
        );
    }

    return withAssets;
}

async function fetchChildCollection(
    href: string,
    baseUrl: string | undefined,
    ctx: FetchContext,
): Promise<TreeNode[]> {
    const node = await loadCollectionNode(href, baseUrl, ctx);
    return node ? [node] : [];
}

function mapItemsToNodes(
    items: STACItem[],
    mapper: STACEntityMapper,
): TreeNode[] {
    return items
        .map((item) => mapper.mapItemToLayerNode(item))
        .filter((node): node is LayerNode => node !== null);
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
