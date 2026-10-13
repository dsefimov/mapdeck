import type { StoreRegistry } from "@core/store-registry";
import type { Protocol, ProtocolSlots } from "@core/contracts";
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

/** One built-in protocol: its builder with its asset-mapping declaration. */
interface BuiltinProtocolEntry {
    readonly id: string;
    readonly slots: ProtocolSlots;
    readonly build: (opts: ProtocolRegistrationOptions) => Protocol;
}

const COG_PROTOCOL_ID = "copc";
const VECTOR_TILE_PROTOCOL_ID = "vector-tile";
const WMS_PROTOCOL_ID = "wms";
const GEOJSON_TILED_PROTOCOL_ID = "geojson-tiled";

/**
 * The built-in protocol set. Each entry declares its own slot fitness —
 * the knowledge lives with the protocol, not in a mapping table — and
 * applies at registration (ADR-0018).
 */
const BUILTIN_PROTOCOLS: readonly BuiltinProtocolEntry[] = [
    {
        id: WMS_PROTOCOL_ID,
        slots: { renderer: 100 },
        build: () => new WmsProtocol(),
    },
    {
        id: "xyz",
        slots: { renderer: 100 },
        build: () => createXyzProtocol(),
    },
    { id: "cog", slots: {}, build: () => createCogProtocol() },
    {
        id: COG_PROTOCOL_ID,
        slots: { renderer: 90 },
        build: (opts) => new CopcProtocol(opts.lazPerfWasmUrl),
    },
    {
        id: VECTOR_TILE_PROTOCOL_ID,
        slots: { renderer: 80 },
        build: () => new VectorTileProtocol(),
    },
    {
        id: GEOJSON_TILED_PROTOCOL_ID,
        slots: { renderer: 70 },
        build: () => createGeoJsonTiledProtocol(),
    },
    {
        id: "wfs",
        slots: { data: 100 },
        build: () => new WfsProtocol(new WfsAttributeAdapter()),
    },
    {
        id: "ogc-features",
        slots: { renderer: 70, data: 100 },
        build: () => new OgcFeaturesProtocol(new OgcFeaturesAttributeAdapter()),
    },
];

/** The built-in slot declarations, keyed by protocol id — derived, never duplicated. */
export const BUILTIN_PROTOCOL_SLOTS: Readonly<Record<string, ProtocolSlots>> =
    Object.fromEntries(
        BUILTIN_PROTOCOLS.filter(
            (entry) => Object.keys(entry.slots).length > 0,
        ).map((entry) => [entry.id, entry.slots]),
    );

/**
 * Protocols whose layers a feature provider can answer for. Every other
 * visible layer gets the honest "not available" placeholder — a new protocol
 * adds its id here (at its own registration site), never edits a provider.
 */
const FEATURE_SERVED_PROTOCOLS = new Set([
    WMS_PROTOCOL_ID,
    VECTOR_TILE_PROTOCOL_ID,
    COG_PROTOCOL_ID,
    GEOJSON_TILED_PROTOCOL_ID,
    "wfs",
    "ogc-features",
]);

/**
 * Protocols that render layers natively on the base map (maplibre layers
 * carrying the node id) — the slice the "vector" provider queries.
 */
const NATIVE_RENDER_PROTOCOLS = new Set([VECTOR_TILE_PROTOCOL_ID, GEOJSON_TILED_PROTOCOL_ID]);

/**
 * Register the protocol domain's built-ins: protocols (each with its
 * asset-mapping declaration) and feature providers. Duplicate ids throw —
 * a bootstrap retry runs against a fresh store.
 */
export function registerProtocols(
    rootStore: StoreRegistry,
    options: ProtocolRegistrationOptions = {},
): void {
    for (const { build, slots } of BUILTIN_PROTOCOLS) {
        rootStore.protocolRegistry.register(
            build(options),
            undefined,
            Object.keys(slots).length > 0 ? { slots } : undefined,
        );
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
    providers.register(WMS_PROTOCOL_ID, new WmsFeatureProvider());
    providers.register(
        "unsupported",
        createUnsupportedPlaceholderProvider(FEATURE_SERVED_PROTOCOLS),
    );
}
