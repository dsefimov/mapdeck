/**
 * Generic keyed container for instance-scoped state (view models,
 * interaction controllers created outside a constructor list).
 *
 * Plain container: it holds no observable state of its own. Whether a stored
 * value is observable is decided by the value itself — MobX stores created via
 * `makeAutoObservable` are the intended payloads.
 */
export class StateStore {
    private readonly _state = new Map<string, unknown>();

    /**
     * Get the state under `key`, creating it via `factory` on first access.
     * The factory SHALL be invoked exactly once per key; the same instance
     * SHALL be returned on every subsequent access.
     */
    get<T>(key: string, factory: () => T): T {
        if (this._state.has(key)) {
            return this._state.get(key) as T;
        }
        const created = factory();
        this._state.set(key, created);
        return created;
    }

    /** Discard the state under `key` — the next `get` creates a fresh instance. */
    remove(key: string): void {
        this._state.delete(key);
    }

    /** Report whether state exists under `key`. */
    has(key: string): boolean {
        return this._state.has(key);
    }

    /**
     * Read existing state without creating it — for consumers that may only
     * use state someone else owns (e.g. a view model before its first
     * open). Returns undefined when the key is absent.
     */
    peek<T>(key: string): T | undefined {
        return this._state.has(key) ? (this._state.get(key) as T) : undefined;
    }

    /**
     * Dispose every entry that acquired resources, then clear the container
     *: the disposal contract reaches keyed instance state, so a
     * restart releases instance-scoped state created outside the
     * constructor list.
     */
    dispose(): void {
        for (const value of this._state.values()) {
            if (
                typeof value === "object" &&
                value !== null &&
                "dispose" in value &&
                typeof (value as { dispose: unknown }).dispose === "function"
            ) {
                (value as { dispose: () => void }).dispose();
            }
        }
        this._state.clear();
    }
}
