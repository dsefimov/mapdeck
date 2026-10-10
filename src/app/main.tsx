import React from "react";
import ReactDOM from "react-dom/client";
import { configureLogger } from "@core/lib/logger";
import { installGlobalErrorHandlers } from "./globalErrorHandlers";
import { appConfig } from "./appConfig";
import { joinAssetBase, loadRuntimeConfig } from "./runtimeConfig";
import { createMapdeck } from "./embed";
import { MapdeckRoot } from "./MapdeckRoot";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Root element not found");
}

// Demo assembly policy, not the library's: global error handlers stay the
// host's right, and the dev build is loud on purpose.
if (import.meta.env.DEV) {
    configureLogger("debug");
}
installGlobalErrorHandlers();

// The dogfood entry rides the public API: the instance owns boot and
// retry (MapdeckRoot wires the error screen's retry to restart()).
const reactRoot = ReactDOM.createRoot(rootElement);

async function launch(): Promise<void> {
    const runtime = await loadRuntimeConfig();
    const mapdeck = createMapdeck({
        // The empty value keeps appConfig's contract: a missing source type
        // fails initialization visibly, not silently. The built-in module
        // set is merged in by the facade — the demo has no modules of its own.
        defaultSourceType: appConfig.defaultSourceType ?? "",
        lazPerfWasmUrl: joinAssetBase(runtime.assetsBase, "laz-perf.wasm"),
    });

    reactRoot.render(
        <React.StrictMode>
            <MapdeckRoot mapdeck={mapdeck} />
        </React.StrictMode>,
    );
}

void launch();
