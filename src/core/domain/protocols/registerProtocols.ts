import type { StoreRegistry } from "@core/store-registry";
import type { Protocol } from "@core/contracts";
import { WfsAttributeAdapter } from "./wfs/WfsAttributeAdapter";
import { OgcFeaturesAttributeAdapter } from "./ogc-features/OgcFeaturesAttributeAdapter";
import { WmsProtocol } from "./wms/WmsProtocol";
import { createXyzProtocol } from "./xyz/XyzProtocol";
import { createCogProtocol } from "./cog/CogProtocol";
import {
    CopcProtocol,
    OverlayFeatureProvider,
} from "./copc";
import { VectorTileProtocol } from "./vector-tile/VectorTileProtocol";
import { VectorFeatureProvider } from "./vector-tile/VectorFeatureProvider";
import { createGeoJsonTiledProtocol } from "./geojson-tiled/GeoJsonTiledProtocol";
import { WfsProtocol } from "./wfs/WfsProtocol";
import { WmsFeatureProvider } from "./wms/WmsFeatureProvider";
import { OgcFeaturesProtocol } from "./ogc-features/OgcFeaturesProtocol";
import { createUnsupportedPlaceholderProvider } from "./logic/unsupportedPlaceholders";

/** Deployment-tunable knobs the composition root may pass in. */
export interface ProtocolRegistrationOptions {
    /** Where the LazPerf decoder binary lives (runtime-config's asset base). */
    readonly lazPerfWasmUrl?: string;
}

const PROTOCOL_BUILDERS: Array<(opts: ProtocolRegistrationOptions) => Protocol> =
    [
        () => new WmsProtocol(),
        () => createXyzProtocol(),
        () => createCogProtocol(),
        (opts) => new CopcProtocol(opts.lazPerfWasmUrl),
        () => new VectorTileProtocol(),
        () => createGeoJsonTiledProtocol(),
        () => new WfsProtocol(new WfsAttributeAdapter()),
        () => new OgcFeaturesProtocol(new OgcFeaturesAttributeAdapter()),
    ];

/**
 * Protocols whose layers a feature provider can answer for. Every other
 * visible layer gets the honest "not available" placeholder — a new protocol
 * adds its id here (at its own registration site), never edits a provider.
 */
const FEATURE_SERVED_PROTOCOLS = new Set([
    "wms",
    "vector-tile",
    "copc",
    "geojson-tiled",
    "wfs",
    "ogc-features",
]);

/**
 * Protocols that render layers natively on the base map (maplibre layers
 * carrying the node id) — the slice the "vector" provider queries.
 */
const NATIVE_RENDER_PROTOCOLS = new Set(["vector-tile", "geojson-tiled"]);

/**
 * Register the protocol domain's built-ins: protocols and feature providers.
 * Duplicate ids throw — a bootstrap retry runs against a fresh store.
 */
export function registerProtocols(
    rootStore: StoreRegistry,
    options: ProtocolRegistrationOptions = {},
): void {
    for (const build of PROTOCOL_BUILDERS) {
        rootStore.protocolRegistry.register(build(options));
    }

    const providers = rootStore.featureProviderRegistry;
    providers.register(
        "overlay",
        new OverlayFeatureProvider(
            () => rootStore.mapStore.context,
            rootStore.protocolRegistry,
        ),
    );
    providers.register(
        "vector",
        new VectorFeatureProvider(NATIVE_RENDER_PROTOCOLS),
    );
    providers.register("wms", new WmsFeatureProvider());
    providers.register(
        "unsupported",
        createUnsupportedPlaceholderProvider(FEATURE_SERVED_PROTOCOLS),
    );
}
