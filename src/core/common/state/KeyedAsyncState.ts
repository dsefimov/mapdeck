import { makeAutoObservable, observable } from "mobx";
import { AsyncState } from "./AsyncState";

/**
 * Keyed set of {@link AsyncState} instances. Outcomes are isolated per key;
 * an aggregate loading query without a key reports whether any operation is
 * loading.
 */
export class KeyedAsyncState<K extends string> {
    private readonly _states = observable.map<K, AsyncState>();

    constructor() {
        makeAutoObservable(this);
    }

    /** Run `fn` under `key`, creating the key's state on first use. */
    run<T>(key: K, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        return this.get(key).run(fn, signal);
    }

    /** Get (or create) the state under `key`. */
    get(key: K): AsyncState {
        let state = this._states.get(key);
        if (!state) {
            state = new AsyncState();
            this._states.set(key, state);
        }
        return state;
    }

    /**
     * Loading query: with a key — that key's state; without a key — whether at
     * least one operation is loading. Read-only: no state is created.
     */
    isLoading(key?: K): boolean {
        if (key !== undefined) {
            return this._states.get(key)?.isLoading ?? false;
        }
        for (const state of this._states.values()) {
            if (state.isLoading) return true;
        }
        return false;
    }

    /** Discard the state under `key`, or all states when no key is given. */
    reset(key?: K): void {
        if (key !== undefined) {
            this._states.delete(key);
            return;
        }
        this._states.clear();
    }
}
