import { observer } from "mobx-react-lite";
import { StoreProvider } from "@core/shell";
import { LoadingScreen, ErrorScreen } from "@core/ui/components";
import MapWorkspace from "./MapWorkspace";
import { ErrorBoundary } from "./ErrorBoundary";
import type { RootStore } from "./rootStore";

interface AppProps {
    store: RootStore;
    /**
     * Restarts the app on a fresh store; wired by the composition root
     * (main.tsx). Absent — the retry button is hidden.
     */
    readonly onRestart?: (() => void) | undefined;
}

// The store arrives as a prop, not via useRootStore: the init screen reads
// `initError`/`isInitialized`, which live on RootStore, beyond the
// StoreRegistry port the context provides.
const AppContent = observer(({ store, onRestart }: AppProps) => {
    if (store.initError) {
        const dict = store.localeStore.t("core");
        return (
            <ErrorScreen
                message={store.initError}
                onRetry={onRestart}
                dict={dict}
            />
        );
    }

    if (!store.isInitialized) {
        return <LoadingScreen />;
    }

    return (
        <ErrorBoundary rootStore={store}>
            <MapWorkspace />
        </ErrorBoundary>
    );
});

/** App shell: provides the store, switches between loading/error/workspace. */
const App = ({ store, onRestart }: AppProps) => {
    return (
        <StoreProvider store={store}>
            <AppContent store={store} onRestart={onRestart} />
        </StoreProvider>
    );
};

export default App;
