import { createContext, type ReactNode } from "react";
import type { StoreRegistry } from "@core/store-registry";

/** React context carrying the {@link StoreRegistry}; null until the provider mounts. */
export const StoreContext = createContext<StoreRegistry | null>(null);

export interface StoreProviderProps {
    children: ReactNode;
    store: StoreRegistry;
}

/** Mounts the registry into React context — the single source for {@link useRootStore}. */
export function StoreProvider({
    children,
    store,
}: Readonly<StoreProviderProps>) {
    return (
        <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    );
}
