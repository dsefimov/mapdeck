import { makeAutoObservable, runInAction } from "mobx";
import type { RootStore } from "@core/framework/store";
import { isLayerNode, type AttributeRole } from "@core/framework/types";
import type {
    AttributeFetchRequest,
    AttributeSourceConfig,
    AttributeCacheEntry,
} from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 30 * 1000; // Retry failed fetches after 30 seconds

type SortParams = { sortBy?: string; sortDirection?: "asc" | "desc" };

export class AttributeDataStore {
    private readonly cache = new Map<string, AttributeCacheEntry>();
    private readonly controllers = new Map<string, AbortController>();

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }

    async fetch(
        nodeId: string,
        options: AttributeFetchRequest = {},
    ): Promise<AttributeCacheEntry> {
        const cacheKey = this._buildCacheKey(nodeId, options);
        const cached = this.cache.get(cacheKey);
        const startIndex = options.startIndex ?? 0;

        if (this._isCacheValid(cached, startIndex)) {
            return cached!;
        }

        this._cancelRequest(cacheKey);
        const controller = new AbortController();
        this.controllers.set(cacheKey, controller);
        const existingEntry = this.cache.get(cacheKey);
        this.cache.set(
            cacheKey,
            existingEntry
                ? { ...existingEntry, error: null, loading: true }
                : {
                      features: [],
                      totalFeatures: 0,
                      timestamp: Date.now(),
                      error: null,
                      loading: true,
                  },
        );

        try {
            await this._executeFetch(nodeId, options, cacheKey, controller);
        } catch (error) {
            if (!controller.signal.aborted) {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.error(
                    `[AttributeData] Fetch failed [${cacheKey}]:`,
                    error,
                );
                runInAction(() => {
                    const entry = this.cache.get(cacheKey);
                    if (entry) {
                        this.cache.set(cacheKey, {
                            ...entry,
                            error: message,
                            loading: false,
                        });
                    }
                });
            }
        } finally {
            runInAction(() => {
                this.controllers.delete(cacheKey);
            });
        }

        return this._getCacheOrDefault(cacheKey);
    }

    getCache(nodeId: string, sort?: SortParams): AttributeCacheEntry | null {
        return this.cache.get(this._buildCacheKey(nodeId, sort ?? {})) ?? null;
    }

    isLoading(nodeId: string, sort?: SortParams): boolean {
        return (
            this.cache.get(this._buildCacheKey(nodeId, sort ?? {}))?.loading ??
            false
        );
    }

    dispose(): void {
        this.clearCache();
    }

    clearCache(nodeId?: string, sort?: SortParams): void {
        if (nodeId) {
            const key = this._buildCacheKey(nodeId, sort ?? {});
            this.cache.delete(key);
            this.controllers.get(key)?.abort();
            this.controllers.delete(key);
        } else {
            this.cache.clear();
            for (const ctrl of this.controllers.values()) ctrl.abort();
            this.controllers.clear();
        }
    }

    invalidateCache(nodeId: string, sort?: SortParams): void {
        const key = this._buildCacheKey(nodeId, sort ?? {});
        const cached = this.cache.get(key);
        if (cached) this.cache.set(key, { ...cached, timestamp: 0 });
    }

    // ==================== Private ====================

    private _isCacheValid(
        cached: AttributeCacheEntry | undefined,
        startIndex: number,
    ): boolean {
        if (!cached || cached.loading) return false;

        // If entry has an error, consider it expired after ERROR_CACHE_TTL_MS
        if (cached.error) {
            return Date.now() - cached.timestamp < ERROR_CACHE_TTL_MS;
        }

        return (
            Date.now() - cached.timestamp < CACHE_TTL_MS &&
            startIndex < cached.features.length
        );
    }

    private async _executeFetch(
        nodeId: string,
        options: AttributeFetchRequest,
        cacheKey: string,
        controller: AbortController,
    ): Promise<void> {
        const role = this._getAttributeRole(nodeId);
        const config = this._extractSourceConfig(role);
        const adapter = this.rootStore.attributeAdapterFactory.get(role);

        const result = await adapter.fetchPage(
            config,
            options,
            controller.signal,
        );
        if (controller.signal.aborted) return;

        const existing = this.cache.get(cacheKey);
        const startIndex = options.startIndex ?? 0;
        const features =
            startIndex === 0
                ? result.rows
                : [...(existing?.features ?? []), ...result.rows];

        runInAction(() => {
            this.cache.set(cacheKey, {
                features,
                totalFeatures: result.totalFeatures,
                timestamp: Date.now(),
                error: null,
                loading: false,
            });
        });
    }

    private _buildCacheKey(
        nodeId: string,
        req: Partial<AttributeFetchRequest>,
    ): string {
        const parts = [nodeId];
        if (req.sortBy && req.sortDirection)
            parts.push(`s:${req.sortBy}:${req.sortDirection}`);
        if (req.filters && Object.keys(req.filters).length > 0) {
            const stable = JSON.stringify(
                req.filters,
                Object.keys(req.filters).sort((a, b) => a.localeCompare(b)),
            );
            // No hash — filters are typically single-field and short
            parts.push(`f:${stable}`);
        }
        return parts.join("|");
    }

    private _getAttributeRole(nodeId: string): AttributeRole {
        const node = this.rootStore.treeStore.getNode(nodeId);
        if (!node || !isLayerNode(node))
            throw new Error(`Node ${nodeId} not found or not a layer`);
        const role = node.roles.attribute;
        if (!role) throw new Error(`No attribute role for ${nodeId}`);
        return role;
    }

    private _extractSourceConfig(role: AttributeRole): AttributeSourceConfig {
        const extraParams: Record<string, string> = {};
        if (role.attributeConfig.params) {
            for (const [k, v] of Object.entries(role.attributeConfig.params)) {
                if (typeof v === "string") extraParams[k] = v;
            }
        }
        return {
            endpointUrl: role.attributeConfig.endpointUrl,
            ...(Object.keys(extraParams).length > 0 && { extraParams }),
        };
    }

    private _getCacheOrDefault(key: string): AttributeCacheEntry {
        return (
            this.cache.get(key) ?? {
                features: [],
                totalFeatures: 0,
                timestamp: Date.now(),
                error: null,
                loading: false,
            }
        );
    }

    private _cancelRequest(key: string): void {
        const ctrl = this.controllers.get(key);
        if (ctrl) {
            ctrl.abort();
            this.controllers.delete(key);
        }
    }
}
