import { observer } from "mobx-react-lite";
import { StoreProvider } from "@core/shell";
import { LoadingScreen, ErrorScreen } from "@core/ui/components";
import MapWorkspace from "./MapWorkspace";
import { ErrorBoundary } from "./ErrorBoundary";
import type { MapdeckInstance } from "./embed";

interface MapdeckRootProps {
    /** The library handle from `createMapdeck`. */
    readonly mapdeck: MapdeckInstance;
}

// The instance (not the store context) carries the boot state: the store
// is replaced on restart, and the gate re-renders through the instance's
// observability.
const MapdeckContent = observer(({ mapdeck }: MapdeckRootProps) => {
    if (mapdeck.initError) {
        const dict = mapdeck.store.localeStore.t("core");
        return (
            <ErrorScreen
                message={mapdeck.initError}
                onRetry={() => void mapdeck.restart()}
                dict={dict}
            />
        );
    }

    if (!mapdeck.isInitialized) {
        return <LoadingScreen />;
    }

    return (
        <ErrorBoundary rootStore={mapdeck.store}>
            <MapWorkspace />
        </ErrorBoundary>
    );
});

/**
 * The library's root component: a token-carrying container (`.mapdeck-root`)
 * hosting the full workspace behind the store provider and the boot gate —
 * error screen, loading screen, or the mounted workspace.
 */
export const MapdeckRoot = ({ mapdeck }: MapdeckRootProps) => (
    <div className="mapdeck-root">
        <StoreProvider store={mapdeck.store}>
            <MapdeckContent mapdeck={mapdeck} />
        </StoreProvider>
    </div>
);
