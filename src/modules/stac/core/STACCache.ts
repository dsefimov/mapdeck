import type { STACEntity, STACFeatureCollection } from "../types";
import { AsyncCache } from "@core/common/state";

type StorableEntity = Exclude<STACEntity, STACFeatureCollection>;

const DEFAULT_TTL = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 100;

function getEntityKey(entity: StorableEntity): string {
    return `${entity.type}:${entity.id}`;
}

/**
 * TTL cache for STAC entities, backed by the shared AsyncCache.
 */
export class STACCache {
    private readonly cache = new AsyncCache<string, StorableEntity>({
        ttl: DEFAULT_TTL,
        maxSize: DEFAULT_MAX_SIZE,
    });

    store(entity: StorableEntity, ttl = DEFAULT_TTL): void {
        this.cache.set(getEntityKey(entity), entity, { ttl });
    }

    /** The key already encodes the entity kind — callers narrow with the
     * shared type guards instead of trusting a generic. */
    get(
        type: StorableEntity["type"],
        id: string,
    ): StorableEntity | undefined {
        return this.cache.get(`${type}:${id}`);
    }

    clear(): void {
        this.cache.clear();
    }
}
