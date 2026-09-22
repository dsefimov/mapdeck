import { KeyedRegistry } from "./KeyedRegistry";

/** Registration modifiers — the explicit replacement escape of ADR-0005. */
export interface RegisterOptions {
    /** Replace an existing entry with the same id (logs a warning). */
    override?: boolean;
}

/**
 * Unique-id registry: `id → T`, where the item carries its own `id`.
 *
 * Registering an entry whose id is already present throws — the extension set
 * is fixed at build time, so an accidental duplicate is a programming error
 * caught at startup. A deliberate replacement passes `{ override: true }` and
 * is visible as a logged warning (ADR-0005). The mechanics live in
 * {@link KeyedRegistry}; this is the own-id specialization.
 */
export class Registry<T extends { id: string }> {
    private readonly _keyed = new KeyedRegistry<string, T>("Item");

    /** Register an entry. Throws on a duplicate id unless `override` is set. */
    register(item: T, opts?: RegisterOptions): void {
        this._keyed.register(item.id, item, opts);
    }

    /** Get the entry by id, or `undefined` when absent. */
    get(id: string): T | undefined {
        return this._keyed.get(id);
    }

    /** Report whether an entry with the given id is registered. */
    has(id: string): boolean {
        return this._keyed.has(id);
    }

    /** All registered entries in registration order. */
    getAll(): T[] {
        return this._keyed.getAll();
    }
}
