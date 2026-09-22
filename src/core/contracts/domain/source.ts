/**
 * Source adapter interface for data source integration.
 *
 * Source adapters are responsible for fetching data from external sources
 * (STAC catalogs, GeoJSON files, WMS services, etc.) and converting them
 * into tree nodes with proper role, configuration, and source references.
 */
import { type TreeNode } from "./tree";
import type { RegisterOptions } from "@core/lib/registry";

/** Fetches data from an external source and converts it into tree nodes. */
export interface SourceAdapter {
    /**
     * Unique identifier for the adapter type (e.g., 'stac', 'geojson', 'wms')
     */
    readonly type: string;

    /**
     * Fetch root nodes from the data source.
     * @returns Promise resolving to array of root TreeNode objects
     */
    fetchRoot(): Promise<TreeNode[]>;

    /**
     * Fetch child nodes for a parent node.
     * @param parent - Parent node to fetch children for
     * @returns Promise resolving to array of TreeNode objects
     */
    fetchChildren(parent: TreeNode): Promise<TreeNode[]>;

    /**
     * Initialize the adapter with configuration.
     *
     * Lifecycle: may be called again at any time — including after
     * `dispose()` — and must re-initialize from `config` alone. The store
     * re-initializes its adapter when the data-source URL setting changes,
     * on the same registered instance.
     *
     * @param config - Adapter-specific configuration
     */
    initialize(config: Record<string, unknown>): void;

    /**
     * Clean up resources held by this adapter. Releases the current
     * initialization; the adapter stays registered and re-initializable.
     */
    dispose(): void;
}

/**
 * Port over the source-adapter factory (ADR-0004): what a module registers
 * through and what the layer-tree domain reads from. Deliberately carries no
 * `setDefault` — the default source type is assembly policy (ADR-0005).
 */
export interface SourceAdapterFactory {
    /**
     * Register an adapter under its type. Duplicate types throw unless
     * `opts.override` — the explicit replacement of ADR-0005.
     */
    register(
        adapter: SourceAdapter,
        config?: Record<string, unknown>,
        opts?: RegisterOptions,
    ): void;
    /** The adapter for `type`, or `undefined` when none is registered. */
    get(type?: string): SourceAdapter | undefined;
}
