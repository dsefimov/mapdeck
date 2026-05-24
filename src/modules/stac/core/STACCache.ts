import type { STACEntity, STACFeatureCollection } from "../types";

type StorableEntity = Exclude<STACEntity, STACFeatureCollection>;

interface CacheEntry {
    entity: StorableEntity;
    timestamp: number;
    ttl: number;
}

const DEFAULT_TTL = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 100;

function isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
}

function getEntityKey(entity: StorableEntity): string {
    return `${entity.type}:${entity.id}`;
}

export class STACCache {
    private entries = new Map<string, CacheEntry>();

    constructor(
        private readonly maxSize = DEFAULT_MAX_SIZE,
        private readonly defaultTtl = DEFAULT_TTL,
    ) {}

    store(entity: StorableEntity, ttl = this.defaultTtl): void {
        const key = getEntityKey(entity);
        if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
            this.evictOldest();
        }
        this.entries.set(key, { entity, timestamp: Date.now(), ttl });
    }

    get<T extends STACEntity>(type: string, id: string): T | undefined {
        const key = `${type}:${id}`;
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (isExpired(entry)) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.entity as T;
    }

    clear(): void {
        this.entries.clear();
    }

    private evictOldest(): void {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, entry] of this.entries) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) this.entries.delete(oldestKey);
    }
}
