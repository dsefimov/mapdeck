import { logger } from "../logger";

/**
 * Generic keyed container for instance-scoped state (view models,
 * interaction controllers created outside a constructor list).
 */
export class StateStore {
    private readonly _state = new Map<string, unknown>();

    /** Create via `factory` on first access; the same instance afterwards. */
    get<T>(key: string, factory: () => T): T {
        if (this._state.has(key)) {
            return this._state.get(key) as T;
        }
        const created = factory();
        this._state.set(key, created);
        return created;
    }

    /** Discard the entry, disposing it first — the next `get` creates a fresh instance. */
    remove(key: string): void {
        const value = this._state.get(key);
        this._state.delete(key);
        disposeQuietly(value);
    }

    /** Read without creating; undefined when the key is absent. */
    peek<T>(key: string): T | undefined {
        return this._state.has(key) ? (this._state.get(key) as T) : undefined;
    }

    /**
     * Dispose every entry that acquired resources and clear the
     * container. Entries release in reverse creation order; the
     * container clears before disposal, so a dispose that re-enters
     * the store sees no stale entries.
     */
    dispose(): void {
        const values = [...this._state.values()].reverse();
        this._state.clear();
        for (const value of values) disposeQuietly(value);
    }
}

interface DisposableResource {
    dispose(): void;
}

function isDisposable(value: unknown): value is DisposableResource {
    return (
        typeof value === "object" &&
        value !== null &&
        "dispose" in value &&
        typeof value.dispose === "function"
    );
}

/** Dispose a value; a failing dispose is logged, not thrown. */
function disposeQuietly(value: unknown): void {
    if (!isDisposable(value)) return;
    try {
        value.dispose();
    } catch (error) {
        logger.error("StateStore: dispose failed", error);
    }
}
