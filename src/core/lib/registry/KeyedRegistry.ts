import { logger } from "@core/lib/logger";
import type { RegisterOptions } from "./Registry";

/**
 * Unique-key registry: `key → T`, where the key is external to the item.
 *
 * The single home of the registration-override semantics: registering under
 * an occupied key throws — the extension set is fixed at build time, so an
 * accidental duplicate is a programming error caught at startup; a
 * deliberate replacement passes `{ override: true }` and is visible as a
 * logged warning. `Registry` (items carrying their own `id`) delegates
 * here, and the domain's externally-keyed registries compose it.
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
        if (this._entries.has(key)) {
            if (!opts?.override) {
                throw new Error(
                    `${this.label} "${String(key)}" is already registered.`,
                );
            }
            logger.warn(
                `${this.label} registry: overriding "${String(key)}" (explicit override).`,
            );
        }
        this._entries.set(key, item);
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
