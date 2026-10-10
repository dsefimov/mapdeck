import type { RegisterOptions } from "./Registry";
import { applyRegistration } from "./applyRegistration";

/**
 * Unique-key registry: `key → T`, where the key is external to the item.
 *
 * The registration-override semantics live in `applyRegistration` — this
 * class is its Map-owning wrapper. `Registry` (items carrying their own
 * `id`) delegates here, and the domain's externally-keyed registries
 * compose it.
 */
export class KeyedRegistry<K, T> {
    private readonly _entries = new Map<K, T>();

    /**
     * @param label - names the entries in error/warning messages,
     *   e.g. "Feature provider".
     */
    constructor(private readonly label: string) {}

    /** Register an item under `key`. Throws on an occupied key unless
     * `override` is set. */
    register(key: K, item: T, opts?: RegisterOptions): void {
        applyRegistration(this._entries, {
            label: this.label,
            key,
            item,
            opts,
        });
    }

    /** Get the item by key, or `undefined` when absent. */
    get(key: K): T | undefined {
        return this._entries.get(key);
    }

    /** Report whether the key is registered. */
    has(key: K): boolean {
        return this._entries.has(key);
    }

    /** All items in registration order. */
    getAll(): T[] {
        return Array.from(this._entries.values());
    }
}
