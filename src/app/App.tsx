import { observer } from "mobx-react-lite";
import { StoreProvider, useRootStore, RootStore } from "@core/framework/store";
import { LoadingScreen, ErrorScreen } from "@core/ui/components";
import MapWorkspace from "./workspace";

// Singleton: intentional, persists across HMR cycles
const rootStore = new RootStore();

rootStore.initialize();

const AppContent = observer(() => {
    const rootStore = useRootStore();

    if (rootStore.initError) {
        const dict = rootStore.localeStore.t("core");
        return (
            <ErrorScreen
                message={rootStore.initError}
                onRetry={() => rootStore.initialize()}
                dict={dict}
            />
        );
    }

    if (!rootStore.isInitialized) {
        return <LoadingScreen />;
    }

    return <MapWorkspace />;
});

const App = () => {
    return (
        <StoreProvider store={rootStore}>
            <AppContent />
        </StoreProvider>
    );
};

export default App;
