/**
 * Protocol-related types for the protocol-based layer node system.
 *
 * ProtocolBinding links a node to a protocol at a specific endpoint.
 * LayerStyle defines the visual appearance in Mapbox GL format.
 * Legend and RelatedObject provide metadata for UI display.
 */

import type {
    LayerAdapter,
    RenderDescriptor,
    RenderUnit,
    AttributeFetchRequest,
    AttributeFetchResult,
} from "@core/contracts";
import type { RegisterOptions } from "@core/lib/registry";
import type { AssetRule, ProtocolSlots } from "./asset-mapping";

/** Links a layer node to a protocol at a specific data source. */
export interface ProtocolBinding {
    /** Key into ProtocolRegistry (e.g. "wms", "xyz", "copc") */
    readonly protocolId: string;
    /** Base endpoint URL (no query parameters) */
    readonly sourceUrl: string;
    /** Protocol-specific parameters — single source of truth */
    readonly params: Record<string, unknown>;
}

/** Mapbox GL style layer specification — protocol-agnostic visual styling. */
export interface LayerStyle {
    readonly type?:
        | "fill"
        | "line"
        | "circle"
        | "symbol"
        | "raster"
        | "heatmap"
        | "fill-extrusion"
        | "hillshade"
        | "background";
    readonly paint?: Record<string, unknown>;
    readonly layout?: Record<string, unknown>;
    readonly minzoom?: number;
    readonly maxzoom?: number;
    readonly filter?: unknown[];
    readonly metadata?: Record<string, unknown>;
}

/** Legend metadata. */
export interface Legend {
    readonly title?: string;
    readonly url?: string;
}

/** Related object — a linked resource (collection, report, dataset, etc.). */
export interface RelatedObject {
    readonly id: string;
    readonly title: string;
    /** Relationship kind: "collection", "item", "report", "dataset", etc. */
    readonly type: string;
    readonly sourceUrl?: string;
    readonly description?: string;
}

/**
 * Standard contract for interacting with a remote data source.
 *
 * A protocol defines how to render data on a map and optionally
 * how to fetch attribute data. It carries no role-resolution state:
 * which slot a protocol serves on a given node is decided by the
 * source that creates the node.
 *
 * @typeParam C - Protocol-specific config type for RenderDescriptor
 */
export interface Protocol<C = Record<string, unknown>> {
    /** Unique protocol identifier (e.g. "wms", "xyz", "copc") */
    readonly id: string;

    /** Human-readable label for UI */
    readonly label: string;

    /** Style applied when the data source provides no style of its own. */
    readonly defaultStyle: LayerStyle;

    createRenderDescriptor(
        sourceUrl: string,
        style?: LayerStyle,
        params?: Record<string, unknown>,
    ): RenderDescriptor<C>;

    getLayerAdapter(): LayerAdapter;

    /** Optional: group render units for batching (e.g. WMS). */
    groupRenderUnits?(renderUnits: Map<string, RenderUnit>): void;

    fetchAttributes?(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult>;
}

/**
 * What a protocol's registration declares alongside the protocol itself:
 * how the asset mapper serves it. Knowledge a protocol's author owns —
 * its slot fitness and its asset-matching rules — arrives with the
 * protocol in one call.
 */
export interface ProtocolDeclaration {
    /** Slot fitness the mapper serves this protocol with. */
    readonly slots?: ProtocolSlots;
    /** Rules claiming source assets for this protocol. */
    readonly rules?: readonly AssetRule[];
}

/**
 * Read-only view of the registered protocol set — the port through which
 * map and layer-tree consume protocols without depending on their domain.
 * Registration happens in the composition root only.
 */
export interface ProtocolRegistry {
    getById(id: string): Protocol | undefined;

    getAll(): Protocol[];
}

/**
 * Registration view of the protocol set — the port through which modules
 * add their own protocols on top of the built-in set. Extends
 * the read-only {@link ProtocolRegistry} that tool panels and domains see.
 */
export interface ProtocolRegistrationPort extends ProtocolRegistry {
    /**
     * Duplicates throw unless `opts.override`. A declaration registers
     * its slots and rules with the asset mapper under the same options.
     */
    register(
        protocol: Protocol,
        opts?: RegisterOptions,
        declaration?: ProtocolDeclaration,
    ): void;
}
