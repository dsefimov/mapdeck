import { makeAutoObservable, observable, runInAction } from "mobx";
import { AsyncState } from "./AsyncState";

/**
 * Options for an {@link AsyncCache}.
 */
export interface AsyncCacheOptions {
    /** Default time-to-live for entries, in ms. */
    ttl: number;
    /** TTL for entries whose last fetch failed, in ms. Shorter than `ttl` makes failed fetches retry sooner. */
    errorTtl?: number;
    /** Maximum number of entries; the oldest entry is evicted on overflow. */
    maxSize?: number;
}

interface CacheEntry<V> {
    /** Undefined until the entry's first successful fetch lands. */
    value: V | undefined;
    timestamp: number;
    /** When the entry's most recent fetch failed — anchors `errorTtl`. */
    lastErrorAt?: number;
    /** Per-entry TTL override (otherwise the cache default applies). */
    ttl?: number;
    /** Load/error status of the entry's most recent fetch. */
    async: AsyncState;
}

/**
 * Keyed cache with TTL-based expiry and per-key async load status.
 *
 * `get` is read-only; only `set`/`fetch` write entries and timestamps.
 * `fetch` composes {@link AsyncState.run}, so superseded or aborted runs do
 * not clobber newer state.
 */
export class AsyncCache<K, V> {
    private readonly _entries = observable.map<K, CacheEntry<V>>();

    constructor(private readonly options: AsyncCacheOptions) {
        makeAutoObservable<this, "_entries" | "options">(this, {
            _entries: false,
            options: false,
            get: false,
            isLoading: false,
            getError: false,
            clearError: false,
        });
    }

    /** The stored value under `key`, or undefined when absent or expired. */
    get(key: K): V | undefined {
        const entry = this._entries.get(key);
        if (!entry || this._isExpired(entry)) return undefined;
        return entry.value;
    }

    /** Store `value` under `key` with the current timestamp. */
    set(key: K, value: V, opts?: { ttl?: number }): void {
        this._evictIfNeeded(key);
        this._entries.set(key, {
            value,
            timestamp: Date.now(),
            ...(opts?.ttl !== undefined ? { ttl: opts.ttl } : {}),
            async: new AsyncState(),
        });
    }

    /**
     * Load `key` through `loader` and store the result. The loader receives
     * the previous (fresh) value so consumers can merge incrementally.
     *
     * Rejects when the loader rejects — the previous value stays stored and
     * the entry is marked errored; such an entry expires after `errorTtl`,
     * counted from the entry's most recent failed fetch. When the fetch
     * loses an abort race, resolves with the previous value and leaves the
     * entry untouched.
     */
    async fetch(
        key: K,
        loader: (prev: V | undefined) => Promise<V>,
        opts?: { signal?: AbortSignal; ttl?: number },
    ): Promise<V | undefined> {
        const prev = this.get(key);
        const entry = this._ensureEntry(key, opts?.ttl);

        try {
            const result = await entry.async.run(
                () => loader(prev),
                opts?.signal,
            );
            if (opts?.signal?.aborted) {
                return prev;
            }
            this._commitSuccess(key, entry, result, opts?.ttl);
            return result;
        } catch (error) {
            this._stampFailure(key, entry);
            throw error;
        }
    }

    /** The entry under `key`, created (with eviction) when absent. */
    private _ensureEntry(key: K, ttl?: number): CacheEntry<V> {
        let entry = this._entries.get(key);
        if (!entry) {
            this._evictIfNeeded(key);
            entry = this._createEntry(key, ttl);
        }
        return entry;
    }

    /** Store a successful fetch result, refreshing the entry's TTL anchor. */
    private _commitSuccess(
        key: K,
        entry: CacheEntry<V>,
        result: V,
        ttl?: number,
    ): void {
        const effectiveTtl = ttl ?? entry.ttl;
        runInAction(() => {
            this._entries.set(key, {
                value: result,
                timestamp: Date.now(),
                ...(effectiveTtl !== undefined ? { ttl: effectiveTtl } : {}),
                async: entry.async,
            });
        });
    }

    /**
     * Stamp the failure time on a rejected fetch — the `errorTtl` anchor.
     * Aborts settle at idle without an error and carry no anchor.
     */
    private _stampFailure(key: K, entry: CacheEntry<V>): void {
        if (!entry.async.error) return;
        runInAction(() => {
            this._entries.set(key, {
                ...entry,
                lastErrorAt: Date.now(),
            });
        });
    }

    private _createEntry(key: K, ttl?: number): CacheEntry<V> {
        const entry: CacheEntry<V> = {
            value: undefined,
            timestamp: Date.now(),
            ...(ttl !== undefined ? { ttl } : {}),
            async: new AsyncState(),
        };
        runInAction(() => {
            this._entries.set(key, entry);
        });
        return entry;
    }

    /** Remove the entry under `key`. */
    invalidate(key: K): void {
        this._entries.delete(key);
    }

    /** Remove all entries. */
    clear(): void {
        this._entries.clear();
    }

    /** Whether the entry under `key` is currently loading. */
    isLoading(key: K): boolean {
        return this._entries.get(key)?.async.isLoading ?? false;
    }

    /** Error message of the entry under `key`, or null. */
    getError(key: K): string | null {
        return this._entries.get(key)?.async.error ?? null;
    }

    /** Reset the entry's error state, keeping its value. */
    clearError(key: K): void {
        this._entries.get(key)?.async.reset();
    }

    private _isExpired(entry: CacheEntry<V>): boolean {
        if (entry.async.error && this.options.errorTtl !== undefined) {
            return (
                Date.now() - (entry.lastErrorAt ?? entry.timestamp) >
                this.options.errorTtl
            );
        }
        return Date.now() - entry.timestamp > (entry.ttl ?? this.options.ttl);
    }

    private _evictIfNeeded(key: K): void {
        const maxSize = this.options.maxSize;
        if (!maxSize || this._entries.has(key)) return;
        if (this._entries.size < maxSize) return;

        let oldestKey: K | undefined;
        let oldestTime = Infinity;
        for (const [entryKey, entry] of this._entries) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = entryKey;
            }
        }
        if (oldestKey !== undefined) {
            this._entries.delete(oldestKey);
        }
    }
}
