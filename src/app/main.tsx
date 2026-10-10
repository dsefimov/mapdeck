import React from "react";
import ReactDOM from "react-dom/client";
import { RootStore } from "./rootStore";
import { configureMobX } from "./mobxConfig";
import { installGlobalErrorHandlers } from "./globalErrorHandlers";
import { appConfig } from "./appConfig";
import { joinAssetBase, loadRuntimeConfig } from "./runtimeConfig";
import { builtInModules } from "@modules/registerModules";
import "./index.css";
import App from "./App";
import { bootstrap } from "./bootstrap";

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Root element not found");
}

configureMobX();
installGlobalErrorHandlers();

// Composition root: the only module that creates stores and starts the app.
// Each launch owns a fresh RootStore — the previous one is disposed first, so
// a retry registers into empty registries instead of re-registering into
// populated ones.
const reactRoot = ReactDOM.createRoot(rootElement);
let currentStore: RootStore | null = null;

async function launch(): Promise<void> {
    currentStore?.dispose();
    const store = new RootStore();
    currentStore = store;
    reactRoot.render(
        <React.StrictMode>
            <App store={store} onRestart={launch} />
        </React.StrictMode>,
    );
    const runtime = await loadRuntimeConfig();
    void bootstrap(store, {
        // The empty value keeps appConfig's contract: a missing source type
        // fails initialization visibly, not silently.
        defaultSourceType: appConfig.defaultSourceType ?? "",
        lazPerfWasmUrl: joinAssetBase(runtime.assetsBase, "laz-perf.wasm"),
        modules: builtInModules,
    });
}

void launch();
