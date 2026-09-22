import { useContext } from "react";
import { StoreContext } from "./StoreProvider";
import type { StoreRegistry } from "@core/store-registry";

/**
 * The store registry from context. Throws when used outside a
 * `StoreProvider` — a missing registry is a wiring error, not a runtime state.
 */
export function useRootStore(): StoreRegistry {
    const rootStore = useContext(StoreContext);

    if (!rootStore) {
        throw new Error(
            "useRootStore must be used within a StoreProvider. " +
                "Wrap your application with <StoreProvider store={rootStore}>.",
        );
    }

    return rootStore;
}
